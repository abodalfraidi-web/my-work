import { useEffect, useRef, useState } from "react";
import { MicButton } from "./MicButton";
import { friendlyError, parseCapture, type CaptureActionT } from "./ai";
import { addPhoto, db, findOrCreatePerson, shrinkImage } from "./db";
import { Icon } from "./Icon";
import { addDays, EXPENSE_CATEGORIES, money, todayISO, uid } from "./utils";
import { PhotoPicker, PhotoThumb, Sheet, useToast } from "./ui";

const KIND_LABEL: Record<CaptureActionT["kind"], string> = {
  expense: "مصروف",
  task: "مهمة",
  journal: "يومية",
  interaction: "تواصل",
  debt: "دين",
  study: "مذاكرة",
  memorize: "حفظ",
  goal: "هدف",
};

export async function saveAction(a: CaptureActionT): Promise<void> {
  const now = Date.now();
  const date = a.date ?? todayISO();
  switch (a.kind) {
    case "expense":
      await db.expenses.add({
        amount: a.amount ?? 0, category: a.category ?? "أخرى", note: a.note ?? a.title ?? "", date, createdAt: now,
      });
      break;
    case "task":
      await db.tasks.add({
        title: a.title ?? a.summary, date: a.date ?? todayISO(), time: a.time, done: false, goalId: null, createdAt: now,
      });
      break;
    case "journal": {
      const existing = await db.journal.where("date").equals(date).first();
      if (existing?.id) {
        await db.journal.update(existing.id, { text: `${existing.text}\n\n${a.text ?? ""}`.trim(), mood: a.mood ?? existing.mood });
      } else {
        await db.journal.add({ date, text: a.text ?? a.summary, mood: a.mood ?? 3, createdAt: now });
      }
      break;
    }
    case "interaction": {
      const personId = await findOrCreatePerson(a.personName ?? "شخص");
      await db.interactions.add({ personId, date, text: a.text ?? a.summary, createdAt: now });
      break;
    }
    case "debt":
      await db.debts.add({
        person: a.personName ?? "", amount: a.amount ?? 0, paid: 0, direction: a.direction ?? "i_owe",
        note: a.note ?? "", dueDate: null, createdAt: now,
      });
      break;
    case "study":
      await db.study.add({ subject: a.subject ?? a.title ?? "عام", minutes: a.minutes ?? 0, note: a.note ?? "", date, createdAt: now });
      break;
    case "memorize":
      await db.memo.add({
        title: a.title ?? a.summary, addedOn: date, nextReview: addDays(date, 1), intervalDays: 1, reviews: 0, createdAt: now,
      });
      break;
    case "goal":
      await db.goals.add({
        title: a.title ?? a.summary, why: a.note ?? "", category: a.category ?? "شخصي", deadline: a.date,
        milestones: [], plan: "", status: "active", createdAt: now,
      });
      break;
  }
}

function detail(a: CaptureActionT): string {
  const parts: string[] = [];
  if (a.amount != null) parts.push(money(a.amount));
  if (a.category) parts.push(a.category);
  if (a.personName) parts.push(a.personName);
  if (a.date) parts.push(a.date);
  if (a.time) parts.push(a.time);
  if (a.minutes) parts.push(`${a.minutes} دقيقة`);
  return parts.join(" · ");
}

