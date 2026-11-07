import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { friendlyError, teacherNote } from "../ai";
import { db } from "../db";
import {
  applySession, ayahPassed, completeNewPart, computeWird, doneSteps, getSettings, logMistakes, markMemorized, markStep,
  partsOfPage, saveSettings, unmark, type HifzSettings, type WirdStep,
} from "../hifz";
import { Icon } from "../Icon";
import { inArtifact } from "../platform";
import { addXP } from "../progress";
import {
  audioUrl, ayatOfPage, BASMALA, check, juzOfPage, loadQuran, MUTASHABIHAT, normalize, PAGE_COUNT, pageLabel, pageOf,
  pagesOfJuz, pagesOfSura, RECITERS, refLabel, SURAS, TANZIL_NOTICE, words, type CheckResult, type Ref,
} from "../quran";
import { useSpeech } from "../speech";
import { BackHeader, Markdown, Progress, useAIText, useToast } from "../ui";
import { todayISO } from "../utils";

function pref(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function setPref(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* ignore */ }
}

function useQuran() {
  const [q, setQ] = useState<string[][] | null>(null);
  useEffect(() => { loadQuran().then(setQ); }, []);
  return q;
}

const textOf = (q: string[][], [s, a]: Ref) => q[s - 1][a - 1];
const hiddenWord = (w: string) => w.slice(0, 1) + "ـ".repeat(Math.max(2, Math.min(5, normalize(w).length - 1)));

function ResultView({ r }: { r: CheckResult }) {
  return (
    <div className="quran-text" style={{ marginTop: 10 }}>
      {r.words.map((w, i) => (
        <span key={i} className={`qw ${w.status}`} title={"heard" in w ? `قلت: ${w.heard}` : undefined}>{w.word}{" "}</span>
      ))}
    </div>
  );
}

/* =========================================================
   مشغّل التسميع: يسمّع أي مجموعة آيات، ويصحح، ويسجّل الأخطاء
   ========================================================= */

interface AyahResult { ref: Ref; accuracy: number; result: CheckResult | null; override: boolean }

