import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { friendlyError, parseCapture, streamReply, updateProfileFrom, type CaptureActionT } from "../ai";
import { saveAction } from "../Capture";
import { EXPENSE_CATEGORIES } from "../utils";
import { useToast } from "../ui";
import { db } from "../db";
import { Icon } from "../Icon";
import { MicButton } from "../MicButton";
import { speakOut, stopSpeaking, useSpeech } from "../speech";
import { Header, Markdown, Sheet, ask } from "../ui";

const SUGGESTIONS = [
  "وش المفروض أسوي اليوم؟",
  "كيف أدائي هالأسبوع؟",
  "وين أصرف فلوسي أكثر؟",
  "ساعدني أرتب خطة لهدفي",
  "مين لازم أتواصل معه؟",
];

const CHAT_TASK = "أنت في محادثة مع المستخدم. جاوب على سؤاله باستخدام بياناته، واقترح خطوات عملية.";
const VOICE_TASK = `أنت الحين في مكالمة صوتية مع المستخدم، وأنت محاوره الشخصي وصديقه اللي يعرفه. ردّك بيتقرأ بصوت عالي.
- تكلم بكلام طبيعي قصير (جملتين إلى أربع)، باللهجة السعودية، بدون نقاط أو رموز أو إيموجي، كأنك قاعد معه.
- اهتم بيومه: تفاعل مع اللي قاله، واسأله سؤال متابعة واحد في كل رد عشان تفهمه أكثر (مشاعره، تفاصيل، ليش، وش ناوي).
- إذا قال معلومة غلط أو تناقض مع بياناته، أو قرر شي ممكن يضره، صحّح له بلطف ووضّح ليش.
- إذا تكلم بالإنجليزي وفيه غلط، صحّح الجملة بلطف وكمّل الحوار.
- استخدم ذاكرتك عنه وبياناته عشان يحس إنك فعلاً تعرفه (اذكر أسماء ناسه وأهدافه لما يناسب).
- لا تسجّل شي بنفسك: في نهاية المكالمة التطبيق يطلع المصاريف والمهام من كلامه ويحفظها.`;

async function history() {
  const h = (await db.chat.orderBy("createdAt").toArray()).slice(-20).map((m) => ({ role: m.role, content: m.content }));
  while (h.length && h[0].role !== "user") h.shift();
  return h;
}

