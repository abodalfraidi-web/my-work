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

export function useSpeech(lang: string, onText: (text: string) => void, opts: { onSilence?: (text: string) => void; silenceMs?: number } = {}) {
  const [listening, setListening] = useState(false);
  const [blocked, setBlocked] = useState(() => blockedForSession || !getSR());
  const recRef = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  const silenceCb = useRef(opts.onSilence);
  silenceCb.current = opts.onSilence;
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastText = useRef("");

  useEffect(() => () => { recRef.current?.abort(); }, []);

  function start() {
    const SR = getSR();
    if (!SR || blockedForSession) { setBlocked(true); return false; }
    try {
      recRef.current?.abort();
      const rec = new SR();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      let finalText = "";
      lastText.current = "";
      rec.onresult = (e) => {
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
          silenceTimer.current = setTimeout(() => {
            rec.stop();
            if (lastText.current) silenceCb.current?.(lastText.current);
          }, opts.silenceMs ?? 1800);
        }
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
          blockedForSession = true;
          setBlocked(true);
        }
        setListening(false);
      };
      rec.onend = () => { setListening(false); if (silenceTimer.current) clearTimeout(silenceTimer.current); };
      rec.start();
      recRef.current = rec;
      setListening(true);
      return true;
    } catch {
      blockedForSession = true;
      setBlocked(true);
      setListening(false);
      return false;
    }
  }

  function stop() {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    recRef.current?.stop();
    setListening(false);
  }

  return { listening, blocked, start, stop };
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
