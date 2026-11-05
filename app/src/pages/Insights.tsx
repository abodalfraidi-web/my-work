import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { analyzePeriod, friendlyError } from "../ai";
import { db } from "../db";
import { BackHeader, Markdown, useAIText } from "../ui";
import { addDays, money, MOODS, todayISO } from "../utils";

export function Insights({ onBack }: { onBack: () => void }) {
  const [days, setDays] = useState(7);
  const ai = useAIText();
  const today = todayISO();
  const since = addDays(today, -(days - 1));

  const data = useLiveQuery(async () => {
    const [tasks, expenses, journal, study, interactions] = await Promise.all([
      db.tasks.where("date").between(since, today, true, true).toArray(),
      db.expenses.where("date").between(since, today, true, true).toArray(),
      db.journal.where("date").between(since, today, true, true).toArray(),
      db.study.where("date").between(since, today, true, true).toArray(),
      db.interactions.where("date").between(since, today, true, true).toArray(),
    ]);
    return { tasks, expenses, journal, study, interactions };
  }, [since, today]);

  const tasksDone = data?.tasks.filter((t) => t.done).length ?? 0;
  const tasksAll = data?.tasks.length ?? 0;
  const spent = data?.expenses.reduce((s, e) => s + e.amount, 0) ?? 0;
  const studyMin = data?.study.reduce((s, e) => s + e.minutes, 0) ?? 0;
  const avgMood = data?.journal.length ? data.journal.reduce((s, j) => s + j.mood, 0) / data.journal.length : 0;

  const dayList = Array.from({ length: Math.min(days, 14) }, (_, i) => addDays(today, i - Math.min(days, 14) + 1));
  const completion = dayList.map((d) => {
    const ts = data?.tasks.filter((t) => t.date === d) ?? [];
    return ts.length ? ts.filter((t) => t.done).length / ts.length : 0;
  });

  return (
    <>
      <BackHeader title="التحليل" onBack={onBack} />
      <div className="chips" style={{ marginBottom: 12 }}>
        {[7, 30, 90].map((d) => <button key={d} className={`chip ${d === days ? "on" : ""}`} onClick={() => { setDays(d); ai.setText(""); }}>آخر {d} يوم</button>)}
      </div>

      <div className="grid2" style={{ marginBottom: 12 }}>
        <div className="stat"><div className="v">{tasksAll ? Math.round((tasksDone / tasksAll) * 100) : 0}%</div><div className="l">إنجاز المهام ({tasksDone}/{tasksAll})</div></div>
        <div className="stat"><div className="v">{money(spent)}</div><div className="l">المصاريف</div></div>
        <div className="stat"><div className="v">{Math.round(studyMin / 6) / 10} س</div><div className="l">مذاكرة</div></div>
        <div className="stat"><div className="v">{avgMood ? MOODS[Math.round(avgMood) - 1] : "—"}</div><div className="l">متوسط المزاج ({data?.journal.length ?? 0} يومية)</div></div>
      </div>

      <div className="card">
        <h3>📈 نسبة الإنجاز اليومية</h3>
        <div className="bars">
          {completion.map((v, i) => (
            <div className="b" key={i}><div style={{ height: `${v * 100}%`, background: "var(--accent-2)" }} /><span>{dayList[i].slice(8)}</span></div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>🧠 تقرير المساعد
          <button className="btn ghost" onClick={() => ai.run((onText) => analyzePeriod(days, onText), friendlyError)} disabled={ai.busy}>{ai.busy ? "يحلل..." : "حلّل"}</button>
        </h3>
        {ai.error && <div className="error">{ai.error}</div>}
        {ai.text ? <Markdown text={ai.text} /> : !ai.busy && <div className="muted small">تحليل كامل لفترتك: الإنجاز، المزاج، الفلوس، العلاقات، والتوصيات. ({data?.interactions.length ?? 0} تواصل مسجل بالفترة)</div>}
      </div>
    </>
  );
}