/** محادثة صوتية متواصلة: تتكلم، يرد بصوت، ويرجع يسمعك. وفي النهاية يسجّل من كلامك */
function VoiceMode({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<"idle" | "listening" | "thinking" | "speaking" | "wrapup">("idle");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [session, setSession] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [actions, setActions] = useState<(CaptureActionT & { _on: boolean })[] | null>(null);
  const [wrapBusy, setWrapBusy] = useState(false);
  const active = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const speech = useSpeech("ar-SA", setHeard, { onSilence: (t) => respond(t), silenceMs: 1600 });

  useEffect(() => () => { active.current = false; stopSpeaking(); }, []);

  async function respond(text: string) {
    if (!text.trim() || !active.current) return;
    speech.stop();
    setState("thinking"); setReply(""); setError(null); setTyped("");
    const said = text.trim();
    setSession((s) => [...s, { role: "user", content: said }]);
    await db.chat.add({ role: "user", content: said, createdAt: Date.now() });
    try {
      const answer = await streamReply({ task: VOICE_TASK, messages: await history(), onText: setReply, effort: "low" });
      await db.chat.add({ role: "assistant", content: answer, createdAt: Date.now() });
      setSession((s) => [...s, { role: "assistant", content: answer }]);
      if (!active.current) return;
      setState("speaking");
      await speakOut(answer, "ar-SA");
      if (!active.current) return;
      listen();
    } catch (e) {
      setError(friendlyError(e)); setState("idle");
    }
  }

  function listen() {
    setHeard("");
    if (!speech.blocked && speech.start()) { setState("listening"); return; }
    setState("idle");
  }

  function tapOrb() {
    try { window.speechSynthesis?.speak(new SpeechSynthesisUtterance("")); } catch { /* ignore */ }
    if (state === "speaking") { stopSpeaking(); listen(); return; }
    if (state === "listening") { speech.stop(); if (heard) respond(heard); else setState("idle"); return; }
    if (state === "idle") listen();
  }

  /** نهاية المكالمة: نطلع المصاريف والمهام من كلامه، ونحدّث ذاكرة شخصيته */
  async function wrapUp() {
    speech.stop(); stopSpeaking();
    const userText = session.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    if (!userText.trim()) { close(); return; }
    setState("wrapup"); setWrapBusy(true); setError(null);
    updateProfileFrom(session).catch(() => {});
    try {
      const res = await parseCapture(userText, EXPENSE_CATEGORIES);
      setActions(res.actions.map((a) => ({ ...a, _on: true })));
    } catch (e) {
      setError(friendlyError(e)); setActions([]);
    } finally { setWrapBusy(false); }
  }

  async function saveAll() {
    const chosen = (actions ?? []).filter((a) => a._on);
    for (const a of chosen) await saveAction(a);
    toast(chosen.length ? `انحفظ ${chosen.length} من كلامك` : "تمام");
    close();
  }

  function close() { active.current = false; speech.stop(); stopSpeaking(); onClose(); }

  // إذا المايك المباشر ممنوع: مايك الكيبورد، ونرسل لما يوقف الكلام
  useEffect(() => {
    if (!typed.trim()) return;
    const t = setTimeout(() => respond(typed), 2200);
    return () => clearTimeout(t);
  }, [typed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === "wrapup") {
    return (
      <Sheet open onClose={close} title="سجّلت من كلامك">
        {wrapBusy && <div className="card empty">أراجع كلامك وأطلع المهم منه...</div>}
        {error && <div className="error">{error}</div>}
        {actions && actions.length === 0 && !wrapBusy && <div className="card empty">ما لقيت مصاريف أو مهام في كلامنا. حفظت اللي عرفته عنك في ذاكرتي.</div>}
        {actions?.map((a, i) => (
          <div className="card row" key={i} style={{ opacity: a._on ? 1 : 0.45 }}>
            <button className={`check ${a._on ? "on" : ""}`} onClick={() => setActions(actions.map((x, j) => (j === i ? { ...x, _on: !x._on } : x)))}>
              {a._on ? <Icon name="check" size={16} strokeWidth={2.6} /> : null}
            </button>
            <div className="grow">{a.summary}</div>
          </div>
        ))}
        {!wrapBusy && <button className="btn primary block" onClick={saveAll}>{actions?.some((a) => a._on) ? "احفظ وأقفل" : "أقفل"}</button>}
        <p className="muted small">وحدّثت ذاكرتي عنك من هالمحادثة، عشان أفهمك أكثر المرة الجاية.</p>
      </Sheet>
    );
  }

  const label = {
    idle: speech.blocked ? "اضغط الدائرة، بعدها اضغط المايك اللي في الكيبورد وتكلم" : "اضغط وتكلم",
    listening: "أسمعك...",
    thinking: "أفكر...",
    speaking: "أتكلم... اضغط عشان تقاطعني",
  }[state];

  return (
    <Sheet open onClose={wrapUp}>
      <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
        <div className="eyebrow" style={{ textAlign: "center" }}>MASARI · VOICE</div>
        <h2 style={{ margin: "4px 0 0" }}>سولف <span className="hl">معي</span></h2>
        {speech.blocked && state !== "speaking" ? (
          <label htmlFor="voice-typed" className={`voice-orb ${state}`} role="button" aria-label={label} onClick={() => { try { window.speechSynthesis?.speak(new SpeechSynthesisUtterance("")); } catch { /* ignore */ } }}>
            <Icon name="mic" size={48} strokeWidth={1.6} />
          </label>
        ) : (
          <button className={`voice-orb ${state}`} onClick={tapOrb} aria-label={label}>
            <Icon name={state === "speaking" ? "sound" : "mic"} size={48} strokeWidth={1.6} />
          </button>
        )}
        <div className="muted">{label}</div>
      </div>
      {heard && state !== "idle" && <div className="bubble user" style={{ margin: "12px 0 0", maxWidth: "100%" }}>{heard}</div>}
      {reply && <div className="bubble assistant" style={{ margin: "8px 0 0", maxWidth: "100%" }}><Markdown text={reply} /></div>}
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      {speech.blocked && (
        <input ref={inputRef} id="voice-typed" className="input" style={{ marginTop: 12 }} value={typed} onChange={(e) => setTyped(e.target.value)}
          placeholder="كلامك يطلع هنا..." />
      )}
      <button className="btn block" style={{ marginTop: 12 }} onClick={wrapUp}>خلّصنا (أسجّل المهم من كلامك)</button>
    </Sheet>
  );
}

export function Chat() {
  const messages = useLiveQuery(() => db.chat.orderBy("createdAt").toArray(), []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState(() => {
    try { const v = sessionStorage.getItem("masari.openVoice") === "1"; sessionStorage.removeItem("masari.openVoice"); return v; } catch { return false; }
  });
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages?.length, streaming]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming !== null) return;
    setInput(""); setError(null);
    await db.chat.add({ role: "user", content, createdAt: Date.now() });
    setStreaming("");
    try {
      const reply = await streamReply({ task: CHAT_TASK, messages: await history(), onText: setStreaming });
      await db.chat.add({ role: "assistant", content: reply, createdAt: Date.now() });
      const userCount = await db.chat.filter((m) => m.role === "user").count();
      if (userCount % 6 === 0) updateProfileFrom((await history()).slice(-12)).catch(() => {});
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setStreaming(null);
    }
  }

  return (
    <>
      <Header eyebrow="MASARI · ASSISTANT" title={<>مساعدك <span className="hl">الذكي</span></>} sub="يعرف أهدافك ويومك وفلوسك وناسك"
        right={<div className="row" style={{ gap: 6 }}>
          <button className="icon-btn" aria-label="محادثة صوتية" onClick={() => setVoice(true)} style={{ color: "var(--accent)" }}><Icon name="sound" size={20} /></button>
          {messages && messages.length > 0 && <button className="btn ghost" onClick={async () => (await ask("تمسح المحادثة؟")) && db.chat.clear()}>مسح</button>}
        </div>} />
      <button className="hero row" style={{ width: "100%", textAlign: "start", cursor: "pointer", gap: 12 }} onClick={() => setVoice(true)}>
        <span className="mic md" style={{ pointerEvents: "none" }}><Icon name="mic" size={20} /></span>
        <span className="grow"><b>محادثة صوتية</b><span className="muted small" style={{ display: "block" }}>تكلّم ويرد عليك بصوت، مثل المكالمة</span></span>
      </button>
      <div className="chat" style={{ paddingBottom: 80 }}>
        {messages?.length === 0 && streaming === null && (
          <div className="card">
            <p style={{ marginTop: 0 }}>هلا، أنا مساعدك. اسألني أي شي عن يومك وأهدافك.</p>
            <div className="chips">{SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {messages?.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            {m.role === "assistant" ? <>
              <Markdown text={m.content} />
              <button className="btn ghost" style={{ padding: "2px 4px" }} aria-label="اسمع الرد" onClick={() => speakOut(m.content, "ar-SA")}><Icon name="sound" size={16} /></button>
            </> : m.content}
          </div>
        ))}
        {streaming !== null && <div className="bubble assistant">{streaming ? <Markdown text={streaming} /> : "…"}</div>}
        {error && <div className="error">{error}</div>}
        <div ref={endRef} />
      </div>
      <div className="chat-input">
        <MicButton focusRef={inputRef} inputId="chat-input" onText={(t, base) => setInput((base ? base + " " : "") + t)} onDone={(t, b) => send((b ? b + " " : "") + t)} />
        <input ref={inputRef} id="chat-input" className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="اكتب أو اضغط المايك"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) send(input); }} />
        <button className="btn primary" onClick={() => send(input)} disabled={!input.trim() || streaming !== null} aria-label="إرسال"><Icon name="send" size={18} /></button>
      </div>
      {voice && <VoiceMode onClose={() => setVoice(false)} />}
    </>
  );
}
