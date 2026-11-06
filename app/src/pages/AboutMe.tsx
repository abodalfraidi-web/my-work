import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { analyzeMe, friendlyError, getProfile, saveProfile } from "../ai";
import { db, shrinkImage } from "../db";
import { Icon } from "../Icon";
import { ask, BackHeader, Markdown, PhotoPicker, useAIText, useToast } from "../ui";
import { settings } from "../utils";

export function AboutMe({ onBack }: { onBack: () => void }) {
  const toast = useToast();
  const ai = useAIText();
  const [avatar, setAvatar] = useState(settings.avatar);
  const [openId, setOpenId] = useState<number | null>(null);
  const history = useLiveQuery(() => db.insights.where("kind").equals("me").reverse().sortBy("createdAt"), []);
  const stats = useLiveQuery(async () => ({
    journal: await db.journal.count(),
    tasks: await db.tasks.count(),
    people: await db.people.count(),
    expenses: await db.expenses.count(),
  }), []);
  const latest = history?.[0];
  const profile = useLiveQuery(() => getProfile(), []);
  const shown = ai.text || latest?.content || "";

  async function pickAvatar(files: File[]) {
    const small = await shrinkImage(files[0], 320);
    const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(small); });
    settings.avatar = url; setAvatar(url); toast("تغيرت صورتك");
  }

  async function analyze() {
    const text = await ai.run(analyzeMe, friendlyError);
    if (text) {
      await db.insights.add({ kind: "me", title: "تحليل شخصي", content: text, createdAt: Date.now() });
      ai.setText("");
    }
  }

  const fmt = (t: number) => new Date(t).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <BackHeader title="عني" onBack={onBack} />
      <div className="card row" style={{ gap: 14 }}>
        {avatar ? <img className="avatar" style={{ width: 72, height: 72, borderRadius: 22 }} src={avatar} alt="" />
          : <div className="avatar" style={{ width: 72, height: 72, borderRadius: 22, display: "grid", placeItems: "center", color: "var(--muted)" }}><Icon name="me" size={32} /></div>}
        <div className="grow">
          <b style={{ fontSize: 20, fontFamily: "var(--font-display)" }}>{settings.name || "أنا"}</b>
          <div className="muted small">{stats ? `${stats.journal} يومية · ${stats.tasks} مهمة · ${stats.people} شخص · ${stats.expenses} مصروف` : ""}</div>
          <div style={{ marginTop: 6 }}><PhotoPicker onPick={pickAvatar} label="صورتي" multiple={false} /></div>
        </div>
      </div>

      <div className="card">
        <h3>وش أعرف عنك <span className="badge teal">{profile?.facts.length ?? 0}</span></h3>
        {!profile?.facts.length ? <div className="muted small">ذاكرتي فاضية. سولف معي بالمحادثة الصوتية، وأتعلم عنك من كلامك.</div> : (
          profile.facts.map((f, i) => (
            <div className="list-item" key={i}>
              <span className="grow">{f}</span>
              <button className="btn danger" aria-label="احذف هذي المعلومة" onClick={() => saveProfile({ facts: profile.facts.filter((_, j) => j !== i), updatedAt: Date.now() })}><Icon name="x" size={14} /></button>
            </div>
          ))
        )}
        {(profile?.facts.length ?? 0) > 0 && <p className="muted small" style={{ marginBottom: 0 }}>المساعد يستخدم هذي المعلومات في كل محادثة. احذف أي شي غلط أو ما تبيه.</p>}
      </div>

      <div className="hero">
        <b>تحليل شخصيتك وخطة تطويرك</b>
        <div className="muted small" style={{ margin: "4px 0 10px" }}>
          المساعد يقرأ يومياتك ومهامك وأهدافك وفلوسك وعلاقاتك، ويطلع لك نقاط قوتك وضعفك وخطة 30 يوم. كل تحليل ينحفظ عشان تشوف تطورك.
        </div>
        <button className="btn" onClick={analyze} disabled={ai.busy}>{ai.busy ? "يحلّلك..." : latest ? "تحليل جديد" : "حلّلني"}</button>
      </div>

      {ai.error && <div className="error">{ai.error}</div>}
      {shown && (
        <div className="card">
          {!ai.text && latest && <div className="muted small" style={{ marginBottom: 6 }}>آخر تحليل: {fmt(latest.createdAt)}</div>}
          <Markdown text={shown} />
        </div>
      )}
      {!shown && !ai.busy && (stats?.journal ?? 0) < 3 && (
        <div className="card empty">كل ما سجّلت أكثر عن يومك، صار التحليل أدق. اكتب يومياتك 3 أيام على الأقل قبل أول تحليل.</div>
      )}

      {history && history.length > 1 && (
        <>
          <div className="section-title">التحليلات السابقة</div>
          {history.slice(1).map((h) => (
            <div className="card" key={h.id}>
              <div className="row" style={{ justifyContent: "space-between" }} onClick={() => setOpenId(openId === h.id ? null : h.id!)}>
                <b>{fmt(h.createdAt)}</b>
                <button className="btn danger" aria-label="حذف" onClick={async (e) => { e.stopPropagation(); if (await ask("تحذف هذا التحليل؟")) db.insights.delete(h.id!); }}><Icon name="trash" size={16} /></button>
              </div>
              {openId === h.id && <div style={{ marginTop: 8 }}><Markdown text={h.content} /></div>}
            </div>
          ))}
        </>
      )}
    </>
  );
}