function Reciter({ quran, ayat, title, onFinish, onCancel }: {
  quran: string[][]; ayat: Ref[]; title: string;
  onFinish: (results: AyahResult[]) => void; onCancel: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [override, setOverride] = useState(false);
  const [hint, setHint] = useState(false);
  const [strict, setStrict] = useState(() => pref("masari.q.strict", "1") === "1");
  const [results, setResults] = useState<AyahResult[]>([]);
  const [autoMode, setAutoMode] = useState(false);
  const [pending, setPending] = useState<CheckResult[]>([]); // كل محاولة غلط لهذي الآية
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeech("ar-SA", (t) => setInput(t));

  const ref = ayat[idx];
  const ayah = textOf(quran, ref);
  const passed = override || (!!result && result.accuracy >= 0.9 && !result.words.some((w) => w.status === "missing" || w.status === "wrong"));

  function verify(text = input) {
    if (!text.trim()) return;
    if (speech.listening) speech.stop();
    setOverride(false);
    const r = check(words(ayah), words(text));
    setResult(r);
    if (r.words.some((w) => w.status === "missing" || w.status === "wrong")) setPending((p) => [...p, r]);
  }

  async function next() {
    // دقة الآية: أول محاولة هي اللي تعكس حفظك الحقيقي
    const first = pending[0];
    const accuracy = override ? 1 : first ? first.accuracy : result?.accuracy ?? 0;
    const r: AyahResult = { ref, accuracy, result: first ?? result, override };
    // كل الأخطاء تنسجل في دفتر الأخطاء، إلا إذا قال "قلتها صح"
    if (!override) for (const m of pending) await logMistakes(ref, m);
    if (passed) await ayahPassed(ref);
    setPending([]);
    const all = [...results, r];
    setResults(all);
    if (idx + 1 >= ayat.length) { onFinish(all); return; }
    setIdx(idx + 1); setInput(""); setResult(null); setHint(false); setOverride(false);
  }

  function micPress() {
    if (speech.listening) { speech.stop(); verify(); return; }
    setResult(null); setInput(""); setOverride(false);
    if (!speech.blocked && speech.start()) { setAutoMode(true); return; }
    setAutoMode(false);
    inputRef.current?.focus();
  }

  // تصحيح تلقائي لما تكمل الآية أو تسكت
  useEffect(() => {
    if (result || !input.trim()) return;
    const need = words(ayah).length;
    const t = setTimeout(() => verify(input), words(input).length >= need ? (speech.listening ? 900 : 1200) : 2500);
    return () => clearTimeout(t);
  }, [input]); // eslint-disable-line react-hooks/exhaustive-deps

  // صحّت: ننتقل لحالنا، وفي الوضع المتواصل نرجع نسمع
  useEffect(() => {
    if (!passed) return;
    const t = setTimeout(() => {
      const last = idx >= ayat.length - 1;
      next();
      if (autoMode && !last) setTimeout(() => speech.start(), 300);
    }, 1300);
    return () => clearTimeout(t);
  }, [passed]); // eslint-disable-line react-hooks/exhaustive-deps

  const bad = result?.words.filter((w) => w.status === "missing" || w.status === "wrong").length ?? 0;

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b>{title}</b>
          <span className="badge">{refLabel(ref)} · {idx + 1} من {ayat.length}</span>
        </div>
        <div style={{ margin: "10px 0" }}><Progress value={idx / ayat.length} /></div>
        {ref[1] === 1 && ref[0] !== 1 && ref[0] !== 9 && <div className="quran-text muted" style={{ textAlign: "center", fontSize: 20 }}>{BASMALA}</div>}
        {hint && !result && <div className="quran-text muted">{words(ayah).map((w, i) => <span key={i} className="qw hidden">{hiddenWord(w)} </span>)}</div>}
        {result ? <ResultView r={result} /> : !hint && <div className="muted small">الآية مخفية. سمّعها من حفظك.</div>}
        {result && (
          <div className="row" style={{ marginTop: 8, flexWrap: "wrap", gap: 6 }}>
            <span className={`chip ${passed ? "green" : "gold"}`}>{override ? "اعتمدتها صحيحة" : `دقة ${Math.round(result.accuracy * 100)}%`}</span>
            {!override && result.words.filter((w) => w.status === "missing").length > 0 && <span className="chip red">ناقص {result.words.filter((w) => w.status === "missing").length}</span>}
            {!override && result.words.filter((w) => w.status === "wrong" || w.status === "close").length > 0 && <span className="chip gold">مختلف {result.words.filter((w) => w.status === "wrong" || w.status === "close").length}</span>}
            {!override && result.extra.length > 0 && <span className="chip">زيادة: {result.extra.join(" ")}</span>}
          </div>
        )}
      </div>

      <div className="mic-wrap">
        {speech.blocked ? (
          <label htmlFor="q-input" className="mic-big" role="button" aria-label="سمّع بمايك الكيبورد" onClick={() => setResult(null)}><Icon name="mic" size={34} /></label>
        ) : (
          <button className={`mic-big ${speech.listening ? "on" : ""}`} onClick={micPress} aria-label={speech.listening ? "وقّف وصحّح" : "سمّع بالمايك"}><Icon name="mic" size={34} /></button>
        )}
        {speech.error && !speech.listening && <div className="error small" style={{ textAlign: "center", margin: 0 }}>{speech.error}</div>}
        {speech.listening && input && <div className="small" style={{ textAlign: "center", color: "var(--accent)" }}>سمعت: {input}</div>}
        <div className="muted small" style={{ textAlign: "center" }}>
          {speech.listening ? "أسمعك... سمّع الآية وأنا أصحح لحالي" : passed ? "ممتاز، ننتقل للآية التالية..."
            : speech.blocked ? "اضغط الزر يطلع الكيبورد، بعدها اضغط المايك اللي فيه وسمّع. أصحح لحالي لما تسكت." : "اضغط الزر وسمّع الآية"}
        </div>
      </div>

      <textarea ref={inputRef} id="q-input" className="textarea" style={{ fontSize: 20, minHeight: 80 }} value={input}
        onChange={(e) => { setInput(e.target.value); if (result) setResult(null); }} placeholder="كلامك يطلع هنا..." />
      <div className="grid2" style={{ marginTop: 8 }}>
        {!result ? <>
          <button className="btn" onClick={() => setHint(!hint)}>{hint ? "اخفِ التلميح" : "تلميح (أول الحروف)"}</button>
          <button className="btn primary" onClick={() => verify()} disabled={!input.trim()}>صحّح</button>
        </> : <>
          <button className="btn" onClick={() => { setResult(null); setInput(""); setOverride(false); if (autoMode) speech.start(); else inputRef.current?.focus(); }}>عيد الآية</button>
          <button className="btn primary" onClick={next} disabled={strict && !passed}>{idx >= ayat.length - 1 ? "خلصت" : "الآية التالية"}</button>
        </>}
      </div>
      {result && !passed && bad > 0 && (
        <button className="btn block" style={{ marginTop: 8 }} onClick={() => setOverride(true)}>
          <Icon name="check" size={16} /> قلتها صح، الجوال سمعني غلط
        </button>
      )}
      {result && strict && !passed && <p className="muted small">صحّح الكلمات الملوّنة وعيد الآية، أو اضغط «قلتها صح» إذا متأكد من قراءتك.</p>}
      <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <label className="row small muted" style={{ gap: 6 }}>
          <input type="checkbox" checked={strict} onChange={(e) => { setStrict(e.target.checked); setPref("masari.q.strict", e.target.checked ? "1" : "0"); }} />
          ما أكمل لين أصحح
        </label>
        <button className="btn ghost" onClick={() => { speech.stop(); onCancel(); }}>إيقاف</button>
      </div>
      <div className="legend small muted" style={{ marginTop: 8 }}>
        <span className="qw ok">صحيح</span> <span className="qw close">قريب</span> <span className="qw wrong">مختلف</span> <span className="qw missing">ناقص</span>
      </div>
    </>
  );
}

/** ملخص الجلسة + ملاحظة المعلّم */
function SessionSummary({ results, title, onDone }: { results: AyahResult[]; title: string; onDone: () => void }) {
  const ai = useAIText();
  const acc = results.reduce((s, r) => s + r.accuracy, 0) / Math.max(1, results.length);
  const weak = results.filter((r) => r.accuracy < 0.9 && !r.override);
  function summary() {
    return `المقطع: ${title}\nالدقة: ${Math.round(acc * 100)}%\n` + results.map((r) => {
      const bad = r.result?.words.filter((w) => w.status !== "ok" && w.status !== "close").map((w) => `${w.status === "missing" ? "ناقصة" : "مبدّلة"}: ${w.word}${"heard" in w && w.heard ? ` (قال: ${w.heard})` : ""}`) ?? [];
      return `- ${refLabel(r.ref)}: ${Math.round(r.accuracy * 100)}%${r.override ? " (اعتمدها صحيحة)" : ""}${bad.length ? " | " + bad.join("، ") : ""}`;
    }).join("\n");
  }
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <div className="eyebrow" style={{ textAlign: "center" }}>انتهى التسميع</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 800, color: acc >= 0.9 ? "var(--accent)" : "var(--gold)" }}>{Math.round(acc * 100)}%</div>
      <p className="muted" style={{ margin: "0 0 8px" }}>{title}</p>
      {weak.length > 0 && <p className="small" style={{ margin: "0 0 8px" }}>آيات تحتاج تثبيت: {weak.map((r) => refLabel(r.ref)).join("، ")}. انضافت لدفتر أخطائك.</p>}
      {ai.text && <div style={{ textAlign: "start" }}><Markdown text={ai.text} /></div>}
      {ai.error && <div className="error">{ai.error}</div>}
      <div className="grid2" style={{ marginTop: 8 }}>
        <button className="btn" onClick={() => ai.run((on) => teacherNote(summary(), on), friendlyError)} disabled={ai.busy}>{ai.busy ? "المعلّم يكتب..." : "ملاحظة المعلّم"}</button>
        <button className="btn primary" onClick={onDone}>تم</button>
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>ملاحظة المعلّم تحتاج نسخة Claude أو مفتاح.</p>
    </div>
  );
}

