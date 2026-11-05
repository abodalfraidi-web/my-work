import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { analyzePerson, friendlyError } from "../ai";
import { db, type Person } from "../db";
import { Icon } from "../Icon";
import { BackHeader, Header, Markdown, Sheet, useAIText, ask } from "../ui";
import { daysBetween, shortDate, todayISO } from "../utils";

const RELATIONS = ["عائلة", "صديق", "زميل", "شغل", "معرفة"];

function PersonDetail({ person, onBack }: { person: Person; onBack: () => void }) {
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const ai = useAIText();
  const log = useLiveQuery(() => db.interactions.where("personId").equals(person.id!).sortBy("date"), [person.id]);
  const analysis = ai.text || person.analysis;

  async function addInteraction() {
    if (!note.trim()) return;
    await db.interactions.add({ personId: person.id!, date: todayISO(), text: note.trim(), createdAt: Date.now() });
    setNote("");
  }

  async function analyze() {
    const profile = `الاسم: ${person.name}\nالعلاقة: ${person.relation || "غير محددة"}\nملاحظات: ${person.notes || "لا يوجد"}`;
    const logText = (log ?? []).map((i) => `- ${i.date}: ${i.text}`).join("\n") || "لا يوجد سجل بعد";
    const text = await ai.run((onText) => analyzePerson(person.name, profile, logText, onText), friendlyError);
    if (text) await db.people.update(person.id!, { analysis: text, analysisAt: Date.now() });
  }

  return (
    <>
      <BackHeader title={person.name} onBack={onBack} right={<button className="icon-btn" onClick={() => setEditing(true)}><Icon name="edit" size={18} /></button>} />
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="chip accent">{person.relation || "بدون تصنيف"}</span>
          <span className="muted small">{log?.length ?? 0} تواصل</span>
        </div>
        {person.notes && <p style={{ margin: "10px 0 0" }}>{person.notes}</p>}
      </div>

      <div className="card">
        <h3>سجّل تواصل</h3>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="وش صار؟ وش قال؟ (تقدر تستخدم مايك الكيبورد )" />
        <button className="btn primary block" style={{ marginTop: 8 }} onClick={addInteraction} disabled={!note.trim()}>احفظ</button>
      </div>

      <div className="card">
        <h3>تحليل الشخص
          <button className="btn ghost" onClick={analyze} disabled={ai.busy || !log?.length}>{ai.busy ? "يحلل..." : analysis ? "حدّث التحليل" : "حلّل"}</button>
        </h3>
        {ai.error && <div className="error">{ai.error}</div>}
        {analysis ? <>
          <Markdown text={analysis} />
          {person.analysisAt && !ai.busy && <div className="muted small">آخر تحليل: {new Date(person.analysisAt).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn")}</div>}
        </> : <div className="muted small">{log?.length ? "اضغط حلّل عشان المساعد يقرأ كل تواصلك معه." : "سجّل تواصل واحد على الأقل عشان يقدر يحلّل."}</div>}
      </div>

      <div className="card">
        <h3>السجل</h3>
        {log?.length === 0 && <div className="empty">ما فيه سجل بعد</div>}
        {(log ?? []).slice().reverse().map((i) => (
          <div className="list-item" key={i.id} style={{ alignItems: "flex-start" }}>
            <span className="chip" style={{ flex: "none" }}>{shortDate(i.date)}</span>
            <div className="grow" style={{ whiteSpace: "pre-wrap" }}>{i.text}</div>
            <button className="btn danger" onClick={async () => (await ask("تحذف؟")) && db.interactions.delete(i.id!)}><Icon name="x" size={16} /></button>
          </div>
        ))}
      </div>

      <PersonEditor open={editing} onClose={() => setEditing(false)} person={person} onDeleted={onBack} />
    </>
  );
}

function PersonEditor({ open, onClose, person, onDeleted }: { open: boolean; onClose: () => void; person?: Person; onDeleted?: () => void }) {
  const [name, setName] = useState(person?.name ?? "");
  const [relation, setRelation] = useState(person?.relation ?? "");
  const [notes, setNotes] = useState(person?.notes ?? "");
  async function save() {
    if (!name.trim()) return;
    if (person?.id) await db.people.update(person.id, { name: name.trim(), relation, notes });
    else await db.people.add({ name: name.trim(), relation, notes, analysis: "", analysisAt: null, createdAt: Date.now() });
    if (!person) { setName(""); setRelation(""); setNotes(""); }
    onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title={person ? "تعديل" : "شخص جديد"}>
      <label className="field"><span>الاسم</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>العلاقة</span>
        <div className="chips">{RELATIONS.map((r) => <button key={r} className={`chip ${r === relation ? "on" : ""}`} onClick={() => setRelation(r)}>{r}</button>)}</div>
      </label>
      <label className="field"><span>ملاحظات عنه</span><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اهتماماته، شغله، أشياء مهمة..." /></label>
      <button className="btn primary block" onClick={save} disabled={!name.trim()}>احفظ</button>
      {person?.id && <button className="btn danger block" style={{ marginTop: 8 }} onClick={async () => {
        if (!(await ask(`تحذف ${person.name} وكل سجله؟`))) return;
        await db.interactions.where("personId").equals(person.id!).delete();
        await db.people.delete(person.id!);
        onClose(); onDeleted?.();
      }}>حذف</button>}
    </Sheet>
  );
}

export function People() {
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const people = useLiveQuery(() => db.people.toArray(), []);
  const interactions = useLiveQuery(() => db.interactions.toArray(), []);
  const open = people?.find((p) => p.id === openId);
  if (open) return <PersonDetail person={open} onBack={() => setOpenId(null)} />;

  const last = new Map<number, string>();
  const count = new Map<number, number>();
  for (const i of interactions ?? []) {
    if (!last.has(i.personId) || last.get(i.personId)! < i.date) last.set(i.personId, i.date);
    count.set(i.personId, (count.get(i.personId) ?? 0) + 1);
  }
  const list = (people ?? [])
    .filter((p) => !q || p.name.includes(q))
    .sort((a, b) => (last.get(b.id!) ?? "").localeCompare(last.get(a.id!) ?? ""));

  return (
    <>
      <Header eyebrow="MASARI · PEOPLE" title={<>ناسي <span className="hl">وعلاقاتي</span></>} sub="كل شخص وسجله وتحليله" right={<button className="btn primary" onClick={() => setAdding(true)}>+ شخص</button>} />
      <input className="input" style={{ marginBottom: 12 }} placeholder="بحث" value={q} onChange={(e) => setQ(e.target.value)} />
      {people?.length === 0 && <div className="card empty">ما فيه أحد بعد. اضغط وقل مثلاً "جلست مع زياد اليوم وقال..." وبينضاف تلقائياً.</div>}
      {list.map((p) => {
        const l = last.get(p.id!);
        return (
          <button className="menu-item" key={p.id} onClick={() => setOpenId(p.id!)}>
            <span className="i">{p.name.slice(0, 1)}</span>
            <span className="grow">
              <b>{p.name}</b>
              <span className="muted small">{p.relation || "—"} · {count.get(p.id!) ?? 0} تواصل{l ? ` · آخر مرة قبل ${daysBetween(l, todayISO())} يوم` : ""}</span>
            </span>
            {p.analysis && <span className="chip green">محلّل</span>}
          </button>
        );
      })}
      <PersonEditor open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
