import { useEffect, useRef, useState } from "react";

/* التعرف على الكلام من المتصفح (Safari يدعمه). داخل صفحة Claude ممكن يكون ممنوع،
   فنرجع لمايك الكيبورد بدون ما نوقف المستخدم. */

type Rec = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};

function getSR(): (new () => Rec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let blockedForSession = false;
let everWorked = false; // إذا اشتغل مرة، ما نعتبر أي رفض لاحق منع دائم

/** الآيفون والآيباد: Safari فيها ما يتعامل كويس مع الاستماع المتواصل */
const isIOS = typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export const SPEECH_ERRORS: Record<string, string> = {
  "no-speech": "ما سمعت صوت. قرّب الجوال وتكلم بصوت أوضح، واضغط الزر مرة ثانية.",
  "network": "التعرف على الصوت يحتاج إنترنت. تأكد من الاتصال وجرّب مرة ثانية.",
  "language-not-supported": "اللغة مو مفعّلة للإملاء. من إعدادات الجوال: عام، لوحة المفاتيح، فعّل الإملاء، وأضف لوحة مفاتيح عربية.",
  "not-allowed": "المايك مرفوض. من إعدادات الجوال: Safari، الميكروفون، اختر سماح. وجرّب مرة ثانية.",
  "service-not-allowed": "خدمة التعرف على الصوت مقفلة. من إعدادات الجوال: Siri، فعّل Siri أو الإملاء، وجرّب مرة ثانية.",
  "audio-capture": "ما قدرت أوصل للمايك. تأكد إن ما فيه تطبيق ثاني يستخدمه.",
};

export function useSpeech(lang: string, onText: (text: string) => void, opts: { onSilence?: (text: string) => void; silenceMs?: number } = {}) {
  const [listening, setListening] = useState(false);
  const [blocked, setBlocked] = useState(() => blockedForSession || !getSR());
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  const silenceCb = useRef(opts.onSilence);
  silenceCb.current = opts.onSilence;
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastText = useRef("");
  const fired = useRef(false);

  useEffect(() => () => { recRef.current?.abort(); }, []);

  function finish() {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    if (fired.current) return;
    fired.current = true;
    if (lastText.current) silenceCb.current?.(lastText.current);
  }

  function start() {
    const SR = getSR();
    if (!SR || blockedForSession) { setBlocked(true); return false; }
    try {
      recRef.current?.abort();
      const rec = new SR();
      rec.lang = lang;
      // في الآيفون: جملة وحدة، ويوقف لحاله لما تسكت. في غيره: متواصل
      rec.continuous = !isIOS;
      rec.interimResults = true;
      let finalText = "";
      lastText.current = "";
      fired.current = false;
      setError(null);
      rec.onresult = (e) => {
        everWorked = true;
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript + " ";
          else interim += r[0].transcript;
        }
        const text = (finalText + interim).trim();
        lastText.current = text;
        cb.current(text);
        // سكوت: إذا ما جا كلام جديد خلال المدة، نوقف ونرسل
        if (silenceCb.current) {
          if (silenceTimer.current) clearTimeout(silenceTimer.current);
          silenceTimer.current = setTimeout(() => { rec.stop(); finish(); }, opts.silenceMs ?? 1800);
        }
      };
      rec.onerror = (e) => {
        // بعد ما اشتغل مرة: الرفض غالباً لأن الآيفون يبي ضغطة منك قبل كل استماع
        if (everWorked && e.error === "not-allowed") setError("اضغط زر المايك عشان تكمّل.");
        else if (e.error !== "aborted") setError(SPEECH_ERRORS[e.error] ?? `صار خطأ في المايك (${e.error}). جرّب مرة ثانية.`);
        if (!everWorked && (e.error === "not-allowed" || e.error === "service-not-allowed")) {
          blockedForSession = true;
          setBlocked(true);
        }
        setListening(false);
      };
      // لما يوقف (خصوصاً في الآيفون بعد ما تسكت) نرسل اللي انقال
      rec.onend = () => { setListening(false); finish(); };
      rec.start();
      recRef.current = rec;
      setListening(true);
      return true;
    } catch (err) {
      setError(`ما قدرت أشغّل المايك: ${err instanceof Error ? err.message : String(err)}`);
      if (!everWorked) { blockedForSession = true; setBlocked(true); }
      setListening(false);
      return false;
    }
  }

  function stop() {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    recRef.current?.stop();
    setListening(false);
  }

  return { listening, blocked, error, start, stop };
}

/* نطق الردود بصوت الجهاز */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/[*_#`>|]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\n{2,}/g, ". ")
    .trim();
}

export function speakOut(text: string, lang: "ar-SA" | "en-US", rate = 1): Promise<void> {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth || !text.trim()) { resolve(); return; }
      synth.cancel();
      const u = new SpeechSynthesisUtterance(cleanForSpeech(text));
      u.lang = lang;
      u.rate = rate;
      const voices = synth.getVoices();
      const v = voices.find((x) => x.lang === lang) ?? voices.find((x) => x.lang.startsWith(lang.slice(0, 2)));
      if (v) u.voice = v;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
    } catch { resolve(); }
  });
}

export function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}
