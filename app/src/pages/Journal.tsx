import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db } from "../db";
import { BackHeader, useToast } from "../ui";
import { formatDate, MOODS, todayISO } from "../utils";

export function Journal({ onBack }: { onBack: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const entry = useLiveQuery(() => db.journal.where("date").equals(date).first(), [date]);
  const recent = useLiveQuery(() => db.journal.orderBy("date").reverse().limit(30).toArray(), []);
  const [text, setText] = useState("");
  const [mood, setMood] = useState(3);

  useEffect(() => {
    setText(entry?.text ?? "");
    setMood(entry?.mood ?? 3);
  }, [entry?.id, date]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (entry?.id) await db.journal.update(entry.id, { text, mood });
    else await db.journal.add({ date, text, mood, createdAt: Date.now() });
    toast("انحفظت ✓");
  }

  return (
    <>
      <BackHeader title="يومياتي" onBack={onBack} />
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <b>{formatDate(date)}</b>
          <input type="date" className="input" style={{ width: "auto" }} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="muted small" style={{ marginBottom: 6 }}>كيف كان مزاجك؟</div>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          {MOODS.map((m, i) => (
            <button key={i} onClick={() => setMood(i + 1)} style={{ fontSize: 30, border: 0, background: mood === i + 1 ? "var(--card-2)" : "transparent", borderRadius: 14, padding: "4px 8px", opacity: mood === i + 1 ? 1 : 0.45, cursor: "pointer" }}>{m}</button>
          ))}
        </div>
        <textarea className="textarea" style={{ minHeight: 200 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="وش صار في يومك؟ وش حسيت؟ وش تعلمت؟ (مايك الكيبورد 🎙️ يسهّلها)" />
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={save} disabled={!text.trim()}>احفظ</button>
      </div>

      <div className="section-title">آخر الأيام</div>
      {(recent ?? []).filter((j) => j.date !== date).map((j) => (
        <div className="card" key={j.id} onClick={() => setDate(j.date)} style={{ cursor: "pointer" }}>
          <div className="row" style={{ justifyContent: "space-between" }}><b>{formatDate(j.date)}</b><span style={{ fontSize: 22 }}>{MOODS[j.mood - 1]}</span></div>
          <div className="muted" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{j.text}</div>
        </div>
      ))}
    </>
  );
}
