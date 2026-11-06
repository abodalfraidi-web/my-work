import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { friendlyError, morningBrief } from "../ai";
import { db, type MemoItem, type Task } from "../db";
import { Icon } from "../Icon";
import { ask, Check, Markdown, Progress, Sheet, useAIText } from "../ui";
import { DAILY_GOAL, todayXP } from "../progress";
import { HabitChecklist } from "./Habits";
import { addDays, daysBetween, downloadICS, formatDate, greeting, money, settings, todayISO } from "../utils";

export function reviewMemo(m: MemoItem, remembered: boolean) {
  const today = todayISO();
  const interval = remembered ? Math.min(Math.max(1, Math.round(m.intervalDays * 2.2)), 120) : 1;
  return db.memo.update(m.id!, { intervalDays: interval, nextReview: addDays(today, interval), reviews: m.reviews + 1 });
}

export function TaskEditor({ open, onClose, initialDate, task }: { open: boolean; onClose: () => void; initialDate?: string; task?: Task }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [date, setDate] = useState(task?.date ?? initialDate ?? todayISO());
  const [time, setTime] = useState(task?.time ?? "");
  const goals = useLiveQuery(() => db.goals.where("status").equals("active").toArray(), []);
  const [goalId, setGoalId] = useState<number | null>(task?.goalId ?? null);
  async function save(addToCalendar: boolean) {
    if (!title.trim()) return;
    const data = { title: title.trim(), date: date || null, time: time || null, goalId };
    if (task?.id) await db.tasks.update(task.id, data);
    else await db.tasks.add({ ...data, done: false, createdAt: Date.now() });
    if (addToCalendar && date) downloadICS(title.trim(), date, time || null);
    if (!task) { setTitle(""); setTime(""); }
    onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title={task ? "تعديل المهمة" : "مهمة جديدة"}>
      <label className="field"><span>المهمة</span>
        <input id="task-title" className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="وش تبي تسوي؟" />
      </label>
      <div className="grid2">
        <label className="field"><span>اليوم</span><input id="task-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>الساعة (اختياري)</span><input id="task-time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      {goals && goals.length > 0 && (
        <label className="field"><span>مرتبطة بهدف؟</span>
          <select id="task-goal" className="input" value={goalId ?? ""} onChange={(e) => setGoalId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">بدون</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </label>
      )}
      <div className="grid2">
        <button className="btn" onClick={() => save(true)} disabled={!title.trim() || !date}><Icon name="bell" size={18} /> احفظ + تنبيه</button>
        <button className="btn primary" onClick={() => save(false)} disabled={!title.trim()}>احفظ</button>
      </div>
      {task?.id && <button className="btn danger block" style={{ marginTop: 8 }} onClick={async () => { if (await ask("تحذف المهمة؟")) { await db.tasks.delete(task.id!); onClose(); } }}>حذف المهمة</button>}
      <p className="muted small">"تنبيه" يضيف المهمة لتقويم الآيفون عشان يجيك إشعار في وقتها.</p>
    </Sheet>
  );
}

/** ثلاث حلقات: المهام، التعلّم، العادات */
function Rings({ tasks, learn, habits }: { tasks: number; learn: number; habits: number }) {
  const ring = (r: number, v: number, color: string) => {
    const c = 2 * Math.PI * r;
    return <>
      <circle cx="60" cy="60" r={r} stroke={`color-mix(in srgb, ${color} 18%, transparent)`} />
      <circle cx="60" cy="60" r={r} stroke={color} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, v))} style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)" }} />
    </>;
  };
  return (
    <svg width="112" height="112" viewBox="0 0 120 120" aria-hidden="true" style={{ flex: "none" }}>
      <g fill="none" strokeLinecap="round" strokeWidth="11" transform="rotate(-90 60 60)">
        {ring(52, tasks, "var(--accent)")}
        {ring(38, learn, "var(--gold)")}
        {ring(24, habits, "#8fb8ff")}
      </g>
    </svg>
  );
}

