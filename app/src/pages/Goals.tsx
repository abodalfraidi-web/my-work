import { useLiveQuery } from "dexie-react-hooks";
import { VoiceTextarea } from "../MicButton";
import { useState } from "react";
import { friendlyError, planGoal } from "../ai";
import { db, type Goal } from "../db";
import { Icon } from "../Icon";
import { BackHeader, Check, Header, Markdown, Progress, Sheet, useAIText, useToast, ask } from "../ui";
import { daysBetween, todayISO, uid } from "../utils";

const CATS = ["شخصي", "دراسة", "مالي", "صحة", "دين وروحانيات", "عمل", "علاقات"];

function GoalEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [category, setCategory] = useState(CATS[0]);
  const [deadline, setDeadline] = useState("");
  async function save() {
    if (!title.trim()) return;
    await db.goals.add({
      title: title.trim(), why: why.trim(), category, deadline: deadline || null,
      milestones: [], plan: "", status: "active", createdAt: Date.now(),
    });
    setTitle(""); setWhy(""); setDeadline(""); onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="هدف جديد ">
      <label className="field"><span>الهدف</span><input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: أحفظ جزء عمّ" /></label>
      <label className="field"><span>ليش هذا الهدف مهم لك؟</span><VoiceTextarea id="goal-why" value={why} onChange={setWhy} /></label>
      <label className="field"><span>التصنيف</span>
        <div className="chips">{CATS.map((c) => <button key={c} className={`chip ${c === category ? "on" : ""}`} onClick={() => setCategory(c)}>{c}</button>)}</div>
      </label>
      <label className="field"><span>متى تبي توصل؟</span><input type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
      <button className="btn primary block" onClick={save} disabled={!title.trim()}>احفظ الهدف</button>
    </Sheet>
  );
}

