import { useEffect, useState } from "react";
import { CaptureSheet } from "./Capture";
import { Chat } from "./pages/Chat";
import { Onboarding, needsOnboarding } from "./Onboarding";
import { AboutMe } from "./pages/AboutMe";
import { Goals } from "./pages/Goals";
import { Library } from "./pages/Library";
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

type Page = "today" | "goals" | "chat" | "more" | "people" | "money" | "journal" | "study" | "insights" | "settings" | "library" | "me";
const TAB_OF: Record<Page, Page> = {
  today: "today", goals: "goals", chat: "chat", more: "more",
  people: "more", money: "more", journal: "more", study: "more", insights: "more", settings: "more", library: "more", me: "more",
};

function More({ go }: { go: (p: Page) => void }) {
  const items: [Page, IconName, string, string][] = [
    ["me", "me", "عني", "تحليل شخصيتك وخطة تطويرك"],
    ["people", "users", "ناسي", "كل شخص وسجله وتحليله"],
    ["money", "wallet", "فلوسي", "المصاريف والديون"],
    ["journal", "journal", "يومياتي", "وش صار في يومي، مع الصور"],
    ["library", "library", "مكتبتي", "كتبي، وقراءة وكلمات إنجليزي"],
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
  const [page, setPage] = useState<Page>(() => (settings.apiKey || inArtifact ? "today" : "settings"));
  const [capture, setCapture] = useState(false);
  const [onboarding, setOnboarding] = useState(needsOnboarding);
  const go = (p: string) => { setPage(p as Page); window.scrollTo(0, 0); };
  const back = () => go("more");
  
  useEffect(() => {
    // نطلب من المتصفح ما يمسح البيانات
    navigator.storage?.persist?.().catch(() => {});
    startSync();
  }, []);

  const tab = TAB_OF[page];
  if (onboarding) return <div className="app"><Onboarding onDone={() => { setOnboarding(false); go("today"); }} /></div>;
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
