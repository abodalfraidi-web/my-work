import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { friendlyError, morningBrief } from "../ai";
import { db, type MemoItem } from "../db";
import { Check, Markdown, Progress, Sheet, useAIText } from "../ui";
import { addDays, daysBetween, downloadICS, formatDate, greeting, money, settings, todayISO } from "../utils";

export function reviewMemo(m: MemoItem, remembered: boolean) {
  const today = todayISO();
  const interval = remembered ? Math.min(Math.max(1, Math.round(m.intervalDays * 2.2)), 120) : 1;
  return db.memo.update(m.id!, { intervalDays: interval, nextReview: addDays(today, interval), reviews: m.reviews + 1 });
}

export function TaskEditor({ open, onClose, initialDate }: { open: boolean; onClose: () => void; initialDate?: string }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate ?? todayISO());
  const [time, setTime] = useState("");
  const goals = useLiveQuery(() => db.goals.where("status").equals("active").toArray(), []);
  const [goalId, setGoalId] = useState<number | null>(null);
  async function save(addToCalendar: boolean) {
    if (!title.trim()) return;
    await db.tasks.add({ title: title.trim(), date: date || null, time: time || null, done: false, goalId, createdAt: Date.now() });
    if (addToCalendar && date) downloadICS(title.trim(), date, time || null);
    setTitle(""); setTime(""); onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="مهمة جديدة">
      <label className="field"><span>المهمة</span>
        <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="وش تبي تسوي؟" />
      </label>
      <div className="grid2">
        <label className="field"><span>اليوم</span><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>الساعة (اختياري)</span><input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      {goals && goals.length > 0 && (
        <label className="field"><span>مرتبطة بهدف؟</span>
          <select className="input" value={goalId ?? ""} onChange={(e) => setGoalId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">بدون</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </label>
      )}
      <div className="grid2">
        <button className="btn" onClick={() => save(true)} disabled={!title.trim() || !date}>⏰ احفظ + تنبيه</button>
        <button className="btn primary" onClick={() => save(false)} disabled={!title.trim()}>احفظ</button>
      </div>
      <p className="muted small">"تنبيه" يضيف المهمة لتقويم الآيفون عشان يجيك إشعار في وقتها.</p>
    </Sheet>
  );
}

