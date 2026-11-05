import { useEffect, useState } from "react";
import { CaptureSheet } from "./Capture";
import { Chat } from "./pages/Chat";
import { Goals } from "./pages/Goals";
import { Insights } from "./pages/Insights";
import { Journal } from "./pages/Journal";
import { Money } from "./pages/Money";
import { People } from "./pages/People";
import { Settings } from "./pages/Settings";
import { Study } from "./pages/Study";
import { Today } from "./pages/Today";
import { Header } from "./ui";
import { settings } from "./utils";

type Page = "today" | "goals" | "chat" | "more" | "people" | "money" | "journal" | "study" | "insights" | "settings";
const TAB_OF: Record<Page, Page> = {
  today: "today", goals: "goals", chat: "chat", more: "more",
  people: "more", money: "more", journal: "more", study: "more", insights: "more", settings: "more",
};

function More({ go }: { go: (p: Page) => void }) {
  const items: [Page, string, string, string][] = [
    ["people", "👥", "ناسي", "كل شخص وسجله وتحليله"],
    ["money", "💰", "فلوسي", "المصاريف والديون"],
    ["journal", "📔", "يومياتي", "وش صار في يومي"],
    ["study", "📚", "المذاكرة والحفظ", "مؤقت ومراجعة متباعدة"],
    ["insights", "📈", "التحليل", "تقارير وأرقام وتوصيات"],
    ["settings", "⚙️", "الإعدادات", "المفتاح والنسخ الاحتياطي"],
  ];
  return (
    <>
      <Header title="المزيد" />
      {items.map(([p, i, t, s]) => (
        <button className="menu-item" key={p} onClick={() => go(p)}>
          <span className="i">{i}</span><span className="grow"><b>{t}</b><span className="muted small">{s}</span></span><span className="muted">←</span>
        </button>
      ))}
    </>
  );
}

export function App() {
  const [page, setPage] = useState<Page>(() => (settings.apiKey ? "today" : "settings"));
  const [capture, setCapture] = useState(false);
  const go = (p: string) => { setPage(p as Page); window.scrollTo(0, 0); };
  const back = () => go("more");

  useEffect(() => {
    // نطلب من المتصفح ما يمسح البيانات
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  const tab = TAB_OF[page];
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

      <nav className="nav">
        <button className={tab === "today" ? "on" : ""} onClick={() => go("today")}><span className="i">🏠</span>اليوم</button>
        <button className={tab === "goals" ? "on" : ""} onClick={() => go("goals")}><span className="i">🎯</span>أهدافي</button>
        <button className="fab" onClick={() => setCapture(true)} aria-label="سجّل">🎙️</button>
        <button className={tab === "chat" ? "on" : ""} onClick={() => go("chat")}><span className="i">💬</span>المساعد</button>
        <button className={tab === "more" ? "on" : ""} onClick={() => go("more")}><span className="i">☰</span>المزيد</button>
      </nav>
      <CaptureSheet open={capture} onClose={() => setCapture(false)} />
    </div>
  );
}
