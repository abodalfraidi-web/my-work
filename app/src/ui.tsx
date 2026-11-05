import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title?: string; children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/** عرض بسيط للماركداون اللي يرجعه المساعد */
export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`u${out.length}`}>{list}</ul>);
    list = [];
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) { list.push(<li key={i}>{inline(li[1])}</li>); return; }
    flush();
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) { out.push(<h4 key={i}>{inline(h[1])}</h4>); return; }
    if (line.trim()) out.push(<p key={i}>{inline(line)}</p>);
  });
  flush();
  return <div className="md">{out}</div>;
}

function inline(s: string): ReactNode[] {
  s = s.replace(/^\[ \]\s*/, "☐ ").replace(/^\[x\]\s*/i, "☑ ");
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : part,
  );
}

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2200);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastCtx.Provider value={setMsg}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastCtx.Provider>
  );
}

export function Check({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button className={`check ${on ? "on" : ""}`} onClick={onClick} aria-label="تم">
      {on ? "✓" : ""}
    </button>
  );
}

export function Progress({ value }: { value: number }) {
  return <div className="progress"><div style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} /></div>;
}

export function Header({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="header">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function BackHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  return (
    <div className="header">
      <div className="row">
        <button className="icon-btn" onClick={onBack} aria-label="رجوع">→</button>
        <h1 style={{ fontSize: 24 }}>{title}</h1>
      </div>
      {right}
    </div>
  );
}

/** نص يتولّد من المساعد مع حالة تحميل وخطأ */
export function useAIText() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: (onText: (s: string) => void) => Promise<string>, friendly: (e: unknown) => string) {
    setBusy(true); setError(null); setText("");
    try { return await fn(setText); }
    catch (e) { setError(friendly(e)); return null; }
    finally { setBusy(false); }
  }
  return { text, setText, busy, error, run };
}
