import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { friendlyError, makeMathProblem, makeTrivia, type MathProblemT, type TriviaT } from "../ai";
import { Icon } from "../Icon";
import { addXP, areaStreak, getDaily, setDaily } from "../progress";
import { BackHeader, Progress, useToast } from "../ui";
import { todayISO } from "../utils";

function pref(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function setPref(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* ignore */ }
}

/** تقييم يرتفع وينزل مثل ألغاز الشطرنج */
function useRating() {
  const [rating, setRating] = useState(() => Number(pref("masari.rating", "1000")));
  const change = (delta: number) => {
    const r = Math.max(100, rating + delta);
    setRating(r); setPref("masari.rating", String(r));
  };
  return [rating, change] as const;
}

function doneToday(kind: string): boolean {
  return pref(`masari.pz.${kind}`, "") === todayISO();
}
function markDone(kind: string) { setPref(`masari.pz.${kind}`, todayISO()); }

/* ---------------- مسابقة الثقافة ---------------- */

const TOPICS = ["تاريخ إسلامي", "علوم", "جغرافيا", "تاريخ السعودية", "رياضة", "تقنية", "لغة عربية", "معلومات عامة"];

function Trivia({ onScore }: { onScore: (d: number) => void }) {
  const toast = useToast();
  const daily = useLiveQuery(() => getDaily<TriviaT>("trivia"), []);
  const [topics, setTopics] = useState<string[]>(() => JSON.parse(pref("masari.topics", JSON.stringify(TOPICS.slice(0, 4)))));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [playing, setPlaying] = useState(false);
  const finished = doneToday("trivia");

  async function load() {
    setBusy(true); setError(null);
    try { await setDaily("trivia", await makeTrivia(topics)); setPlaying(true); }
    catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  function toggle(t: string) {
    const next = topics.includes(t) ? topics.filter((x) => x !== t) : [...topics, t];
    setTopics(next); setPref("masari.topics", JSON.stringify(next));
  }
  async function pick(k: number) {
    if (!daily || picked !== null) return;
    const q = daily.questions[i];
    setPicked(k);
    if (k === q.answer) { setScore(score + 1); onScore(8); } else onScore(-4);
  }
  async function next() {
    if (!daily) return;
    if (i + 1 >= daily.questions.length) {
      markDone("trivia"); await addXP("puzzle", score * 2);
      toast(`نتيجتك ${score} من ${daily.questions.length}`);
      setPlaying(false); return;
    }
    setI(i + 1); setPicked(null);
  }

  if (!playing || !daily) {
    return (
      <div className="card">
        <h3>مسابقة الثقافة اليومية <span className={`badge ${finished ? "teal" : ""}`}>{finished ? "خلصتها" : "10 أسئلة"}</span></h3>
        <div className="chips" style={{ marginBottom: 10 }}>{TOPICS.map((t) => <button key={t} className={`chip ${topics.includes(t) ? "on" : ""}`} onClick={() => toggle(t)}>{t}</button>)}</div>
        {error && <div className="error">{error}</div>}
        <button className="btn primary block" disabled={busy || !topics.length || finished}
          onClick={() => (daily ? (setPlaying(true), setI(0), setScore(0), setPicked(null)) : load())}>
          {finished ? "رجّع بكرة لأسئلة جديدة" : busy ? "يجهّز الأسئلة..." : daily ? "كمّل المسابقة" : "ابدأ"}
        </button>
      </div>
    );
  }
  const q = daily.questions[i];
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <b>مسابقة الثقافة</b><span className="badge">{i + 1} من {daily.questions.length}</span>
      </div>
      <Progress value={i / daily.questions.length} />
      <p style={{ fontSize: 18, fontWeight: 600, margin: "14px 0" }}>{q.q}</p>
      <div className="stack">
        {q.options.map((o, k) => {
          const style = picked === null ? undefined
            : k === q.answer ? { background: "var(--accent)", color: "var(--accent-ink)" }
            : k === picked ? { background: "var(--danger)", color: "#2a0503" } : { opacity: 0.6 };
          return <button key={k} className="btn block" style={style} onClick={() => pick(k)}>{o}</button>;
        })}
      </div>
      {picked !== null && (
        <>
          <p className="muted" style={{ marginBottom: 8 }}>{q.explain}</p>
          <button className="btn primary block" onClick={next}>{i + 1 >= daily.questions.length ? "النتيجة" : "التالي"}</button>
        </>
      )}
    </div>
  );
}