export function Today({ go }: { go: (p: string) => void }) {
  const today = todayISO();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const xp = useLiveQuery(() => todayXP(), []);
  const habitStats = useLiveQuery(async () => {
    const hs = await db.habits.filter((h) => h.active).toArray();
    const done = await db.habitLogs.where("date").equals(today).toArray();
    return { total: hs.length, done: done.filter((l) => hs.some((h) => h.id === l.habitId)).length };
  }, [today]);
  const brief = useAIText();

  const tasks = useLiveQuery(() => db.tasks.where("date").equals(today).toArray(), [today]);
  const overdue = useLiveQuery(() => db.tasks.where("date").below(today).filter((t) => !t.done).toArray(), [today]);
  const memoDue = useLiveQuery(() => db.memo.where("nextReview").belowOrEqual(today).toArray(), [today]);
  const goals = useLiveQuery(() => db.goals.where("status").equals("active").toArray(), []);
  const spentToday = useLiveQuery(async () => (await db.expenses.where("date").equals(today).toArray()).reduce((s, e) => s + e.amount, 0), [today]);
  const studyToday = useLiveQuery(async () => (await db.study.where("date").equals(today).toArray()).reduce((s, e) => s + e.minutes, 0), [today]);
  const wordsDue = useLiveQuery(() => db.vocab.where("nextReview").belowOrEqual(today).toArray(), [today]);
  const reading = useLiveQuery(() => db.books.where("status").equals("reading").first(), []);
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
          <h1>{greeting()}{name ? <> يا <span className="hl">{name}</span></> : null}</h1>
        </div>
        <button className="icon-btn" onClick={() => go("me")} aria-label="عني" style={{ padding: 0, overflow: "hidden" }}>
          {settings.avatar ? <img src={settings.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="me" size={20} />}
        </button>
      </div>

      <div className="hero">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b className="row" style={{ gap: 8 }}><Icon name="compass" size={20} className="title-icon" /><span>وش المفروض أسوي <span className="hl orange">اليوم؟</span></span></b>
          <button className="btn" onClick={() => brief.run(morningBrief, friendlyError)} disabled={brief.busy}>
            {brief.busy ? "..." : brief.text ? "تحديث" : "اسأل"}
          </button>
        </div>
        {brief.error && <div className="error" style={{ marginTop: 8, background: "rgba(255,255,255,.9)" }}>{brief.error}</div>}
        {brief.text ? <div style={{ marginTop: 8 }}><Markdown text={brief.text} /></div>
          : !brief.busy && <div className="muted small" style={{ marginTop: 6 }}>المساعد يشوف أهدافك ومهامك ويرتّب لك يومك.</div>}
      </div>

      <div className="card row" style={{ gap: 14 }}>
        <Rings tasks={tasks?.length ? doneCount / tasks.length : 0} learn={(xp ?? 0) / DAILY_GOAL} habits={habitStats?.total ? habitStats.done / habitStats.total : 0} />
        <div className="grow stack" style={{ fontSize: 14 }}>
          <div className="row" style={{ justifyContent: "space-between" }}><span style={{ color: "var(--accent)" }}>المهام</span><b>{doneCount}/{tasks?.length ?? 0}</b></div>
          <div className="row" style={{ justifyContent: "space-between" }}><span style={{ color: "var(--gold)" }}>التعلّم</span><b>{xp ?? 0}/{DAILY_GOAL}</b></div>
          <div className="row" style={{ justifyContent: "space-between" }}><span style={{ color: "#8fb8ff" }}>العادات</span><b>{habitStats?.done ?? 0}/{habitStats?.total ?? 0}</b></div>
          <div className="row muted" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 6 }}><span>صرفت اليوم</span><b>{money(spentToday ?? 0)}</b></div>
        </div>
      </div>

      <div className="grid4">
        {([["library", "translate", "إنجليزي"], ["quran", "quran", "القرآن"], ["puzzles", "puzzle", "ألغاز"], ["habits", "habit", "عاداتي"]] as const).map(([p, i, t]) => (
          <button key={p} className="quick" onClick={() => go(p)}><Icon name={i} size={24} /><span>{t}</span></button>
        ))}
      </div>

      <div className="card">
        <h3><span className="row">مهام اليوم {(tasks?.length ?? 0) > 0 && <span className="badge">{doneCount} من {tasks!.length}</span>}</span> <button className="btn ghost" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> إضافة</button></h3>
        {tasks && tasks.length > 0 && <Progress value={doneCount / tasks.length} />}
        {sorted.length === 0 && <div className="empty">ما فيه مهام اليوم. اضغط زر المايك تحت وقل وش ناوي تسوي.</div>}
        {sorted.map((t) => (
          <div className="list-item" key={t.id}>
            <Check on={t.done} onClick={() => db.tasks.update(t.id!, { done: !t.done })} />
            <div className={`grow ${t.done ? "done-text" : ""}`} onClick={() => setEditing(t)} style={{ cursor: "pointer" }}>{t.title}</div>
            {t.time && <span className="chip">{t.time}</span>}
          </div>
        ))}
      </div>

      {overdue && overdue.length > 0 && (
        <div className="card">
          <h3>متأخرة <span className="muted small">{overdue.length}</span></h3>
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
          <h3>مراجعة الحفظ <span className="muted small">{memoDue.length}</span></h3>
          {memoDue.map((m) => (
            <div className="list-item" key={m.id}>
              <div className="grow">{m.title}</div>
              <button className="btn ghost" style={{ color: "var(--danger)" }} onClick={() => reviewMemo(m, false)}>نسيت</button>
              <button className="btn green" onClick={() => reviewMemo(m, true)}>راجعت</button>
            </div>
          ))}
        </div>
      )}

      {dueDebts && dueDebts.length > 0 && (
        <div className="card">
          <h3>ديون قرب موعدها</h3>
          {dueDebts.map((d) => (
            <div className="list-item" key={d.id}>
              <div className="grow">{d.direction === "i_owe" ? "عليك لـ" : "لك عند"} {d.person}</div>
              <b>{money(d.amount - d.paid)}</b>
              <span className="chip red">{d.dueDate}</span>
            </div>
          ))}
        </div>
      )}

      {(habitStats?.total ?? 0) > 0 && (
        <div className="card">
          <h3>عاداتي اليوم <button className="btn ghost" onClick={() => go("habits")}>الكل</button></h3>
          <HabitChecklist />
        </div>
      )}

      {goals && goals.length > 0 && (
        <div className="card" onClick={() => go("goals")} style={{ cursor: "pointer" }}>
          <h3>أهدافك <span className="muted small">عرض الكل</span></h3>
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

      {((wordsDue?.length ?? 0) > 0 || reading) && (
        <div className="card" onClick={() => go("library")} style={{ cursor: "pointer" }}>
          <h3>القراءة والإنجليزي <Icon name="chevron" size={18} /></h3>
          {reading && <div className="row"><Icon name="book" size={18} className="title-icon" /><span className="grow">{reading.title}</span><span className="muted small">صفحة {reading.currentPage}{reading.totalPages ? `/${reading.totalPages}` : ""}</span></div>}
          {(wordsDue?.length ?? 0) > 0 && <div className="row" style={{ marginTop: 6 }}><Icon name="translate" size={18} className="title-icon" /><span className="grow">{wordsDue!.length} كلمة تنتظر المراجعة</span><span className="chip gold">راجع</span></div>}
        </div>
      )}

      <div className="grid2">
        <button className="menu-item" onClick={() => go("journal")}>
          <span className="i"><Icon name="journal" /></span><span><b>يومياتي</b><span className="muted small">{journalToday ? "كتبت اليوم" : "ما كتبت اليوم"}</span></span>
        </button>
        <button className="menu-item" onClick={() => go("study")}>
          <span className="i"><Icon name="study" /></span><span><b>المذاكرة</b><span className="muted small">{studyToday ?? 0} دقيقة اليوم</span></span>
        </button>
      </div>

      <TaskEditor open={adding} onClose={() => setAdding(false)} />
      {editing && <TaskEditor key={editing.id} open task={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
