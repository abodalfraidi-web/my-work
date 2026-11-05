import { useState } from "react";
import { Icon, type IconName } from "./Icon";
import { settings } from "./utils";

const KEY = "masari.onboarded";
export function needsOnboarding(): boolean {
  try { return localStorage.getItem(KEY) !== "1" && !settings.name; } catch { return false; }
}

const STEPS: { icon: IconName; title: [string, string]; text: string }[] = [
  { icon: "compass", title: ["مساري، ", "مساعدك الشخصي"], text: "مكان واحد لأهدافك ومهامك وفلوسك وناسك ومذاكرتك وقراءتك. وكل شي فيه يشتغل مع Claude." },
  { icon: "mic", title: ["احكي يومك، ", "وهو يرتّب"], text: "اضغط زر المايك في النص تحت، وسولف عن يومك: وش صرفت، مين قابلت، وش ناوي تسوي بكرة. المساعد يسجّل كل شي في مكانه ويعلّق على يومك." },
  { icon: "me", title: ["يعرفك أكثر ", "كل يوم"], text: "كل ما سجّلت أكثر، صار تحليله لشخصيتك ونقاط قوتك وضعفك أدق، وخططه لك أنسب." },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(settings.name);
  const last = step === STEPS.length;
  function finish() {
    if (name.trim()) settings.name = name;
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    onDone();
  }
  return (
    <div className="onb">
      <div className="steps">{[...STEPS, null].map((_, i) => <i key={i} className={i <= step ? "on" : ""} />)}</div>
      {!last ? (
        <div key={step} className="stack" style={{ animation: "rise .45s cubic-bezier(.2,.8,.2,1) both" }}>
          <div className="orb"><Icon name={STEPS[step].icon} size={48} strokeWidth={1.5} /></div>
          <span className="badge">{step + 1} من {STEPS.length + 1}</span>
          <h1>{STEPS[step].title[0]}<span className="hl">{STEPS[step].title[1]}</span></h1>
          <p>{STEPS[step].text}</p>
        </div>
      ) : (
        <div className="stack" style={{ animation: "rise .45s cubic-bezier(.2,.8,.2,1) both" }}>
          <span className="badge teal">آخر خطوة</span>
          <h1>وش <span className="hl orange">اسمك؟</span></h1>
          <p>عشان المساعد يكلمك باسمك.</p>
          <input id="onb-name" className="input" style={{ fontSize: 20, padding: 14 }} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="اسمك" />
        </div>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>رجوع</button>}
        <button className="btn primary grow" style={{ padding: 14 }} onClick={() => (last ? finish() : setStep(step + 1))} disabled={last && !name.trim()}>
          {last ? "يلا نبدأ" : "التالي"}
        </button>
      </div>
      {!last && <button className="btn ghost" onClick={() => setStep(STEPS.length)}>تخطّي</button>}
    </div>
  );
}
