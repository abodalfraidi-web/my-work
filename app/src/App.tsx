import { useEffect, useState } from "react";
import { CaptureSheet } from "./Capture";
import { Chat } from "./pages/Chat";
import { Onboarding, needsOnboarding } from "./Onboarding";
import { AboutMe } from "./pages/AboutMe";
import { Goals } from "./pages/Goals";
import { Library } from "./pages/Library";
import { Quran } from "./pages/Quran";
import { Puzzles } from "./pages/Puzzles";
import { Habits } from "./pages/Habits";
import { Insights } from "./pages/Insights";
import { Journal } from "./pages/Journal";
import { Money } from "./pages/Money";
import { People } from "./pages/People";
import { Settings } from "./pages/Settings";
import { Study } from "./pages/Study";
import { Today } from "./pages/Today";
import { inArtifact } from "./platform";
import { Icon, type IconName } from "./Icon";
import { startSync } from "./sync";
import { AskHost, Header } from "./ui";
import { settings } from "./utils";

type Page = "today" | "goals" | "chat" | "more" | "people" | "money" | "journal" | "study" | "insights" | "settings" | "library" | "me" | "quran" | "puzzles" | "habits";
const TAB_OF: Record<Page, Page> = {
  today: "today", goals: "goals", chat: "chat", more: "more",
  people: "more", money: "more", journal: "more", study: "more", insights: "more", settings: "more", library: "more", me: "more", quran: "more", puzzles: "more", habits: "more",
};

function More({ go }: { go: (p: Page) => void }) {
  const items: [Page, IconName, string, string][] = [
    ["me", "me", "عني", "تحليل شخصيتك وخطة تطويرك"],
    ["people", "users", "ناسي", "كل شخص وسجله وتحليله"],
    ["money", "wallet", "فلوسي", "المصاريف والديون"],
    ["journal", "journal", "يومياتي", "وش صار في يومي، مع الصور"],
    ["library", "translate", "الإنجليزي والكتب", "5 كلمات يومياً، قراءة بصوتك، محادثة، وكتبي"],
    ["quran", "quran", "القرآن", "تسميع يصحّح أخطاءك، حفظ، وورد يومي"],
    ["puzzles", "puzzle", "الألغاز", "ثقافة، رياضيات، كلمة اليوم، وحساب ذهني"],
    ["habits", "habit", "عاداتي وصلواتي", "عادات يومية مع سلسلة الأيام"],
    ["study", "study", "المذاكرة والحفظ", "مؤقت ومراجعة متباعدة"],
    ["insights", "chart", "التحليل", "تقارير وأرقام وتوصيات"],
    ["settings", "settings", "الإعدادات", "الاسم والنسخ الاحتياطي"],
  ];
  return (
    <>
      <Header eyebrow="MASARI · ALL" title={<>كل <span className="hl">أقسامك</span></>} />
      {items.map(([p, i, t, s]) => (
        <button className="menu-item" key={p} onClick={() => go(p)}>
          <span className="i"><Icon name={i} /></span><span className="grow"><b>{t}</b><span className="muted small">{s}</span></span><span className="muted"><Icon name="chevron" size={18} /></span>
        </button>
      ))}
    </>
  );
}

export function App() {
  // رابط مباشر لصفحة: مثل ‎#quran يفتح القرآن على طول
  const fromHash = (): Page | null => {
    const h = window.location.hash.replace("#", "");
    return h && h in TAB_OF ? (h as Page) : null;
  };
  const [page, setPage] = useState<Page>(() => fromHash() ?? "today");
  const [capture, setCapture] = useState(false);
  const [onboarding, setOnboarding] = useState(needsOnboarding);
  const go = (p: string) => {
    setPage(p as Page); window.scrollTo(0, 0);
    // داخل Claude بعض الأسماء محجوزة في الرابط، فنحدّث الرابط في النسخة المستقلة بس
    if (!inArtifact) { try { history.replaceState(null, "", p === "today" ? location.pathname + location.search : `#${p}`); } catch { /* ignore */ } }
  };
  useEffect(() => {
    const onHash = () => { const p = fromHash(); if (p) setPage(p); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const back = () => go("more");
  
  useEffect(() => {
    // نطلب من المتصفح ما يمسح البيانات
    navigator.storage?.persist?.().catch(() => {});
    startSync();
  }, []);

  const tab = TAB_OF[page];
  if (onboarding) return <div className="app"><Onboarding onDone={() => { setOnboarding(false); go(fromHash() ?? "today"); }} /></div>;
  return (
    <div className="app">
      {page === "today" && <Today go={go} />}
      {page === "goals" && <Goals />}
      {page === "chat" && <Chat />}
      {page === "more" && <More go={go} />}
      {page === "people" && <People />}
      {page === "money" && <Money onBack={back} />}
      {page === "journal" && <Journal onBack={back} />}
      {page === "study" && <Study onBack={back} />}
      {page === "insights" && <Insights onBack={back} />}
      {page === "settings" && <Settings onBack={back} />}
      {page === "library" && <Library onBack={back} />}
      {page === "me" && <AboutMe onBack={back} />}
      {page === "quran" && <Quran onBack={back} />}
      {page === "puzzles" && <Puzzles onBack={back} />}
      {page === "habits" && <Habits onBack={back} />}

      <nav className="nav">
        <button className={tab === "today" ? "on" : ""} onClick={() => go("today")}><Icon name="home" />اليوم</button>
        <button className={tab === "goals" ? "on" : ""} onClick={() => go("goals")}><Icon name="target" />أهدافي</button>
        <button className="fab" onClick={() => setCapture(true)} aria-label="سجّل يومك"><Icon name="mic" size={28} /></button>
        <button className={tab === "chat" ? "on" : ""} onClick={() => go("chat")}><Icon name="chat" />المساعد</button>
        <button className={tab === "more" ? "on" : ""} onClick={() => go("more")}><Icon name="grid" />المزيد</button>
      </nav>
      <CaptureSheet open={capture} onClose={() => setCapture(false)} />
      <AskHost />
    </div>
  );
}
