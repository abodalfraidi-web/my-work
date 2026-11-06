import { useLiveQuery } from "dexie-react-hooks";
import { MicButton, VoiceTextarea } from "../MicButton";
import { speakOut } from "../speech";
import { useMemo, useRef, useState } from "react";
import { correctWriting, friendlyError, makeDailyWords, roleplayReply, type DailyWordsT } from "../ai";
import { db, type VocabWord } from "../db";
import { Icon } from "../Icon";
import { addXP, areaStreak, DAILY_GOAL, getDaily, setDaily, speak, todayXP } from "../progress";
import { Markdown, Progress, Sheet, useAIText, useToast } from "../ui";
import { addDays, todayISO } from "../utils";
import { reviewWord } from "./Library";

function level() {
  try { return localStorage.getItem("masari.level") ?? "A2"; } catch { return "A2"; }
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

/* ---------- كلمات اليوم ---------- */

function TodayWords() {
  const toast = useToast();
  const daily = useLiveQuery(() => getDaily<DailyWordsT>("words"), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true); setError(null);
    try {
      const known = (await db.vocab.toArray()).map((v) => v.word);
      const res = await makeDailyWords(level(), known);
      const list = res.words.slice(0, 5);
      for (const w of list) {
        const word = w.word.toLowerCase().trim();
        if (await db.vocab.where("word").equals(word).first()) continue;
        await db.vocab.add({ word, meaning: w.meaning, example: w.example, nextReview: todayISO(), intervalDays: 1, reviews: 0, createdAt: Date.now() });
      }
      await setDaily("words", { words: list });
      await addXP("english", 5);
      toast("جات كلمات اليوم");
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }

  if (!daily) {
    return (
      <div className="card">
        <h3>كلمات اليوم <span className="badge">5</span></h3>
        <p className="muted small" style={{ marginTop: 0 }}>5 كلمات جديدة بمستواك ({level()})، مع النطق والمعنى ومثال. تنضاف لكلماتك وترجع لك بالمراجعة.</p>
        {error && <div className="error">{error}</div>}
        <button className="btn primary block" onClick={load} disabled={busy}>{busy ? "يجهّز كلماتك..." : "جيب كلمات اليوم"}</button>
      </div>
    );
  }
  return (
    <div className="card">
      <h3>كلمات اليوم <span className="badge teal">5 من 5</span></h3>
      {daily.words.map((w) => (
        <div className="list-item" key={w.word} style={{ alignItems: "flex-start" }}>
          <button className="icon-btn" aria-label={`انطق ${w.word}`} onClick={() => speak(w.word)}><Icon name="sound" size={18} /></button>
          <div className="grow">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b className="ltr" style={{ fontSize: 18 }}>{w.word}</b>
              <span className="muted small">{w.type}</span>
            </div>
            <div>{w.meaning}</div>
            <div className="muted small ltr" onClick={() => speak(w.example)} style={{ cursor: "pointer" }}>{w.example}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- اختبار بطرق متنوعة ---------- */

type Q = { word: VocabWord; mode: "meaning" | "type" | "listen"; options?: string[] };

function Quiz() {
  const toast = useToast();
  const today = todayISO();
  const all = useLiveQuery(() => db.vocab.toArray(), []);
  const due = useMemo(() => (all ?? []).filter((v) => v.nextReview <= today), [all, today]);
  const [qs, setQs] = useState<Q[] | null>(null);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<null | boolean>(null);
  const [score, setScore] = useState(0);

  function start() {
    const pool = shuffle(due).slice(0, 10);
    const modes: Q["mode"][] = ["meaning", "type", "listen"];
    setQs(pool.map((w, k) => {
      const mode = modes[k % 3];
      const others = shuffle((all ?? []).filter((x) => x.id !== w.id)).slice(0, 3).map((x) => x.meaning);
      return { word: w, mode, options: mode === "meaning" ? shuffle([w.meaning, ...others]) : undefined };
    }));
    setI(0); setScore(0); setFeedback(null); setAnswer("");
  }

  async function submit(given: string) {
    if (!qs) return;
    const q = qs[i];
    const ok = q.mode === "meaning" ? given === q.word.meaning : given.trim().toLowerCase() === q.word.word.toLowerCase();
    setFeedback(ok);
    if (ok) setScore(score + 1);
    await reviewWord(q.word, ok);
    if (q.mode !== "meaning") speak(q.word.word);
  }

  async function next() {
    if (!qs) return;
    if (i + 1 >= qs.length) {
      await addXP("english", score * 3);
      toast(`خلصت الاختبار: ${score} من ${qs.length}`);
      setQs(null);
      return;
    }
    setI(i + 1); setFeedback(null); setAnswer("");
  }

  if (!qs) {
    return (
      <div className="card">
        <h3>اختبر نفسك <span className="badge">{due.length} مستحقة</span></h3>
        <p className="muted small" style={{ marginTop: 0 }}>اختيار المعنى، كتابة الكلمة، وتسمعها وتكتبها. كل طريقة تثبّت الكلمة من جهة.</p>
        <button className="btn primary block" onClick={start} disabled={!due.length}>{due.length ? "ابدأ الاختبار" : "ما فيه كلمات مستحقة اليوم"}</button>
      </div>
    );
  }
  const q = qs[i];
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <span className="muted small">{q.mode === "meaning" ? "وش معنى الكلمة؟" : q.mode === "type" ? "اكتب الكلمة بالإنجليزي" : "اسمع واكتب الكلمة"}</span>
        <span className="badge">{i + 1} من {qs.length}</span>
      </div>
      <Progress value={i / qs.length} />
      <div style={{ textAlign: "center", margin: "16px 0" }}>
        {q.mode === "meaning" && <b className="ltr" style={{ fontSize: 28, display: "block", textAlign: "center" }}>{q.word.word}</b>}
        {q.mode === "type" && <b style={{ fontSize: 24 }}>{q.word.meaning}</b>}
        {q.mode === "listen" && <button className="btn primary" onClick={() => speak(q.word.word, 0.8)}><Icon name="sound" size={20} /> اسمع الكلمة</button>}
      </div>
      {q.mode === "meaning" ? (
        <div className="stack">
          {q.options!.map((o) => (
            <button key={o} className="btn block" disabled={feedback !== null}
              style={feedback !== null && o === q.word.meaning ? { background: "var(--accent)", color: "var(--accent-ink)" } : undefined}
              onClick={() => submit(o)}>{o}</button>
          ))}
        </div>
      ) : (
        <div className="row">
          <input id="quiz-answer" className="input ltr" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={feedback !== null}
            onKeyDown={(e) => { if (e.key === "Enter" && answer.trim() && feedback === null) submit(answer); }} />
          <button className="btn primary" onClick={() => submit(answer)} disabled={!answer.trim() || feedback !== null}>تحقق</button>
        </div>
      )}
      {feedback !== null && (
        <div style={{ marginTop: 12 }}>
          <div className={feedback ? "chip green" : "chip red"}>{feedback ? "صح" : `الصح: ${q.word.word} = ${q.word.meaning}`}</div>
          <div className="muted small ltr" style={{ marginTop: 6 }}>{q.word.example}</div>
          <button className="btn primary block" style={{ marginTop: 10 }} onClick={next}>{i + 1 >= qs.length ? "النتيجة" : "التالي"}</button>
        </div>
      )}
    </div>
  );
}

/* ---------- اكتب جملك ---------- */

function Writing() {
  const [text, setText] = useState("");
  const ai = useAIText();
  return (
    <div className="card">
      <h3>جملتك اليومية</h3>
      <p className="muted small" style={{ marginTop: 0 }}>اكتب 3 جمل بالإنجليزي عن يومك، والمساعد يصححها ويشرح القاعدة بالعربي.</p>
      <VoiceTextarea id="en-writing" lang="en-US" className="textarea ltr" value={text} onChange={setText} placeholder="Today I woke up early and... (or tap the mic and speak)" />
      {ai.error && <div className="error" style={{ marginTop: 8 }}>{ai.error}</div>}
      <button className="btn primary block" style={{ marginTop: 8 }} disabled={!text.trim() || ai.busy}
        onClick={async () => { const r = await ai.run((on) => correctWriting(text, on), friendlyError); if (r) await addXP("english", 10); }}>
        {ai.busy ? "يصحح..." : "صحّح لي"}
      </button>
      {ai.text && <div style={{ marginTop: 10 }}><Markdown text={ai.text} /></div>}
    </div>
  );
}

/* ---------- محادثة مواقف ---------- */

const SCENARIOS = [
  ["airport", "في المطار", "At the airport check-in counter. You are the airline agent."],
  ["interview", "مقابلة شغل", "A job interview for a junior position. You are the interviewer."],
  ["restaurant", "في المطعم", "At a restaurant. You are the waiter."],
  ["hotel", "في الفندق", "Checking into a hotel. You are the receptionist."],
  ["doctor", "عند الدكتور", "At a doctor's clinic. You are the doctor."],
  ["friend", "سوالف مع صديق", "Casual chat with a new friend from the UK about hobbies and weekend plans."],
] as const;

function Roleplay() {
  const [scenario, setScenario] = useState<(typeof SCENARIOS)[number] | null>(null);
  const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rpRef = useRef<HTMLInputElement>(null);

  async function send(text: string, base = msgs) {
    if (!scenario || !text.trim()) return;
    const history = [...base, { role: "user" as const, content: text.trim() }];
    setMsgs(history); setInput(""); setError(null); setStreaming("");
    try {
      const reply = await roleplayReply(scenario[2], level(), history, setStreaming);
      setMsgs([...history, { role: "assistant", content: reply }]);
      speakOut(reply.split("✏️")[0], "en-US", 0.95);
      await addXP("english", 4);
    } catch (e) { setError(friendlyError(e)); } finally { setStreaming(null); }
  }

  return (
    <div className="card">
      <h3>محادثة مواقف</h3>
      <div className="chips">{SCENARIOS.map((s) => (
        <button key={s[0]} className={`chip ${scenario?.[0] === s[0] ? "on" : ""}`} onClick={() => { setScenario(s); setMsgs([]); setError(null); }}>{s[1]}</button>
      ))}</div>
      <Sheet open={!!scenario} onClose={() => setScenario(null)} title={scenario ? scenario[1] : ""}>
        <div className="chat">
          {msgs.length === 0 && streaming === null && <button className="btn primary block" onClick={() => send("Hello!")}>ابدأ المحادثة</button>}
          {msgs.map((m, k) => {
            const [main, fix] = m.content.split("✏️");
            return (
              <div key={k} className={`bubble ${m.role} ltr`} style={{ whiteSpace: "pre-wrap" }}>
                {main.trim()}
                {m.role === "assistant" && <button className="btn ghost" style={{ padding: "2px 6px" }} aria-label="استمع" onClick={() => speak(main.trim())}><Icon name="sound" size={16} /></button>}
                {fix && <div className="muted small" style={{ direction: "rtl", textAlign: "right", marginTop: 6, borderTop: "1px solid var(--line)", paddingTop: 6 }}>✏️ {fix.trim()}</div>}
              </div>
            );
          })}
          {streaming !== null && <div className="bubble assistant ltr">{streaming.split("✏️")[0] || "..."}</div>}
          {error && <div className="error">{error}</div>}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <MicButton lang="en-US" focusRef={rpRef} inputId="rp-input" onText={(t, b) => setInput((b ? b + " " : "") + t)} onDone={(t, b) => send((b ? b + " " : "") + t)} />
          <input ref={rpRef} id="rp-input" className="input ltr" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type or use the mic..."
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) send(input); }} />
          <button className="btn primary" onClick={() => send(input)} disabled={!input.trim() || streaming !== null}><Icon name="send" size={18} /></button>
        </div>
        <p className="muted small">اضغط المايك وتكلم بالإنجليزي، ولما تسكت يرسل لحاله ويرد عليك بصوت.</p>
      </Sheet>
    </div>
  );
}

/* ---------- الصفحة ---------- */

export function EnglishDaily() {
  const xp = useLiveQuery(() => todayXP("english"), []);
  const streak = useLiveQuery(() => areaStreak("english"), []);
  const vocab = useLiveQuery(() => db.vocab.toArray(), []);
  const known = (vocab ?? []).filter((v) => v.reviews >= 2 && v.intervalDays >= 4).length;
  const yesterday = addDays(todayISO(), -1);
  void yesterday;
  return (
    <>
      <div className="hero">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b className="row" style={{ gap: 8 }}><Icon name="flame" size={22} className="title-icon" /><span><span className="hl orange">{streak ?? 0}</span> يوم متتالي</span></b>
          <span className="badge">{xp ?? 0} / {DAILY_GOAL} نقطة</span>
        </div>
        <div style={{ margin: "10px 0 6px" }}><Progress value={(xp ?? 0) / DAILY_GOAL} /></div>
        <div className="muted small">كلماتك: {vocab?.length ?? 0} · تعرفها جيداً: {known} · مستواك: {level()}</div>
      </div>
      <TodayWords />
      <Quiz />
      <Writing />
      <Roleplay />
    </>
  );
}