export function Today({ go }: { go: (p: string) => void }) {
  const today = todayISO();
  const [adding, setAdding] = useState(false);
  const brief = useAIText();

  const tasks = useLiveQuery(() => db.tasks.where("date").equals(today).toArray(), [today]);
  const overdue = useLiveQuery(() => db.tasks.where("date").below(today).filter((t) => !t.done).toArray(), [today]);
  const memoDue = useLiveQuery(() => db.memo.where("nextReview").belowOrEqual(today).toArray(), [today]);
  const goals = useLiveQuery(() => db.goals.where("status").equals("active").toArray(), []);
  const spentToday = useLiveQuery(async () => (await db.expenses.where("date").equals(today).toArray()).reduce((s, e) => s + e.amount, 0), [today]);
  const studyToday = useLiveQuery(async () => (await db.study.where("date").equals(today).toArray()).reduce((s, e) => s + e.minutes, 0), [today]);
  const journalToday = useLiveQuery(() => db.journal.where("date").equals(today).first(), [today]);
  const dueDebts = useLiveQuery(() => db.debts.filter((d) => d.paid < d.amount && !!d.dueDate && daysBetween(today, d.dueDate) <= 3).toArray(), [today]);

  const sorted = (tasks ?? []).slice().sort((a, b) => Number(a.done) - Number(b.done) || (a.time ?? "99").localeCompare(b.time ?? "99"));
  const doneCount = (tasks ?? []).filter((t) => t.done).length;
  const name = settings.name;

  return (
    <>
      <div className="header">
        <div>
          <div className="sub">{formatDate(today)}</div>
          <h1>{greeting()}{name ? ` يا ${name}` : ""} 👋</h1>
        </div>
        <button className="icon-btn" onClick={() => go("settings")} aria-label="الإعدادات">⚙️</button>
      </div>

      <div className="hero">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b>🧭 وش المفروض أسوي اليوم؟</b>
          <button className="btn" onClick={() => brief.run(morningBrief, friendlyError)} disabled={brief.busy}>
            {brief.busy ? "..." : brief.text ? "تحديث" : "اسأل"}
          </button>
        </div>
        {brief.error && <div className="error" style={{ marginTop: 8, background: "rgba(255,255,255,.9)" }}>{brief.error}</div>}
        {brief.text ? <div style={{ marginTop: 8 }}><Markdown text={brief.text} /></div>
          : !brief.busy && <div className="muted small" style={{ marginTop: 6 }}>المساعد يشوف أهدافك ومهامك ويرتّب لك يومك.</div>}
      </div>

      <div className="grid2" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="v">{doneCount}/{tasks?.length ?? 0}</div><div className="l">مهام اليوم</div></div>
        <div className="stat"><div className="v">{money(spentToday ?? 0)}</div><div className="l">صرفت اليوم</div></div>
      </div>

      <div className="card">
        <h3>✅ مهام اليوم <button className="btn ghost" onClick={() => setAdding(true)}>+ إضافة</button></h3>
        {tasks && tasks.length > 0 && <Progress value={doneCount / tasks.length} />}
        {sorted.length === 0 && <div className="empty">ما فيه مهام اليوم. اضغط ➕ تحت وقل وش ناوي تسوي.</div>}
        {sorted.map((t) => (
          <div className="list-item" key={t.id}>
            <Check on={t.done} onClick={() => db.tasks.update(t.id!, { done: !t.done })} />
            <div className={`grow ${t.done ? "done-text" : ""}`}>{t.title}</div>
            {t.time && <span className="chip">{t.time}</span>}
          </div>
        ))}
      </div>

      {overdue && overdue.length > 0 && (
        <div className="card">
          <h3>⏳ متأخرة <span className="muted small">{overdue.length}</span></h3>
          {overdue.map((t) => (
            <div className="list-item" key={t.id}>
              <Check on={t.done} onClick={() => db.tasks.update(t.id!, { done: true })} />
              <div className="grow">{t.title}<div className="muted small">{t.date}</div></div>
              <button className="btn ghost" onClick={() => db.tasks.update(t.id!, { date: today })}>لليوم</button>
            </div>
          ))}
        </div>
      )}

      {memoDue && memoDue.length > 0 && (
        <div className="card">
          <h3>📖 مراجعة الحفظ <span className="muted small">{memoDue.length}</span></h3>
          {memoDue.map((m) => (
            <div className="list-item" key={m.id}>
              <div className="grow">{m.title}</div>
              <button className="btn ghost" style={{ color: "var(--danger)" }} onClick={() => reviewMemo(m, false)}>نسيت</button>
              <button className="btn green" onClick={() => reviewMemo(m, true)}>راجعت ✓</button>
            </div>
          ))}
        </div>
      )}

      {dueDebts && dueDebts.length > 0 && (
        <div className="card">
          <h3>🤝 ديون قرب موعدها</h3>
          {dueDebts.map((d) => (
            <div className="list-item" key={d.id}>
              <div className="grow">{d.direction === "i_owe" ? "عليك لـ" : "لك عند"} {d.person}</div>
              <b>{money(d.amount - d.paid)}</b>
              <span className="chip red">{d.dueDate}</span>
            </div>
          ))}
        </div>
      )}

      {goals && goals.length > 0 && (
        <div className="card" onClick={() => go("goals")} style={{ cursor: "pointer" }}>
          <h3>🎯 أهدافك <span className="muted small">عرض الكل ←</span></h3>
          {goals.slice(0, 3).map((g) => {
            const done = g.milestones.filter((m) => m.done).length;
            return (
              <div key={g.id} style={{ margin: "8px 0" }}>
                <div className="row" style={{ justifyContent: "space-between" }}><span>{g.title}</span><span className="muted small">{done}/{g.milestones.length}</span></div>
                <Progress value={g.milestones.length ? done / g.milestones.length : 0} />
              </div>
            );
          })}
        </div>
      )}

      <div className="grid2">
        <button className="menu-item" onClick={() => go("journal")}>
          <span className="i">📔</span><span><b>يومياتي</b><span className="muted small">{journalToday ? "كتبت اليوم ✓" : "ما كتبت اليوم"}</span></span>
        </button>
        <button className="menu-item" onClick={() => go("study")}>
          <span className="i">📚</span><span><b>المذاكرة</b><span className="muted small">{studyToday ?? 0} دقيقة اليوم</span></span>
        </button>
      </div>

      <TaskEditor open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