/* ---------------- مسألة اليوم ---------------- */

function MathOfDay({ onScore }: { onScore: (d: number) => void }) {
  const daily = useLiveQuery(() => getDaily<MathProblemT>("math"), []);
  const [lvl, setLvl] = useState(() => Number(pref("masari.mathLevel", "4")));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hints, setHints] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<null | boolean>(doneToday("math") ? true : null);
  const [reveal, setReveal] = useState(false);

  async function load() {
    setBusy(true); setError(null);
    try { await setDaily("math", await makeMathProblem(lvl)); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function submit() {
    if (!daily) return;
    const clean = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d.\-/]/g, "");
    const ok = clean(answer) === clean(daily.answer) || Number(clean(answer)) === Number(clean(daily.answer));
    setResult(ok);
    if (ok) {
      markDone("math"); await addXP("puzzle", 15 - hints * 4); onScore(20 - hints * 6);
      const next = Math.min(10, lvl + (hints === 0 ? 1 : 0)); setLvl(next); setPref("masari.mathLevel", String(next));
    } else onScore(-5);
  }

  return (
    <div className="card">
      <h3>مسألة اليوم <span className="badge">مستوى {lvl}</span></h3>
      {!daily ? (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>مسألة تفكير وحدة كل يوم. إذا علّقت خذ تلميح. المستوى يرتفع كل ما حليت بدون تلميحات.</p>
          {error && <div className="error">{error}</div>}
          <button className="btn primary block" onClick={load} disabled={busy}>{busy ? "يجهّز المسألة..." : "جيب مسألة اليوم"}</button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 17, lineHeight: 1.8 }}>{daily.problem}</p>
          {daily.hints.slice(0, hints).map((h, k) => <div key={k} className="chip gold" style={{ display: "block", marginBottom: 6, padding: "6px 10px" }}>تلميح {k + 1}: {h}</div>)}
          {result !== true && (
            <div className="row">
              <input id="math-answer" className="input" inputMode="decimal" placeholder="جوابك" value={answer} onChange={(e) => setAnswer(e.target.value)} />
              <button className="btn primary" onClick={submit} disabled={!answer.trim()}>تحقق</button>
            </div>
          )}
          {result === false && <div className="chip red" style={{ marginTop: 8 }}>مو صحيح، جرّب مرة ثانية</div>}
          {result === true && <div className="chip green">صح، ممتاز</div>}
          <div className="grid2" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => setHints(Math.min(daily.hints.length, hints + 1))} disabled={hints >= daily.hints.length || result === true}>تلميح</button>
            <button className="btn" onClick={() => setReveal(!reveal)}>{reveal ? "اخفِ الحل" : "شوف الحل"}</button>
          </div>
          {reveal && <p className="muted" style={{ whiteSpace: "pre-wrap" }}>الجواب: {daily.answer}{"\n"}{daily.explanation}</p>}
        </>
      )}
    </div>
  );
}

/* ---------------- سباق الحساب الذهني ---------------- */

function makeQ(level: number) {
  const r = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
  const op = ["+", "-", "×", "÷"][r(0, level > 3 ? 3 : 1)];
  const max = 10 + level * 6;
  if (op === "+") { const a = r(2, max), b = r(2, max); return { text: `${a} + ${b}`, ans: a + b }; }
  if (op === "-") { const a = r(5, max), b = r(1, a); return { text: `${a} − ${b}`, ans: a - b }; }
  if (op === "×") { const a = r(2, 6 + level), b = r(2, 9 + level); return { text: `${a} × ${b}`, ans: a * b }; }
  const b = r(2, 9 + level), ans = r(2, 9 + level); return { text: `${b * ans} ÷ ${b}`, ans };
}