function GoalDetail({ goal, onBack }: { goal: Goal; onBack: () => void }) {
  const toast = useToast();
  const [newMs, setNewMs] = useState("");
  const ai = useAIText();
  const tasks = useLiveQuery(() => db.tasks.where("goalId").equals(goal.id!).toArray(), [goal.id]);
  const done = goal.milestones.filter((m) => m.done).length;
  const plan = ai.text || goal.plan;

  const update = (patch: Partial<Goal>) => db.goals.update(goal.id!, patch);

  async function makePlan() {
    const text = await ai.run(
      (onText) => planGoal(`هدفي: ${goal.title}\nليش: ${goal.why}\nالموعد: ${goal.deadline ?? "مفتوح"}\nالمراحل الحالية: ${goal.milestones.map((m) => m.title).join("، ") || "لا يوجد"}`, onText),
      friendlyError,
    );
    if (text) await update({ plan: text });
  }

  async function importMilestones() {
    const items = plan.split("\n").map((l) => l.match(/^\s*[-*]\s*\[ \]\s*(.+)$/)?.[1]?.trim()).filter(Boolean) as string[];
    if (!items.length) { toast("ما لقيت مراحل في الخطة"); return; }
    await update({ milestones: [...goal.milestones, ...items.map((t) => ({ id: uid(), title: t.replace(/\*\*/g, ""), done: false }))] });
    toast(`انضافت ${items.length} مراحل`);
  }

  return (
    <>
      <BackHeader title={goal.title} onBack={onBack} />
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <span className="chip accent">{goal.category}</span>
          {goal.deadline && <span className="muted small">باقي {daysBetween(todayISO(), goal.deadline)} يوم</span>}
        </div>
        {goal.why && <p style={{ margin: "0 0 10px" }}>{goal.why}</p>}
        <Progress value={goal.milestones.length ? done / goal.milestones.length : 0} />
        <div className="muted small" style={{ marginTop: 6 }}>{done} من {goal.milestones.length} مراحل</div>
      </div>

      <div className="card">
        <h3>المراحل</h3>
        {goal.milestones.map((m) => (
          <div className="list-item" key={m.id}>
            <Check on={m.done} onClick={() => update({ milestones: goal.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)) })} />
            <div className={`grow ${m.done ? "done-text" : ""}`}>{m.title}</div>
            <button className="btn danger" onClick={() => update({ milestones: goal.milestones.filter((x) => x.id !== m.id) })}><Icon name="x" size={16} /></button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 8 }}>
          <input className="input" value={newMs} onChange={(e) => setNewMs(e.target.value)} placeholder="مرحلة جديدة..." />
          <button className="btn primary" disabled={!newMs.trim()} onClick={async () => {
            await update({ milestones: [...goal.milestones, { id: uid(), title: newMs.trim(), done: false }] });
            setNewMs("");
          }}>+</button>
        </div>
      </div>

      <div className="card">
        <h3>خطة المساعد
          <button className="btn ghost" onClick={makePlan} disabled={ai.busy}>{ai.busy ? "يخطط..." : plan ? "خطة جديدة" : "خطط لي"}</button>
        </h3>
        {ai.error && <div className="error">{ai.error}</div>}
        {plan ? <><Markdown text={plan} />
          {!ai.busy && <button className="btn block" onClick={importMilestones}>أضف مراحل الخطة للهدف</button>}</>
          : <div className="muted small">خل المساعد يقسّم لك الهدف لمراحل وخطوات.</div>}
      </div>

      {tasks && tasks.length > 0 && (
        <div className="card">
          <h3>مهام مرتبطة</h3>
          {tasks.map((t) => (
            <div className="list-item" key={t.id}>
              <Check on={t.done} onClick={() => db.tasks.update(t.id!, { done: !t.done })} />
              <div className={`grow ${t.done ? "done-text" : ""}`}>{t.title}</div>
              <span className="muted small">{t.date}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid2">
        <button className="btn" onClick={() => update({ status: goal.status === "paused" ? "active" : "paused" })}>{goal.status === "paused" ? "▶️ تفعيل" : "إيقاف مؤقت"}</button>
        <button className="btn green" onClick={() => update({ status: goal.status === "done" ? "active" : "done" })}>{goal.status === "done" ? "إرجاع" : "تحقق!"}</button>
      </div>
      <button className="btn danger block" style={{ marginTop: 8 }} onClick={async () => {
        if (await ask("تحذف الهدف؟")) { await db.goals.delete(goal.id!); onBack(); }
      }}>حذف الهدف</button>
    </>
  );
}

export function Goals() {
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  const open = goals?.find((g) => g.id === openId);
  if (open) return <GoalDetail goal={open} onBack={() => setOpenId(null)} />;

  const groups: [string, Goal["status"]][] = [["نشطة", "active"], ["متوقفة", "paused"], ["تحققت ", "done"]];
  return (
    <>
      <Header eyebrow="MASARI · GOALS" title={<>وين أبي <span className="hl">أوصل</span></>} right={<button className="btn primary" onClick={() => setAdding(true)}>+ هدف</button>} />
      {goals?.length === 0 && <div className="card empty">ابدأ بأول هدف. اكتب وش تبي توصل له وليش، والمساعد يخطط معك.</div>}
      {groups.map(([label, status]) => {
        const list = (goals ?? []).filter((g) => g.status === status);
        if (!list.length) return null;
        return (
          <div key={status}>
            <div className="section-title">{label}</div>
            {list.map((g) => {
              const done = g.milestones.filter((m) => m.done).length;
              return (
                <div className="card" key={g.id} onClick={() => setOpenId(g.id!)} style={{ cursor: "pointer" }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                    <b>{g.title}</b><span className="chip">{g.category}</span>
                  </div>
                  <Progress value={g.milestones.length ? done / g.milestones.length : 0} />
                  <div className="row muted small" style={{ justifyContent: "space-between", marginTop: 6 }}>
                    <span>{done}/{g.milestones.length} مراحل</span>
                    {g.deadline && <span>{daysBetween(todayISO(), g.deadline)} يوم باقي</span>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      <GoalEditor open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
