import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { friendlyError, streamReply } from "../ai";
import { db } from "../db";
import { Header, Markdown, ask } from "../ui";

const SUGGESTIONS = [
  "وش المفروض أسوي اليوم؟",
  "كيف أدائي هالأسبوع؟",
  "وين أصرف فلوسي أكثر؟",
  "ساعدني أرتب خطة لهدفي",
  "مين لازم أتواصل معه؟",
];

export function Chat() {
  const messages = useLiveQuery(() => db.chat.orderBy("createdAt").toArray(), []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages?.length, streaming]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming !== null) return;
    setInput(""); setError(null);
    await db.chat.add({ role: "user", content, createdAt: Date.now() });
    const history = (await db.chat.orderBy("createdAt").toArray()).slice(-20).map((m) => ({ role: m.role, content: m.content }));
    // لازم أول رسالة تكون من المستخدم
    while (history.length && history[0].role !== "user") history.shift();
    setStreaming("");
    try {
      const reply = await streamReply({
        task: "أنت في محادثة مع المستخدم. جاوب على سؤاله باستخدام بياناته، واقترح خطوات عملية.",
        messages: history,
        onText: setStreaming,
      });
      await db.chat.add({ role: "assistant", content: reply, createdAt: Date.now() });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setStreaming(null);
    }
  }

  return (
    <>
      <Header title="المساعد" sub="يعرف أهدافك ويومك وفلوسك وناسك"
        right={messages && messages.length > 0 ? <button className="btn ghost" onClick={async () => (await ask("تمسح المحادثة؟")) && db.chat.clear()}>مسح</button> : undefined} />
      <div className="chat" style={{ paddingBottom: 80 }}>
        {messages?.length === 0 && streaming === null && (
          <div className="card">
            <p style={{ marginTop: 0 }}>هلا أنا مساعدك. اسألني أي شي عن يومك وأهدافك.</p>
            <div className="chips">{SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {messages?.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>{m.role === "assistant" ? <Markdown text={m.content} /> : m.content}</div>
        ))}
        {streaming !== null && <div className="bubble assistant">{streaming ? <Markdown text={streaming} /> : "…"}</div>}
        {error && <div className="error">{error}</div>}
        <div ref={endRef} />
      </div>
      <div className="chat-input">
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="اكتب أو استخدم المايك "
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) send(input); }} />
        <button className="btn primary" onClick={() => send(input)} disabled={!input.trim() || streaming !== null}>إرسال</button>
      </div>
    </>
  );
}
