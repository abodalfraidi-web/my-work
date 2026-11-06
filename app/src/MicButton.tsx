import { useRef, type RefObject } from "react";
import { Icon } from "./Icon";
import { useSpeech } from "./speech";

/**
 * زر مايك موحّد للتطبيق كامل:
 * - إذا المايك المباشر مسموح: يسمع ويكتب الكلام لحاله، ولما تسكت ينادي onDone.
 * - إذا ممنوع: يفتح الكيبورد في الحقل عشان تستخدم مايك الكيبورد.
 */
export function MicButton({ lang = "ar-SA", onText, onDone, focusRef, size = "md", label, silenceMs }: {
  lang?: "ar-SA" | "en-US";
  onText: (spoken: string, base: string) => void;
  onDone?: (spoken: string, base: string) => void;
  focusRef?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  size?: "md" | "lg";
  label?: string;
  silenceMs?: number;
}) {
  const base = useRef("");
  const speech = useSpeech(lang, (t) => onText(t, base.current), { onSilence: onDone ? (t) => onDone(t, base.current) : undefined, silenceMs });
  function press() {
    if (speech.listening) { speech.stop(); return; }
    base.current = focusRef?.current?.value ?? "";
    if (!speech.blocked && speech.start()) return;
    const el = focusRef?.current;
    if (el) { el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch { /* ignore */ } }
  }
  return (
    <button type="button" className={`mic ${size} ${speech.listening ? "on" : ""}`} onClick={press}
      aria-label={speech.listening ? "وقّف" : label ?? "تكلّم"} title={speech.blocked ? "استخدم مايك الكيبورد" : undefined}>
      <Icon name="mic" size={size === "lg" ? 34 : 20} />
    </button>
  );
}

export { useSpeech };

/** مربع كتابة فيه مايك: تتكلم والكلام ينضاف للنص */
export function VoiceTextarea({ value, onChange, lang = "ar-SA", id, placeholder, className = "textarea", style }: {
  value: string; onChange: (v: string) => void; lang?: "ar-SA" | "en-US"; id?: string; placeholder?: string; className?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="voice-field">
      <textarea ref={ref} id={id} className={className} style={style} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <div className="voice-field-mic">
        <MicButton lang={lang} focusRef={ref} onText={(t, base) => onChange((base ? base + " " : "") + t)} />
      </div>
    </div>
  );
}
