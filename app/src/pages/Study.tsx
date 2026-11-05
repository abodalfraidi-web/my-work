import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db } from "../db";
import { Icon } from "../Icon";
import { BackHeader, useToast, ask } from "../ui";
import { addDays, shortDate, todayISO } from "../utils";
import { reviewMemo } from "./Today";

function Timer({ onFinish }: { onFinish: (minutes: number) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(() => {
    try { const v = localStorage.getItem("masari.timer"); return v ? Number(v) : null; } catch { return null; }
  });
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  function start() {
    const now = Date.now(); setStartedAt(now);
    try { localStorage.setItem("masari.timer", String(now)); } catch { /* ignore */ }
  }
  function stop() {
    setStartedAt(null);
    try { localStorage.removeItem("masari.timer"); } catch { /* ignore */ }
    onFinish(Math.max(1, Math.round(elapsed / 60)));
  }
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 52, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: 2 }}>{mm}:{ss}</div>
      {startedAt ? <button className="btn green block" onClick={stop}>خلصت</button>
        : <button className="btn primary block" onClick={start}>▶️ ابدأ جلسة مذاكرة</button>}
    </div>
  );
}

export function Study({ onBack }: { onBack: () => void }) {
  const toast = useToast();
  const today = todayISO();
  const [subject, setSubject] = useState(() => { try { return localStorage.getItem("masari.subject") ?? ""; } catch { return ""; } });
  const [minutes, setMinutes] = useState("");
  const [memoTitle, setMemoTitle] = useState("");
  const sessions = useLiveQuery(() => db.study.where("date").aboveOrEqual(addDays(today, -6)).toArray(), [today]);
  const memo = useLiveQuery(() => db.memo.orderBy("nextReview").toArray(), []);
  const subjects = [...new Set((sessions ?? []).map((s) => s.subject))];

  async function log(mins: number) {
    if (!mins) return;
    await db.study.add({ subject: subject.trim() || "عام", minutes: mins, note: "", date: today, createdAt: Date.now() });
    try { localStorage.setItem("masari.subject", subject); } catch { /* ignore */ }
    setMinutes(""); toast(`انسجلت ${mins} دقيقة`);
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const perDay = days.map((d) => (sessions ?? []).filter((s) => s.date === d).reduce((a, s) => a + s.minutes, 0));
  const max = Math.max(30, ...perDay);
  const week = perDay.reduce((a, b) => a + b, 0);

  return (
    <>
      <BackHeader title="المذاكرة والحفظ" onBack={onBack} />
      <div className="card">
        <input className="input" style={{ marginBottom: 10 }} placeholder="المادة أو الموضوع" value={subject} onChange={(e) => setSubject(e.target.value)} list="subjects" />
        <datalist id="subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
        <Timer onFinish={log} />
        <div className="row" style={{ marginTop: 10 }}>
          <input className="input" inputMode="numeric" placeholder="أو اكتب الدقائق يدوي" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          <button className="btn" onClick={() => log(Number(minutes))} disabled={!Number(minutes)}>سجّل</button>
        </div>
      </div>

      <div className="card">
        <h3>آخر 7 أيام <span className="muted small">{Math.round(week / 6) / 10} ساعة</span></h3>
        <div className="bars">
          {perDay.map((v, i) => (
            <div className="b" key={i}><div style={{ height: `${(v / max) * 100}%` }} /><span>{shortDate(days[i]).split(" ")[0]}</span></div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>الحفظ والمراجعة</h3>
        <p className="muted small" style={{ marginTop: 0 }}>كل مقطع تحفظه يرجع لك للمراجعة بفترات متباعدة (بكرة، بعد يومين، أسبوع...) عشان يثبت.</p>
        <div className="row">
          <input className="input" placeholder="مثال: سورة الملك ١-١٠" value={memoTitle} onChange={(e) => setMemoTitle(e.target.value)} />
          <button className="btn primary" disabled={!memoTitle.trim()} onClick={async () => {
            await db.memo.add({ title: memoTitle.trim(), addedOn: today, nextReview: addDays(today, 1), intervalDays: 1, reviews: 0, createdAt: Date.now() });
            setMemoTitle(""); toast("انضاف للحفظ");
          }}>+</button>
        </div>
        {(memo ?? []).map((m) => {
          const due = m.nextReview <= today;
          return (
            <div className="list-item" key={m.id}>
              <div className="grow">{m.title}<div className="muted small">{due ? "مستحق المراجعة الحين" : `المراجعة ${shortDate(m.nextReview)}`} · راجعته {m.reviews} مرة</div></div>
              {due ? <>
                <button className="btn ghost" style={{ color: "var(--danger)" }} onClick={() => reviewMemo(m, false)}>نسيت</button>
                <button className="btn green" onClick={() => reviewMemo(m, true)}><Icon name="check" size={16} /></button>
              </> : <button className="btn danger" onClick={async () => (await ask("تحذف؟")) && db.memo.delete(m.id!)}><Icon name="x" size={16} /></button>}
            </div>
          );
        })}
      </div>
    </>
  );
}
