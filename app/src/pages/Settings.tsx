import { useRef, useState } from "react";
import { exportAll, importAll } from "../db";
import { inArtifact, saveFile } from "../platform";
import { BackHeader, useToast, ask } from "../ui";
import { settings, todayISO } from "../utils";

export function Settings({ onBack }: { onBack: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(settings.name);
  const [key, setKey] = useState(settings.apiKey);
  const fileRef = useRef<HTMLInputElement>(null);

  async function backup() {
    const ok = await saveFile(`masari-backup-${todayISO()}.json`, await exportAll(), "application/json");
    if (!ok) toast("ما قدرت أحفظ الملف هنا");
  }

  async function restore(f: File) {
    if (!(await ask("الاسترجاع يستبدل كل البيانات الحالية. متأكد؟"))) return;
    try { await importAll(await f.text()); toast("رجعت بياناتك ✓"); }
    catch (e) { toast(e instanceof Error ? e.message : "فشل الاسترجاع"); }
  }

  return (
    <>
      <BackHeader title="الإعدادات" onBack={onBack} />
      <div className="card">
        <label className="field"><span>اسمك</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        {inArtifact ? (
          <p className="muted small">✨ النسخة التجريبية متصلة بحسابك في Claude مباشرة، ما تحتاج مفتاح.</p>
        ) : <>
        <label className="field"><span>مفتاح Claude API</span>
          <input className="input" type="password" dir="ltr" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-..." />
        </label>
        <p className="muted small" style={{ marginTop: 0 }}>
          تطلعه من console.anthropic.com ← API Keys. المفتاح ينحفظ في جوالك بس، ويروح مباشرة لـ Anthropic. حط حد صرف شهري للمفتاح من نفس الموقع للأمان.
        </p>
        </>}
        <button className="btn primary block" onClick={() => { settings.name = name; if (!inArtifact) settings.apiKey = key; toast("انحفظ ✓"); }}>احفظ</button>
      </div>

      <div className="card">
        <h3>💾 النسخ الاحتياطي</h3>
        <p className="muted small" style={{ marginTop: 0 }}>بياناتك محفوظة داخل جوالك. خذ نسخة كل أسبوع واحفظها في ملفات iCloud عشان ما تضيع.</p>
        <div className="grid2">
          <button className="btn" onClick={backup}>⬆️ خذ نسخة</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>⬇️ استرجاع</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
      </div>

      <div className="card">
        <h3>📲 نصايح</h3>
        <ul className="muted small" style={{ margin: 0, paddingInlineStart: 18 }}>
          <li>عشان يصير تطبيق: افتح الرابط في Safari ← زر المشاركة ← "إضافة إلى الشاشة الرئيسية".</li>
          <li>للتسجيل بالصوت: اضغط ➕ ثم زر المايك 🎙️ في كيبورد الآيفون وتكلم.</li>
          <li>زر "تنبيه" في المهام يضيفها لتقويم الآيفون عشان يجيك إشعار.</li>
        </ul>
      </div>
      <p className="muted small" style={{ textAlign: "center" }}>مساري v0.1</p>
    </>
  );
}
