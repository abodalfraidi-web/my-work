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

export function useSpeech(lang: string, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [blocked, setBlocked] = useState(() => blockedForSession || !getSR());
  const recRef = useRef<Rec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

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
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript + " ";
          else interim += r[0].transcript;
        }
        cb.current((finalText + interim).trim());
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
          blockedForSession = true;
          setBlocked(true);
        }
        setListening(false);
      };
      rec.onend = () => setListening(false);
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
    recRef.current?.stop();
    setListening(false);
  }

  return { listening, blocked, start, stop };
}