export function CaptureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<(CaptureActionT & { _id: string; _on: boolean })[] | null>(null);
  const [reply, setReply] = useState("");
  const [images, setImages] = useState<Blob[]>([]);

  function reset() {
    setInput(""); setActions(null); setReply(""); setError(null); setImages([]); setAutoTyped(false);
  }
  function close() { reset(); onClose(); }

  const taRef = useRef<HTMLTextAreaElement>(null);
  // إذا الكلام جا من مايك الكيبورد: نرتّب لحالنا بعد ما يسكت ثلاث ثواني
  const [autoTyped, setAutoTyped] = useState(false);
  useEffect(() => {
    if (!autoTyped || !input.trim() || busy) return;
    const t = setTimeout(() => analyze(input), 3000);
    return () => clearTimeout(t);
  }, [input, autoTyped]); // eslint-disable-line react-hooks/exhaustive-deps
  async function analyze(text = input) {
    if (!text.trim() && !images.length) return;
    setBusy(true); setError(null);
    try {
      const res = await parseCapture(text, EXPENSE_CATEGORIES, images);
      setActions(res.actions.map((a) => ({ ...a, _id: uid(), _on: true })));
      setReply(res.reply);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveAll() {
    if (!actions) return;
    const chosen = actions.filter((a) => a._on);
    for (const a of chosen) await saveAction(a);
    // صور اليوم تنحفظ مع اليومية
    const journal = chosen.find((a) => a.kind === "journal");
    if (journal) for (const img of images) await addPhoto(img, journal.date ?? todayISO());
    toast(`انحفظ ${chosen.length}`);
    close();
  }

  return (
    <Sheet open={open} onClose={close} title="وش صار اليوم؟">
      {!actions ? (
        <>
          <div className="mic-wrap">
            <MicButton size="lg" focusRef={taRef} inputId="capture-text" label="احكي يومك" onPress={() => setAutoTyped(true)}
              onText={(t, base) => setInput((base ? base + " " : "") + t)}
              onDone={(t, base) => analyze((base ? base + " " : "") + t)} silenceMs={2500} />
            <div className="muted small">اضغط وتكلم عن يومك (إذا طلع الكيبورد، اضغط المايك اللي فيه). لما تسكت أرتّب كلامك لحالي.</div>
          </div>
          <textarea
            ref={taRef}
            id="capture-text"
            className="textarea"
            style={{ minHeight: 120 }}
            placeholder={"أو اكتب هنا...\n\nمثال: صرفت 35 قهوة و120 بنزين، وجلست مع زياد اليوم وقال إنه ناوي يغير شغله، وذكرني بكرة الساعة 4 أتصل على أبوي"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {images.length > 0 && (
            <div className="photos" style={{ margin: "8px 0" }}>
              {images.map((b, i) => <PhotoThumb key={i} blob={b} onDelete={() => setImages(images.filter((_, j) => j !== i))} />)}
            </div>
          )}
          <div className="row" style={{ margin: "8px 0" }}>
            <PhotoPicker label="صورة أو فاتورة" onPick={async (files) => {
              const small = await Promise.all(files.slice(0, 4).map((f) => shrinkImage(f, 1280)));
              setImages([...images, ...small].slice(0, 4));
            }} />
            <span className="muted small grow">صوّر الفاتورة ويسجّل المصروف لحاله</span>
          </div>
          <p className="muted small">احكي عن يومك بالتفصيل: وش سويت، مين قابلت، وش صرفت، وش حسيت. المساعد يسجّل كل شي ويعلّق على يومك.</p>
          {error && <div className="error">{error}</div>}
          <button className="btn primary block" onClick={() => analyze()} disabled={busy || (!input.trim() && !images.length)}>
            <Icon name="spark" size={18} /> {busy ? "أرتّب كلامك..." : "رتّبها لي"}
          </button>
        </>
      ) : (
        <>
          {reply && <div className="card" style={{ whiteSpace: "pre-wrap" }}>{reply}</div>}
          {actions.length === 0 && <div className="empty">ما لقيت شي أسجّله. جرّب توضّح أكثر.</div>}
          {actions.map((a) => (
            <div className="card row" key={a._id} style={{ opacity: a._on ? 1 : 0.45 }}>
              <button
                className={`check ${a._on ? "on" : ""}`}
                onClick={() => setActions(actions.map((x) => (x._id === a._id ? { ...x, _on: !x._on } : x)))}
              >{a._on ? <Icon name="check" size={16} strokeWidth={2.6} /> : null}</button>
              <div className="grow">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="chip accent">{KIND_LABEL[a.kind]}</span>
                  <span className="muted small">{detail(a)}</span>
                </div>
                <div style={{ marginTop: 4 }}>{a.summary}</div>
              </div>
            </div>
          ))}
          <div className="grid2">
            <button className="btn" onClick={() => setActions(null)}>تعديل الكلام</button>
            <button className="btn green" onClick={saveAll} disabled={!actions.some((a) => a._on)}>احفظ</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