/* =========================================================
   صوت القارئ مع التكرار (النسخة المستقلة)
   ========================================================= */

function AudioLoop({ ayat }: { ayat: Ref[] }) {
  const [reciter, setReciter] = useState(() => pref("masari.reciter", RECITERS[0][0]));
  const [times, setTimes] = useState(() => Number(pref("masari.repeat", "3")));
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { stopRef.current = true; audioRef.current?.pause(); }, []);

  if (inArtifact) {
    return <div className="card muted small">صوت القارئ يشتغل في النسخة المستقلة بس (abodalfraidi-web.github.io/my-work)، لأن صفحة Claude تمنع الصوت من مواقع ثانية.</div>;
  }

  async function playOnce(ref: Ref) {
    return new Promise<void>((resolve, reject) => {
      const a = audioRef.current ?? new Audio();
      audioRef.current = a;
      a.src = audioUrl(reciter, ref);
      a.onended = () => resolve();
      a.onerror = () => reject(new Error("ما قدرت أشغّل الصوت. تأكد من الإنترنت."));
      a.play().catch(reject);
    });
  }
  async function play(list: Ref[]) {
    stopRef.current = false; setError(null);
    try {
      for (const ref of list) {
        for (let i = 0; i < times; i++) {
          if (stopRef.current) return;
          setPlaying(`${refLabel(ref)} · ${i + 1}/${times}`);
          await playOnce(ref);
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر التشغيل"); } finally { setPlaying(null); }
  }
  return (
    <div className="card">
      <h3>استمع للقارئ وكرّر</h3>
      <div className="grid2">
        <select id="q-reciter" className="input" value={reciter} onChange={(e) => { setReciter(e.target.value); setPref("masari.reciter", e.target.value); }}>
          {RECITERS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select id="q-times" className="input" value={times} onChange={(e) => { setTimes(Number(e.target.value)); setPref("masari.repeat", e.target.value); }}>
          {[1, 3, 5, 10, 20].map((n) => <option key={n} value={n}>كل آية {n} مرات</option>)}
        </select>
      </div>
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      <div className="grid2" style={{ marginTop: 8 }}>
        {playing ? <button className="btn" onClick={() => { stopRef.current = true; audioRef.current?.pause(); setPlaying(null); }}>إيقاف ({playing})</button>
          : <button className="btn primary" onClick={() => play(ayat)}><Icon name="play" size={16} /> شغّل المقطع</button>}
        <span className="muted small" style={{ alignSelf: "center" }}>المصدر: everyayah.com</span>
      </div>
    </div>
  );
}

/* =========================================================
   الحفظ الجديد: تكرار 20 نظر و20 غيب، ثم ربط، ثم تسميع
   ========================================================= */

function Memorize({ quran, ayat, title, onPassed, onExit }: { quran: string[][]; ayat: Ref[]; title: string; onPassed?: () => void; onExit: () => void }) {
  const toast = useToast();
  const [i, setI] = useState(0);
  const [look, setLook] = useState(0);
  const [blind, setBlind] = useState(0);
  const [phase, setPhase] = useState<"ayah" | "join" | "recite" | "summary">("ayah");
  const [level, setLevel] = useState(0);
  const [results, setResults] = useState<AyahResult[]>([]);
  const target = Number(pref("masari.repeatTarget", "20"));
  const ref = ayat[i];
  const ws = ref ? words(textOf(quran, ref)) : [];
  const hiddenJoin = useMemo(() => ayat.map((r, ai) => words(textOf(quran, r)).map((_, wi) => ((wi * 7 + ai * 3) % 4) < level)), [ayat, level, quran]);

  if (phase === "recite") {
    return <Reciter quran={quran} ayat={ayat} title={`تسميع: ${title}`} onCancel={() => setPhase("join")} onFinish={async (r) => {
      setResults(r); setPhase("summary");
      const acc = r.reduce((s, x) => s + x.accuracy, 0) / r.length;
      await addXP("quran", Math.round(10 * acc * r.length));
      if (acc >= 0.9 && onPassed) { onPassed(); toast("ممتاز! انحفظ المقطع"); }
    }} />;
  }
  if (phase === "summary") {
    const acc = results.reduce((s, x) => s + x.accuracy, 0) / Math.max(1, results.length);
    return <>
      <SessionSummary results={results} title={title} onDone={onExit} />
      {acc < 0.9 && <button className="btn block" onClick={() => setPhase("join")}>أرجع أراجع المقطع وأعيد التسميع</button>}
    </>;
  }

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b>{title}</b>
          <span className="badge teal">{phase === "ayah" ? `آية ${i + 1} من ${ayat.length}` : "ربط المقطع"}</span>
        </div>
        <div style={{ margin: "10px 0" }}><Progress value={phase === "ayah" ? i / ayat.length : 1} /></div>
        {phase === "ayah" && ref && <>
          <div className="quran-text">
            {ref[1] === 1 && ref[0] !== 1 && ref[0] !== 9 && <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 20 }}>{BASMALA}</div>}
            {look >= target ? ws.map((w, k) => <span key={k} className="qw hidden">{hiddenWord(w)} </span>) : textOf(quran, ref)}
            <span style={{ color: "var(--gold)" }}> ﴿{ref[1]}﴾</span>
          </div>
          <div className="grid2" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => setLook(Math.min(target, look + 1))} disabled={look >= target}>
              قرأتها نظر <span className="badge">{look}/{target}</span>
            </button>
            <button className="btn" onClick={() => setBlind(Math.min(target, blind + 1))} disabled={look < target || blind >= target}>
              قرأتها غيب <span className="badge teal">{blind}/{target}</span>
            </button>
          </div>
          <p className="muted small">اقرأ الآية {target} مرة وأنت تشوفها (اضغط مع كل مرة)، بعدها تنخفي وتقرأها {target} مرة من حفظك.</p>
          <div className="grid2">
            <button className="btn ghost" onClick={() => { if (i + 1 < ayat.length) { setI(i + 1); setLook(0); setBlind(0); } else setPhase("join"); }}>تخطّي</button>
            <button className="btn primary" disabled={blind < target} onClick={() => { if (i + 1 < ayat.length) { setI(i + 1); setLook(0); setBlind(0); } else setPhase("join"); }}>
              {i + 1 < ayat.length ? "الآية التالية" : "اربط المقطع"}
            </button>
          </div>
        </>}
        {phase === "join" && <>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="small muted">اقرأ المقطع كامل، وزد الإخفاء شوي شوي</span>
            <span className="badge teal">{["0%", "25%", "50%", "75%", "100%"][level]}</span>
          </div>
          <input id="q-join-level" type="range" min={0} max={4} value={level} onChange={(e) => setLevel(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--accent)" }} />
          <div className="quran-text" style={{ marginTop: 8 }}>
            {ayat.map((r, ai) => <span key={ai}>{words(textOf(quran, r)).map((w, wi) => hiddenJoin[ai][wi] ? <span key={wi} className="qw hidden">{hiddenWord(w)} </span> : <span key={wi}>{w} </span>)}<span style={{ color: "var(--gold)" }}>﴿{r[1]}﴾</span> </span>)}
          </div>
          <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => setPhase("recite")}><Icon name="mic" size={18} /> سمّع المقطع كامل</button>
        </>}
      </div>
      <AudioLoop ayat={phase === "ayah" && ref ? [ref] : ayat} />
      <div className="row" style={{ justifyContent: "space-between" }}>
        <label className="small muted row" style={{ gap: 6 }}>عدد التكرار:
          <select id="q-target" className="input" style={{ width: "auto", padding: "4px 8px" }} value={target} onChange={(e) => { setPref("masari.repeatTarget", e.target.value); setLook(0); setBlind(0); }}>
            {[5, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button className="btn ghost" onClick={onExit}>رجوع</button>
      </div>
    </>
  );
}

/* =========================================================
   وردي اليومي: مراجعة قريبة، بعيدة، أخطاء، جديد، ربط
   ========================================================= */

type Session = { kind: "recite" | "memorize"; step?: WirdStep; ayat: Ref[]; title: string; page?: number };

function Wird({ quran, open, goMap }: { quran: string[][]; open: (s: Session) => void; goMap: () => void }) {
  const settings = getSettings();
  const wird = useLiveQuery(() => computeWird(settings), []);
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 2000); return () => clearInterval(t); }, []);
  if (!wird) return <div className="card empty">يجهّز وردك...</div>;
  const done = doneSteps();
  const reviewPending = (wird.near.length > 0 && !done.has("near")) || (wird.far.length > 0 && !done.has("far"));
  const ayatOfPages = (ps: number[]) => ps.flatMap((p) => ayatOfPage(p));
  const parts = wird.newPage ? partsOfPage(wird.newPage, settings.newPart) : [];

  type Row = { step: WirdStep; title: string; desc: string; mins: string; ayat: Ref[]; show: boolean; kind: Session["kind"]; locked?: boolean };
  const rows: Row[] = [
    { step: "near", title: "المراجعة القريبة", desc: wird.near.length ? `آخر ${wird.near.length} أوجه حفظتها: ${wird.near.join("، ")}` : "", mins: "7 د", ayat: ayatOfPages(wird.near), show: wird.near.length > 0, kind: "recite" },
    { step: "far", title: "المراجعة البعيدة", desc: wird.far.length ? `أوجه حان موعدها: ${wird.far.join("، ")}` : "", mins: "7 د", ayat: ayatOfPages(wird.far), show: wird.far.length > 0, kind: "recite" },
    { step: "mistakes", title: "تدريب أخطائي", desc: `${wird.mistakes.length} آيات فيها أخطاء: ${wird.mistakes.slice(0, 4).map(refLabel).join("، ")}`, mins: "2 د", ayat: wird.mistakes, show: wird.mistakes.length > 0, kind: "recite" },
    { step: "new", title: "الحفظ الجديد", desc: wird.newPage ? `${pageLabel(wird.newPage)}، الجزء ${wird.newPart + 1} من ${parts.length}: ${wird.newAyat.length} آيات` : "خلصت المصحف كامل، ما شاء الله!", mins: "7 د", ayat: wird.newAyat, show: !!wird.newPage, kind: "memorize", locked: reviewPending },
  ];
  const visible = rows.filter((r) => r.show);
  const doneCount = visible.filter((r) => done.has(r.step)).length;

  return (
    <>
      <div className="hero">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b>وردي اليوم</b>
          <span className="badge">{doneCount} من {visible.length}</span>
        </div>
        <div style={{ margin: "10px 0 6px" }}><Progress value={visible.length ? doneCount / visible.length : 0} /></div>
        <div className="muted small">تحفظ {wird.totalMemorized} وجه · القاعدة: المراجعة قبل الحفظ الجديد</div>
      </div>
      {wird.totalMemorized === 0 && (
        <div className="card">
          <b>عندك محفوظات من قبل؟</b>
          <p className="muted small" style={{ margin: "4px 0 8px" }}>علّمها من خريطتي عشان تدخل في المراجعة، أو ابدأ الحفظ الجديد مباشرة.</p>
          <button className="btn block" onClick={goMap}>علّم محفوظاتي</button>
        </div>
      )}
      {visible.map((r) => {
        const isDone = done.has(r.step);
        return (
          <div className="card" key={r.step} style={{ opacity: isDone ? 0.6 : 1 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b className="row" style={{ gap: 8 }}>{isDone ? <Icon name="check" size={18} className="title-icon" /> : <span className="badge teal">{r.mins}</span>}{r.title}</b>
              <button className={`btn ${isDone ? "" : "primary"}`} disabled={!r.ayat.length}
                onClick={() => open({ kind: r.kind, step: r.step, ayat: r.ayat, title: r.title, page: r.step === "new" ? wird.newPage ?? undefined : undefined })}>
                {isDone ? "عيد" : r.kind === "memorize" ? "ابدأ الحفظ" : "سمّع"}
              </button>
            </div>
            <div className="muted small" style={{ marginTop: 4 }}>{r.desc}</div>
            {r.locked && !isDone && <div className="chip gold" style={{ marginTop: 6 }}>راجع أول، بعدها احفظ الجديد</div>}
          </div>
        );
      })}
      {wird.newPage && done.has("new") && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>الربط</b>
            <button className="btn primary" onClick={() => {
              const prev = wird.near.slice(-1);
              open({ kind: "recite", step: "link", ayat: [...ayatOfPages(prev).slice(-3), ...wird.newAyat], title: "ربط أمس مع اليوم" });
            }}>سمّع</button>
          </div>
          <div className="muted small">تسمّع آخر آيات أمس مع حفظ اليوم في مرة وحدة.</div>
        </div>
      )}
      <p className="muted small">التسميع يكشف الكلمات الناقصة والمبدّلة فقط، وما يقيس التجويد والتشكيل.</p>
      {quran && null}
    </>
  );
}