function Sprint({ onScore }: { onScore: (d: number) => void }) {
  const toast = useToast();
  const [best, setBest] = useState(() => Number(pref("masari.sprintBest", "0")));
  const [left, setLeft] = useState(0);
  const [score, setScore] = useState(0);
  const [q, setQ] = useState(() => makeQ(1));
  const [val, setVal] = useState("");
  const [flash, setFlash] = useState<"" | "ok" | "no">("");
  const inputRef = useRef<HTMLInputElement>(null);
  const running = left > 0;

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left, running]);
  useEffect(() => {
    if (left === 0 && score > 0) {
      (async () => {
        await addXP("puzzle", Math.min(20, score));
        onScore(Math.round(score / 2));
        if (score > best) { setBest(score); setPref("masari.sprintBest", String(score)); toast(`رقم قياسي جديد: ${score}`); }
        else toast(`نتيجتك ${score}`);
      })();
    }
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  function start() { setScore(0); setLeft(60); setQ(makeQ(1)); setVal(""); setTimeout(() => inputRef.current?.focus(), 50); }
  function type(v: string) {
    setVal(v);
    if (Number(v) === q.ans) {
      const s = score + 1;
      setScore(s); setFlash("ok"); setVal(""); setQ(makeQ(1 + Math.floor(s / 5)));
      setTimeout(() => setFlash(""), 200);
    }
  }
  return (
    <div className="card">
      <h3>سباق الحساب الذهني <span className="badge teal">أفضل نتيجة {best}</span></h3>
      {running ? (
        <>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="badge">{left} ثانية</span><b style={{ fontSize: 20 }}>{score}</b>
          </div>
          <div className={`sprint-q ${flash}`}>{q.text}</div>
          <input ref={inputRef} id="sprint-input" className="input" inputMode="numeric" style={{ fontSize: 26, textAlign: "center" }} value={val} onChange={(e) => type(e.target.value)} />
          <button className="btn ghost block" onClick={() => { setQ(makeQ(1 + Math.floor(score / 5))); setVal(""); setFlash("no"); setTimeout(() => setFlash(""), 200); }}>تخطّي</button>
        </>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>60 ثانية، حل أكبر عدد من العمليات. تصعب كل ما جاوبت صح. الجواب ينقبل لحاله أول ما تكتبه صح.</p>
          <button className="btn primary block" onClick={start}><Icon name="play" size={18} /> ابدأ</button>
        </>
      )}
    </div>
  );
}

/* ---------------- كلمة اليوم (5 حروف) ---------------- */

const WORDS = "about above actor adapt admit adopt adult after again agent agree ahead alarm album alert alive allow alone along alter angle angry apple apply arena argue arise array aside asset audio avoid award aware badly basic beach began begin being below bench birth black blame blind block blood board boost brain brand brave bread break brief bring broad brown build built buyer cable carry catch cause chain chair chart cheap check chest chief child civil claim class clean clear climb clock close cloud coach coast could count court cover craft crash cream crime cross crowd cycle daily dance death delay depth dirty doubt dozen draft drama dream dress drink drive early earth eight elect empty enemy enjoy enter entry equal error event every exact exist extra faith false fault field fifth fight final first flash fleet floor focus force frame fresh front fruit funny giant given glass globe grace grade grand grant grass great green group guard guess guest guide happy heart heavy hello horse hotel house human ideal image index inner input issue joint judge known label large laser later laugh layer learn least leave legal level light limit local logic loose lucky lunch magic major maker march match maybe mayor media metal might minor model money month moral motor mount mouse mouth movie music never night noise north novel nurse ocean offer often order other owner paint panel paper party peace phase phone photo piece pilot pitch place plain plane plant plate point power press price pride prime print prior prize proof proud prove queen quick quiet quite radio raise range rapid ratio reach ready refer relax reply right river robot rough round route royal rural scale scene scope score sense serve seven shape share sharp sheet shelf shift shirt shock shoot short sight skill sleep slide small smart smile smoke solid solve sorry sound south space speak speed spend sport staff stage stand start state steam steel stick still stock stone store storm story study style sugar sunny super sweet table taste teach thank theme thick thing think third three throw tight times title today topic total touch tough tower track trade train trend trial truck truly trust truth twice under union unity until upper urban usual valid value video visit vital voice waste watch water wheel where which while white whole woman world worry would write wrong young youth".split(" ");

function Wordle({ onScore }: { onScore: (d: number) => void }) {
  const today = todayISO();
  const seed = [...today].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const target = WORDS[seed % WORDS.length];
  const [guesses, setGuesses] = useState<string[]>(() => JSON.parse(pref(`masari.wordle.${today}`, "[]")));
  const [cur, setCur] = useState("");
  const won = guesses.includes(target);
  const over = won || guesses.length >= 6;

  function color(g: string, k: number) {
    if (g[k] === target[k]) return "hit";
    // عد الحروف المتبقية عشان ما نلوّن نفس الحرف مرتين
    const rest = [...target].filter((c, j) => g[j] !== c);
    const before = [...g.slice(0, k)].filter((c, j) => c === g[k] && target[j] !== c).length;
    return rest.filter((c) => c === g[k]).length > before ? "near" : "miss";
  }
  async function submit() {
    const g = cur.toLowerCase();
    if (!/^[a-z]{5}$/.test(g) || over) return;
    const next = [...guesses, g];
    setGuesses(next); setCur(""); setPref(`masari.wordle.${today}`, JSON.stringify(next));
    if (g === target) { await addXP("puzzle", 14 - next.length * 2); onScore(15 - next.length * 2); }
    else if (next.length >= 6) onScore(-5);
  }
  return (
    <div className="card">
      <h3>كلمة اليوم <span className="badge">{guesses.length} من 6</span></h3>
      <p className="muted small" style={{ marginTop: 0 }}>خمّن الكلمة الإنجليزية (5 حروف). أخضر: الحرف في مكانه. برتقالي: موجود بمكان ثاني. رمادي: مو موجود.</p>
      <div className="wordle ltr">
        {Array.from({ length: 6 }, (_, r) => {
          const g = guesses[r] ?? (r === guesses.length ? cur.toLowerCase().padEnd(5) : "     ");
          return (
            <div className="wrow" key={r}>
              {[...g.slice(0, 5)].map((c, k) => <span key={k} className={`wcell ${guesses[r] ? color(g, k) : ""}`}>{c.trim()}</span>)}
            </div>
          );
        })}
      </div>
      {!over ? (
        <div className="row" style={{ marginTop: 10 }}>
          <input id="wordle-input" className="input ltr" maxLength={5} autoCapitalize="off" autoCorrect="off" spellCheck={false} value={cur}
            onChange={(e) => setCur(e.target.value.replace(/[^A-Za-z]/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="guess" />
          <button className="btn primary" onClick={submit} disabled={cur.length !== 5}>جرّب</button>
        </div>
      ) : <div className={`chip ${won ? "green" : "red"}`} style={{ marginTop: 10 }}>{won ? "صح! رجّع بكرة لكلمة جديدة" : `الكلمة كانت: ${target}`}</div>}
    </div>
  );
}

/* ---------------- الصفحة ---------------- */

export function Puzzles({ onBack }: { onBack: () => void }) {
  const [rating, change] = useRating();
  const streak = useLiveQuery(() => areaStreak("puzzle"), []);
  const done = ["trivia", "math"].filter(doneToday).length;
  return (
    <>
      <BackHeader title="الألغاز" onBack={onBack} />
      <div className="hero">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="muted small">تقييمك</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 800 }} className="hl">{rating}</div>
          </div>
          <div style={{ textAlign: "left" }}>
            <div className="muted small">سلسلة الأيام</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 800 }} className="hl orange">{streak ?? 0}</div>
          </div>
        </div>
        <div className="muted small">التحديات اليومية: {done} من 2 · كل حل صحيح يرفع تقييمك، والغلط ينزّله شوي.</div>
      </div>
      <Trivia onScore={change} />
      <MathOfDay onScore={change} />
      <Wordle onScore={change} />
      <Sprint onScore={change} />
    </>
  );
}
