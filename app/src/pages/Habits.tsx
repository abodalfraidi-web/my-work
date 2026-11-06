import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, type Habit } from "../db";
import { Icon } from "../Icon";
import { streakFrom } from "../progress";
import { ask, BackHeader, Check } from "../ui";
import { addDays, todayISO } from "../utils";

export const PRAYERS = ["الفجر", "الظهر", "العصر", "المغرب", "العشاء"];

export async function toggleHabit(habitId: number, date = todayISO()) {
  const hit = await db.habitLogs.where("[habitId+date]").equals([habitId, date]).first();
  if (hit?.id) await db.habitLogs.delete(hit.id);
  else await db.habitLogs.add({ habitId, date });
}

/** قائمة العادات لليوم (تُستخدم في شاشة اليوم وصفحة العادات) */
export function HabitChecklist({ kind }: { kind?: Habit["kind"] }) {
  const today = todayISO();
  const habits = useLiveQuery(() => db.habits.orderBy("order").filter((h) => h.active && (!kind || h.kind === kind)).toArray(), [kind]);
  const logs = useLiveQuery(() => db.habitLogs.toArray(), []);
  const doneToday = new Set((logs ?? []).filter((l) => l.date === today).map((l) => l.habitId));
  if (!habits?.length) return null;
  return (
    <>
      {habits.map((h) => {
        const dates = new Set((logs ?? []).filter((l) => l.habitId === h.id).map((l) => l.date));
        const streak = streakFrom(dates);
        return (
          <div className="list-item" key={h.id}>
            <Check on={doneToday.has(h.id!)} onClick={() => toggleHabit(h.id!)} />
            <span className={`grow ${doneToday.has(h.id!) ? "done-text" : ""}`}>{h.name}</span>
            {streak > 0 && <span className="chip gold"><Icon name="flame" size={12} /> {streak}</span>}
          </div>
        );
      })}
    </>
  );
}

function WeekGrid({ habit }: { habit: Habit }) {
  const logs = useLiveQuery(() => db.habitLogs.where("habitId").equals(habit.id!).toArray(), [habit.id]);
  const set = new Set((logs ?? []).map((l) => l.date));
  const days = Array.from({ length: 14 }, (_, i) => addDays(todayISO(), i - 13));
  const rate = days.filter((d) => set.has(d)).length / days.length;
  return (
    <div className="list-item" style={{ display: "block" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>{habit.name}</b>
        <span className="muted small">{Math.round(rate * 100)}% آخر أسبوعين · سلسلة {streakFrom(set)}</span>
      </div>
      <div className="dots" style={{ marginTop: 6 }}>
        {days.map((d) => <button key={d} className={`dot ${set.has(d) ? "on" : ""}`} title={d} aria-label={d} onClick={() => toggleHabit(habit.id!, d)} />)}
      </div>
    </div>
  );
}

export function Habits({ onBack }: { onBack: () => void }) {
  const habits = useLiveQuery(() => db.habits.orderBy("order").toArray(), []);
  const [name, setName] = useState("");
  const hasPrayers = habits?.some((h) => h.kind === "prayer");
  const nextOrder = (habits?.length ?? 0) + 1;

  async function add(n: string, kind: Habit["kind"] = "habit", order = nextOrder) {
    await db.habits.add({ name: n, kind, order, active: true, createdAt: Date.now() });
  }

  return (
    <>
      <BackHeader title="عاداتي وصلواتي" onBack={onBack} />
      <div className="card">
        <h3>اليوم</h3>
        {habits?.length ? <HabitChecklist /> : <div className="empty">أضف أول عادة تحت، أو أضف الصلوات الخمس.</div>}
      </div>

      {!hasPrayers && (
        <button className="btn block" style={{ marginBottom: 12 }} onClick={async () => { for (let i = 0; i < 5; i++) await add(PRAYERS[i], "prayer", i - 10); }}>
          <Icon name="plus" size={18} /> أضف متابعة الصلوات الخمس
        </button>
      )}

      <div className="card">
        <h3>عادة جديدة</h3>
        <div className="row">
          <input id="habit-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: رياضة 20 دقيقة" />
          <button className="btn primary" disabled={!name.trim()} onClick={async () => { await add(name.trim()); setName(""); }}><Icon name="plus" size={18} /></button>
        </div>
        <div className="chips" style={{ marginTop: 8 }}>
          {["رياضة", "قراءة 10 صفحات", "شرب 8 أكواب ماء", "نوم قبل 12", "أذكار الصباح", "بدون سوشال قبل النوم"].map((s) => (
            <button key={s} className="chip" onClick={() => add(s)}>{s}</button>
          ))}
        </div>
      </div>

      {habits && habits.length > 0 && (
        <div className="card">
          <h3>آخر أسبوعين</h3>
          <p className="muted small" style={{ marginTop: 0 }}>اضغط على أي نقطة عشان تعدّل يوم فات.</p>
          {habits.map((h) => <WeekGrid key={h.id} habit={h} />)}
        </div>
      )}

      {habits && habits.length > 0 && (
        <div className="card">
          <h3>إدارة العادات</h3>
          {habits.map((h) => (
            <div className="list-item" key={h.id}>
              <span className={`grow ${h.active ? "" : "done-text"}`}>{h.name}</span>
              <button className="btn ghost" onClick={() => db.habits.update(h.id!, { active: !h.active })}>{h.active ? "إيقاف" : "تفعيل"}</button>
              <button className="btn danger" aria-label="حذف" onClick={async () => {
                if (await ask(`تحذف "${h.name}" وسجلها؟`)) { await db.habitLogs.where("habitId").equals(h.id!).delete(); await db.habits.delete(h.id!); }
              }}><Icon name="trash" size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