/* =========================================================
   اختبارات: الآية التالية، من أي سورة، أكمل، تسميع من مكان عشوائي
   ========================================================= */

function shuffle<T>(a: T[]): T[] { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

function Tests({ quran, open }: { quran: string[][]; open: (s: Session) => void }) {
  const memorized = useLiveQuery(() => db.hifz.where("status").equals("memorized").toArray(), []);
  const pages = (memorized ?? []).map((r) => r.page);
  const pool: Ref[] = useMemo(() => (pages.length ? pages : pagesOfJuz(30)).flatMap((p) => ayatOfPage(p)), [pages.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const [q, setQ] = useState<null | { type: "next" | "sura"; ref: Ref; options: { label: string; ok: boolean }[] }>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState({ ok: 0, all: 0 });

  function nextQuestion() {
    setPicked(null);
    const valid = pool.filter(([s, a]) => a < SURAS[s - 1][1]);
    const ref = valid[Math.floor(Math.random() * valid.length)];
    if (!ref) return;
    if (Math.random() < 0.6) {
      const correct: Ref = [ref[0], ref[1] + 1];
      const distract = shuffle(pool.filter((r) => !(r[0] === correct[0] && r[1] === correct[1]) && !(r[0] === ref[0] && r[1] === ref[1]))).slice(0, 3);
      setQ({ type: "next", ref, options: shuffle([{ label: textOf(quran, correct), ok: true }, ...distract.map((r) => ({ label: textOf(quran, r), ok: false }))]) });
    } else {
      const suraPool = [...new Set(pool.map((r) => r[0]))].filter((s) => s !== ref[0]);
      const others = shuffle(suraPool.length >= 3 ? suraPool : Array.from({ length: 114 }, (_, i) => i + 1).filter((s) => s !== ref[0])).slice(0, 3);
      setQ({ type: "sura", ref, options: shuffle([{ label: SURAS[ref[0] - 1][0], ok: true }, ...others.map((s) => ({ label: SURAS[s - 1][0], ok: false }))]) });
    }
  }

  return (
    <>
      <div className="card">
        <h3>اختبار سريع <span className="badge teal">{score.ok}/{score.all}</span></h3>
        <p className="muted small" style={{ marginTop: 0 }}>{pages.length ? `من محفوظك (${pages.length} وجه)` : "من جزء عمّ (علّم محفوظاتك من خريطتي عشان يختبرك فيها)"}</p>
        {!q ? <button className="btn primary block" onClick={nextQuestion}>ابدأ</button> : <>
          <div className="small muted">{q.type === "next" ? "وش الآية اللي بعد هذي؟" : "هذي الآية من أي سورة؟"}</div>
          <div className="quran-text" style={{ margin: "6px 0 10px" }}>{textOf(quran, q.ref)}</div>
          <div className="stack">
            {q.options.map((o, k) => {
              const style = picked === null ? undefined : o.ok ? { background: "var(--accent)", color: "var(--accent-ink)" } : k === picked ? { background: "var(--danger)", color: "#2a0503" } : { opacity: 0.5 };
              return <button key={k} className="btn block" style={{ ...style, fontFamily: q.type === "next" ? "var(--font-quran, inherit)" : undefined, textAlign: "start", lineHeight: 1.8 }}
                onClick={() => { if (picked !== null) return; setPicked(k); setScore({ ok: score.ok + (o.ok ? 1 : 0), all: score.all + 1 }); if (o.ok) addXP("quran", 2); }}>{o.label}</button>;
            })}
          </div>
          {picked !== null && <button className="btn primary block" style={{ marginTop: 10 }} onClick={nextQuestion}>التالي</button>}
        </>}
      </div>
      <div className="card">
        <h3>تسميع من مكان عشوائي</h3>
        <p className="muted small" style={{ marginTop: 0 }}>يبدأ معك من آية عشوائية في محفوظك وتكمّل 3 آيات. يكشف الحفظ اللي يعتمد على الآية اللي قبله.</p>
        <button className="btn primary block" onClick={() => {
          const start = Math.floor(Math.random() * Math.max(1, pool.length - 3));
          open({ kind: "recite", ayat: pool.slice(start, start + 3), title: "تسميع عشوائي" });
        }}><Icon name="mic" size={18} /> ابدأ</button>
      </div>
    </>
  );
}

/* =========================================================
   مدرّب الآيات المتشابهة
   ========================================================= */

function diffWords(a: string, b: string): Set<number> {
  const wa = words(a).map(normalize), wb = new Set(words(b).map(normalize));
  return new Set(wa.map((w, i) => (wb.has(w) ? -1 : i)).filter((i) => i >= 0));
}

function Mutashabihat({ quran, open }: { quran: string[][]; open: (s: Session) => void }) {
  const memorized = useLiveQuery(() => db.hifz.where("status").equals("memorized").toArray(), []);
  const mem = new Set((memorized ?? []).map((r) => r.page));
  const [onlyMine, setOnlyMine] = useState(true);
  const pairs = MUTASHABIHAT.filter(([s1, a1, s2, a2]) => !onlyMine || mem.has(pageOf([s1, a1])) || mem.has(pageOf([s2, a2])));
  const [quiz, setQuiz] = useState<null | { pair: (typeof MUTASHABIHAT)[number]; which: 0 | 1; picked: number | null; order: number[] }>(null);

  function startQuiz() {
    const list = pairs.length ? pairs : MUTASHABIHAT;
    const pair = list[Math.floor(Math.random() * list.length)];
    setQuiz({ pair, which: Math.random() < 0.5 ? 0 : 1, picked: null, order: shuffle([0, 1]) });
  }

  const showPair = (p: (typeof MUTASHABIHAT)[number], k: number) => {
    const A: Ref = [p[0], p[1]], B: Ref = [p[2], p[3]];
    const ta = textOf(quran, A), tb = textOf(quran, B);
    const da = diffWords(ta, tb), db2 = diffWords(tb, ta);
    return (
      <div className="card" key={k}>
        {[[A, ta, da], [B, tb, db2]].map(([ref, t, d], j) => (
          <div key={j} style={{ marginBottom: j === 0 ? 10 : 0 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="chip accent">{refLabel(ref as Ref)}</span>
              <button className="btn ghost" onClick={() => open({ kind: "recite", ayat: [ref as Ref], title: `متشابهات: ${refLabel(ref as Ref)}` })}>سمّعها</button>
            </div>
            <div className="quran-text" style={{ fontSize: 21 }}>
              {words(t as string).map((w, wi) => <span key={wi} className={(d as Set<number>).has(wi) ? "qw close" : undefined}>{w} </span>)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="card">
        <h3>مدرّب المتشابهات <span className="badge">{pairs.length} زوج</span></h3>
        <p className="muted small" style={{ marginTop: 0 }}>آيات متشابهة اكتشفها التطبيق من نص المصحف. الكلمات الملوّنة هي الفرق بينها.</p>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> بس اللي في محفوظي</label>
        <button className="btn primary block" style={{ marginTop: 8 }} onClick={startQuiz}>اختبرني: أي صياغة صحيحة؟</button>
      </div>
      {quiz && (() => {
        const [s1, a1, s2, a2] = quiz.pair;
        const refs: Ref[] = [[s1, a1], [s2, a2]];
        const target = refs[quiz.which];
        return (
          <div className="card">
            <div className="small muted">في <b>{refLabel(target)}</b>، وش الصياغة الصحيحة؟</div>
            <div className="stack" style={{ marginTop: 8 }}>
              {quiz.order.map((k) => {
                const ok = k === quiz.which;
                const style = quiz.picked === null ? undefined : ok ? { background: "var(--accent)", color: "var(--accent-ink)" } : quiz.picked === k ? { background: "var(--danger)", color: "#2a0503" } : undefined;
                return <button key={k} className="btn block quran-text" style={{ ...style, fontSize: 19, textAlign: "start", fontWeight: 400 }}
                  onClick={() => { if (quiz.picked !== null) return; setQuiz({ ...quiz, picked: k }); if (ok) addXP("quran", 3); }}>{textOf(quran, refs[k])}</button>;
              })}
            </div>
            {quiz.picked !== null && <button className="btn primary block" style={{ marginTop: 10 }} onClick={startQuiz}>التالي</button>}
          </div>
        );
      })()}
      {(onlyMine && pairs.length === 0) && <div className="card empty">ما فيه متشابهات في محفوظك المعلّم. اطفِ الخيار عشان تشوف كل المتشابهات.</div>}
      {pairs.slice(0, 30).map(showPair)}
    </>
  );
}

/* =========================================================
   خريطتي: 604 وجه، وتعليم المحفوظات، والإعدادات
   ========================================================= */

function MyMap({ open }: { open: (s: Session) => void }) {
  const toast = useToast();
  const rows = useLiveQuery(() => db.hifz.toArray(), []);
  const map = new Map((rows ?? []).map((r) => [r.page, r]));
  const [s, setS] = useState<HifzSettings>(getSettings);
  const [sel, setSel] = useState<number | null>(null);
  const [bulk, setBulk] = useState("30");
  const memorized = (rows ?? []).filter((r) => r.status === "memorized").length;
  const update = (patch: Partial<HifzSettings>) => { const n = { ...s, ...patch }; setS(n); saveSettings(n); };
  const today = todayISO();
  const color = (p: number) => {
    const r = map.get(p);
    if (!r) return undefined;
    if (r.status === "learning") return "color-mix(in srgb, var(--gold) 55%, var(--card-2))";
    if (r.due <= today) return "color-mix(in srgb, var(--gold) 35%, var(--card-2))";
    return `color-mix(in srgb, var(--accent) ${40 + r.step * 9}%, var(--card-2))`;
  };

  async function bulkMark(add: boolean) {
    const [kind, n] = bulk.startsWith("s") ? ["sura", Number(bulk.slice(1))] : ["juz", Number(bulk)];
    const pages = kind === "sura" ? pagesOfSura(n) : pagesOfJuz(n);
    if (add) await markMemorized(pages.filter((p) => map.get(p)?.status !== "memorized")); else await unmark(pages);
    toast(add ? `تعلّم ${pages.length} وجه كمحفوظ` : "انشالت");
  }

  return (
    <>
      <div className="card">
        <h3>خريطة الحفظ <span className="badge teal">{memorized} من 604</span></h3>
        <Progress value={memorized / PAGE_COUNT} />
        <div className="qmap pages" style={{ marginTop: 12 }}>
          {Array.from({ length: PAGE_COUNT }, (_, i) => i + 1).map((p) => (
            <button key={p} className={`qcell ${p === sel ? "sel" : ""}`} title={pageLabel(p)} style={{ background: color(p) }} onClick={() => setSel(p)}>{p}</button>
          ))}
        </div>
        <div className="legend small muted" style={{ marginTop: 8 }}>
          <span className="qw ok">محفوظ</span> <span className="qw close">يحتاج مراجعة</span> <span className="chip">ما انحفظ</span>
        </div>
      </div>
      {sel && (
        <div className="card">
          <b>{pageLabel(sel)} · الجزء {juzOfPage(sel)}</b>
          <div className="muted small">{map.get(sel) ? `${map.get(sel)!.status === "memorized" ? "محفوظ" : "قيد الحفظ"} · المراجعة الجاية ${map.get(sel)!.due}${map.get(sel)!.lastScore ? ` · آخر دقة ${Math.round(map.get(sel)!.lastScore * 100)}%` : ""}` : "ما انحفظ بعد"}</div>
          <div className="grid2" style={{ marginTop: 8 }}>
            <button className="btn primary" onClick={() => open({ kind: "recite", ayat: ayatOfPage(sel), title: pageLabel(sel) })}>سمّع الوجه</button>
            {map.get(sel)?.status === "memorized"
              ? <button className="btn" onClick={() => unmark([sel])}>شيله من محفوظي</button>
              : <button className="btn" onClick={() => markMemorized([sel], false)}>أحفظه من قبل</button>}
          </div>
        </div>
      )}
      <div className="card">
        <h3>علّم محفوظاتك القديمة</h3>
        <div className="row">
          <select id="q-bulk" className="input" value={bulk} onChange={(e) => setBulk(e.target.value)}>
            <optgroup label="الأجزاء">{Array.from({ length: 30 }, (_, i) => 30 - i).map((j) => <option key={j} value={String(j)}>الجزء {j}</option>)}</optgroup>
            <optgroup label="السور">{SURAS.map(([n], i) => <option key={i} value={`s${i + 1}`}>{i + 1}. {n}</option>)}</optgroup>
          </select>
        </div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <button className="btn primary" onClick={() => bulkMark(true)}>علّمه محفوظ</button>
          <button className="btn" onClick={() => bulkMark(false)}>شيله</button>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>المحفوظات القديمة تنوزّع مراجعتها على الأسبوعين الجايين، وبعدها كل وجه يتحدد موعده من نتيجة تسميعك.</p>
      </div>
      <div className="card">
        <h3>إعدادات الحفظ</h3>
        <label className="field"><span>اتجاه الحفظ</span>
          <div className="chips">
            <button className={`chip ${s.direction === "backward" ? "on" : ""}`} onClick={() => update({ direction: "backward" })}>من الناس للبقرة</button>
            <button className={`chip ${s.direction === "forward" ? "on" : ""}`} onClick={() => update({ direction: "forward" })}>من البقرة للناس</button>
          </div>
        </label>
        <label className="field"><span>أبدأ الحفظ الجديد من وجه</span>
          <input id="q-start" className="input" type="number" min={1} max={604} value={s.startPage} onChange={(e) => update({ startPage: Math.min(604, Math.max(1, Number(e.target.value) || 1)) })} />
        </label>
        <label className="field"><span>مقدار الحفظ الجديد كل يوم</span>
          <div className="chips">
            {([[3, "ثلث وجه (5 أسطر تقريباً)"], [2, "نص وجه"], [1, "وجه كامل"]] as const).map(([n, l]) => <button key={n} className={`chip ${s.newPart === n ? "on" : ""}`} onClick={() => update({ newPart: n })}>{l}</button>)}
          </div>
        </label>
        <div className="grid2">
          <label className="field"><span>المراجعة القريبة (آخر كم وجه)</span>
            <input id="q-near" className="input" type="number" min={1} max={20} value={s.nearCount} onChange={(e) => update({ nearCount: Math.min(20, Math.max(1, Number(e.target.value) || 5)) })} />
          </label>
          <label className="field"><span>المراجعة البعيدة (كم وجه باليوم)</span>
            <input id="q-far" className="input" type="number" min={1} max={20} value={s.farPerDay} onChange={(e) => update({ farPerDay: Math.min(20, Math.max(1, Number(e.target.value) || 2)) })} />
          </label>
        </div>
        <p className="muted small" style={{ margin: 0 }}>النصيحة للبداية: ثلث وجه جديد، و5 أوجه مراجعة قريبة، ووجهين بعيدة. ولا تزيد الجديد إلا إذا مراجعتك ثابتة.</p>
      </div>
    </>
  );
}

/* =========================================================
   تسميع حر (تختار السورة والآيات)
   ========================================================= */

function FreeRecite({ open }: { open: (s: Session) => void }) {
  const [sura, setSura] = useState(() => Number(pref("masari.q.sura", "67")));
  const [from, setFrom] = useState(() => Number(pref("masari.q.from", "1")));
  const [to, setTo] = useState(() => Number(pref("masari.q.to", "5")));
  const max = SURAS[sura - 1][1];
  const set = (s: number, f: number, t: number) => {
    setSura(s); setFrom(f); setTo(t);
    setPref("masari.q.sura", String(s)); setPref("masari.q.from", String(f)); setPref("masari.q.to", String(t));
  };
  const range: Ref[] = Array.from({ length: to - from + 1 }, (_, i) => [sura, from + i]);
  return (
    <>
      <div className="card">
        <label className="field"><span>السورة</span>
          <select id="q-sura" className="input" value={sura} onChange={(e) => { const s = Number(e.target.value); set(s, 1, Math.min(SURAS[s - 1][1], 5)); }}>
            {SURAS.map(([name, n, type], i) => <option key={i} value={i + 1}>{i + 1}. {name} ({n} آية، {type})</option>)}
          </select>
        </label>
        <div className="grid2">
          <label className="field"><span>من آية</span>
            <input id="q-from" className="input" type="number" min={1} max={max} value={from} onChange={(e) => { const f = Math.min(max, Math.max(1, Number(e.target.value) || 1)); set(sura, f, Math.max(f, to)); }} />
          </label>
          <label className="field"><span>إلى آية</span>
            <input id="q-to" className="input" type="number" min={from} max={max} value={to} onChange={(e) => set(sura, from, Math.min(max, Math.max(from, Number(e.target.value) || from)))} />
          </label>
        </div>
      </div>
      <div className="grid2">
        <button className="btn primary" onClick={() => open({ kind: "recite", ayat: range, title: `${SURAS[sura - 1][0]} ${from}-${to}` })}><Icon name="mic" size={18} /> ابدأ التسميع</button>
        <button className="btn" onClick={() => open({ kind: "memorize", ayat: range, title: `${SURAS[sura - 1][0]} ${from}-${to}` })}>احفظ المقطع</button>
      </div>
      <p className="muted small">الآيات تكون مخفية. اضغط زر المايك الكبير وسمّع. التصحيح يصير لحاله لما تسكت.</p>
    </>
  );
}

/* =========================================================
   الصفحة
   ========================================================= */

type Tab = "wird" | "free" | "tests" | "similar" | "map";

export function Quran({ onBack }: { onBack: () => void }) {
  const quran = useQuran();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(() => pref("masari.q.tab2", "wird") as Tab);
  const [session, setSession] = useState<Session | null>(null);
  const [summary, setSummary] = useState<{ results: AyahResult[]; title: string } | null>(null);
  const go = (t: Tab) => { setTab(t); setPref("masari.q.tab2", t); setSession(null); setSummary(null); };

  async function finishRecite(s: Session, results: AyahResult[]) {
    await applySession(results.map((r) => ({ ref: r.ref, accuracy: r.accuracy })));
    const acc = results.reduce((x, r) => x + r.accuracy, 0) / results.length;
    await db.recitations.add({ sura: results[0].ref[0], from: results[0].ref[1], to: results.at(-1)!.ref[1], accuracy: acc, date: todayISO(), createdAt: Date.now() });
    await addXP("quran", Math.round(5 * results.length * acc));
    if (s.step) markStep(s.step);
    setSession(null); setSummary({ results, title: s.title });
  }

  const tabs: [Tab, string][] = [["wird", "وردي"], ["free", "تسميع"], ["tests", "اختبار"], ["similar", "المتشابهات"], ["map", "خريطتي"]];

  let body: React.ReactNode = null;
  if (!quran) body = <div className="card empty">يحمّل المصحف...</div>;
  else if (summary) body = <SessionSummary results={summary.results} title={summary.title} onDone={() => setSummary(null)} />;
  else if (session?.kind === "recite") body = <Reciter quran={quran} ayat={session.ayat} title={session.title} onCancel={() => setSession(null)} onFinish={(r) => finishRecite(session, r)} />;
  else if (session?.kind === "memorize") body = (
    <Memorize quran={quran} ayat={session.ayat} title={session.title} onExit={() => setSession(null)}
      onPassed={session.page ? async () => {
        const parts = partsOfPage(session.page!, getSettings().newPart).length;
        const whole = await completeNewPart(session.page!, parts);
        markStep("new");
        if (whole) toast("ما شاء الله! انحفظ الوجه كامل");
      } : undefined} />
  );
  else if (tab === "wird") body = <Wird quran={quran} open={setSession} goMap={() => go("map")} />;
  else if (tab === "free") body = <FreeRecite open={setSession} />;
  else if (tab === "tests") body = <Tests quran={quran} open={setSession} />;
  else if (tab === "similar") body = <Mutashabihat quran={quran} open={setSession} />;
  else body = <MyMap open={setSession} />;

  return (
    <>
      <BackHeader title="القرآن" onBack={onBack} />
      <div className="chips" style={{ marginBottom: 12 }}>
        {tabs.map(([t, l]) => <button key={t} className={`chip ${tab === t && !session ? "on" : ""}`} onClick={() => go(t)}>{l}</button>)}
      </div>
      {body}
      <p className="muted small" style={{ textAlign: "center", marginTop: 16 }}>
        {TANZIL_NOTICE} <a href="https://tanzil.net" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>tanzil.net</a>
      </p>
    </>
  );
}
