import { useLiveQuery } from "dexie-react-hooks";
import { VoiceTextarea } from "../MicButton";
import { useEffect, useState } from "react";
import { addPhoto, db } from "../db";
import { ask, BackHeader, PhotoPicker, PhotoThumb, useToast } from "../ui";
import { formatDate, MOODS, todayISO } from "../utils";

export function Journal({ onBack }: { onBack: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const entry = useLiveQuery(() => db.journal.where("date").equals(date).first(), [date]);
  const photos = useLiveQuery(() => db.photos.where("date").equals(date).toArray(), [date]);
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
    toast("انحفظت");
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
        <VoiceTextarea id="journal-text" style={{ minHeight: 200 }} value={text} onChange={setText} placeholder="وش صار في يومك؟ وش حسيت؟ وش تعلمت؟ اضغط المايك وتكلم." />
        {photos && photos.length > 0 && (
          <div className="photos" style={{ marginTop: 10 }}>
            {photos.map((ph) => <PhotoThumb key={ph.id} blob={ph.blob} onDelete={async () => { if (await ask("تحذف الصورة؟")) db.photos.delete(ph.id!); }} />)}
          </div>
        )}
        <div className="grid2" style={{ marginTop: 10 }}>
          <PhotoPicker onPick={async (files) => { for (const f of files) await addPhoto(f, date); toast("انضافت الصور"); }} label="صور اليوم" />
          <button className="btn primary" onClick={save} disabled={!text.trim()}>احفظ</button>
        </div>
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
