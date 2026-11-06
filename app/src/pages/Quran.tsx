import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSpeech } from "../speech";
import { db } from "../db";
import { Icon } from "../Icon";
import { addXP } from "../progress";
import { BASMALA, check, loadQuran, normalize, SURAS, TANZIL_NOTICE, words, type CheckResult } from "../quran";
import { BackHeader, Progress, useToast } from "../ui";
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

/** اختيار السورة والآيات */
function RangePicker({ sura, from, to, onChange }: { sura: number; from: number; to: number; onChange: (s: number, f: number, t: number) => void }) {
  const max = SURAS[sura - 1][1];
  return (
    <div className="card">
      <label className="field"><span>السورة</span>
        <select id="q-sura" className="input" value={sura} onChange={(e) => { const s = Number(e.target.value); onChange(s, 1, Math.min(SURAS[s - 1][1], 5)); }}>
          {SURAS.map(([name, n, type], i) => <option key={i} value={i + 1}>{i + 1}. {name} ({n} آية، {type})</option>)}
        </select>
      </label>
      <div className="grid2">
        <label className="field"><span>من آية</span>
          <input id="q-from" className="input" type="number" min={1} max={max} value={from} onChange={(e) => { const f = Math.min(max, Math.max(1, Number(e.target.value) || 1)); onChange(sura, f, Math.max(f, to)); }} />
        </label>
        <label className="field"><span>إلى آية</span>
          <input id="q-to" className="input" type="number" min={from} max={max} value={to} onChange={(e) => onChange(sura, from, Math.min(max, Math.max(from, Number(e.target.value) || from)))} />
        </label>
      </div>
    </div>
  );
}

function AyahText({ text, n }: { text: string; n: number }) {
  return <span>{text} <span style={{ color: "var(--gold)", whiteSpace: "nowrap" }}>﴿{n}﴾</span> </span>;
}

function ResultView({ r }: { r: CheckResult }) {
  return (
    <div className="quran-text" style={{ marginTop: 10 }}>
      {r.words.map((w, i) => (
        <span key={i} className={`qw ${w.status}`} title={"heard" in w ? `قلت: ${w.heard}` : undefined}>
          {w.word}{" "}
        </span>
      ))}
    </div>
  );
}

/* ---------------- التسميع ---------------- */

function Tasmee({ quran }: { quran: string[][] }) {
  const toast = useToast();
  const [sura, setSura] = useState(() => Number(pref("masari.q.sura", "67")));
  const [from, setFrom] = useState(() => Number(pref("masari.q.from", "1")));
  const [to, setTo] = useState(() => Number(pref("masari.q.to", "5")));
  const [running, setRunning] = useState(false);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [hint, setHint] = useState(false);
  const [strict, setStrict] = useState(() => pref("masari.q.strict", "1") === "1");
  const [scores, setScores] = useState<number[]>([]);
  const [autoMode, setAutoMode] = useState(false); // تسميع متواصل بالمايك المباشر
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeech("ar-SA", (t) => setInput(t));

  const ayahNo = from + idx;
  const ayah = quran[sura - 1][ayahNo - 1];
  const passed = !!result && result.accuracy >= 0.9 && !result.words.some((w) => w.status === "missing" || w.status === "wrong");
  const done = running && idx > to - from;

  function setRange(s: number, f: number, t: number) {
    setSura(s); setFrom(f); setTo(t);
    setPref("masari.q.sura", String(s)); setPref("masari.q.from", String(f)); setPref("masari.q.to", String(t));
  }
  function start() { setRunning(true); setIdx(0); setInput(""); setResult(null); setScores([]); setHint(false); }
  function verify(text = input) {
    if (!text.trim()) return;
    if (speech.listening) speech.stop();
    setResult(check(words(ayah), words(text)));
  }
  function next() {
    setScores([...scores, result?.accuracy ?? 0]);
    setIdx(idx + 1); setInput(""); setResult(null); setHint(false);
  }

  /** زر المايك: مباشر إذا مسموح، وإلا يفتح الكيبورد عشان تستخدم مايكه */
  function micPress() {
    if (speech.listening) { speech.stop(); verify(); return; }
    setResult(null); setInput("");
    if (!speech.blocked && speech.start()) { setAutoMode(true); return; }
    setAutoMode(false);
    inputRef.current?.focus();
  }

  // تصحيح تلقائي: إذا قال عدد كلمات الآية أو أكثر، أو سكت ثانيتين
  useEffect(() => {
    if (!running || result || !input.trim()) return;
    const need = words(ayah).length;
    if (words(input).length >= need) {
      const t = setTimeout(() => verify(input), speech.listening ? 900 : 1200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => verify(input), 2500);
    return () => clearTimeout(t);
  }, [input]); // eslint-disable-line react-hooks/exhaustive-deps

  // إذا صحت الآية ننتقل تلقائياً، وفي الوضع المتواصل نرجع نسمع
  useEffect(() => {
    if (!passed) return;
    const t = setTimeout(() => {
      const last = idx >= to - from;
      next();
      if (autoMode && !last) setTimeout(() => speech.start(), 300);
    }, 1300);
    return () => clearTimeout(t);
  }, [passed]); // eslint-disable-line react-hooks/exhaustive-deps
  async function finish(all: number[]) {
    const acc = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length);
    await db.recitations.add({ sura, from, to, accuracy: acc, date: todayISO(), createdAt: Date.now() });
    await addXP("quran", Math.round(5 * all.length * acc));
    toast(`انحفظ التسميع: ${Math.round(acc * 100)}%`);
  }

  useEffect(() => {
    if (done && scores.length === to - from + 1) finish(scores);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!running) {
    return (
      <>
        <RangePicker sura={sura} from={from} to={to} onChange={setRange} />
        <label className="card row" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={strict} onChange={(e) => { setStrict(e.target.checked); setPref("masari.q.strict", e.target.checked ? "1" : "0"); }} />
          <span className="grow">ما أكمل للآية اللي بعدها لين أصحح أخطائي</span>
        </label>
        <button className="btn primary block" onClick={start}><Icon name="mic" size={18} /> ابدأ التسميع</button>
        <p className="muted small">الآيات تكون مخفية. اضغط زر المايك الكبير وسمّع. التصحيح يصير لحاله لما تسكت، وإذا صحّت الآية ينتقل للي بعدها.</p>
      </>
    );
  }

  if (done) {
    const acc = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <div className="eyebrow" style={{ textAlign: "center" }}>انتهى التسميع</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 800, color: acc >= 0.9 ? "var(--accent)" : "var(--gold)" }}>{Math.round(acc * 100)}%</div>
        <p className="muted">{SURAS[sura - 1][0]}، من آية {from} إلى {to}</p>
        <div className="grid2">
          <button className="btn" onClick={() => setRunning(false)}>اختر مقطع ثاني</button>
          <button className="btn primary" onClick={start}>عيد التسميع</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b>{SURAS[sura - 1][0]}</b>
          <span className="badge">آية {ayahNo} · {idx + 1} من {to - from + 1}</span>
        </div>
        <div style={{ margin: "10px 0" }}><Progress value={idx / (to - from + 1)} /></div>
        {ayahNo === 1 && sura !== 1 && sura !== 9 && <div className="quran-text muted" style={{ textAlign: "center", fontSize: 20 }}>{BASMALA}</div>}
        {hint && !result && (
          <div className="quran-text muted">{words(ayah).map((w, i) => <span key={i} className="qw hidden">{w.slice(0, 1)}{"ـ".repeat(Math.max(2, Math.min(5, normalize(w).length - 1)))} </span>)}</div>
        )}
        {result ? <ResultView r={result} /> : !hint && <div className="muted small">الآية مخفية. سمّعها من حفظك.</div>}
        {result && (
          <div className="row" style={{ marginTop: 8, flexWrap: "wrap", gap: 6 }}>
            <span className={`chip ${passed ? "green" : "gold"}`}>دقة {Math.round(result.accuracy * 100)}%</span>
            {result.words.filter((w) => w.status === "missing").length > 0 && <span className="chip red">ناقص {result.words.filter((w) => w.status === "missing").length}</span>}
            {result.words.filter((w) => w.status === "wrong" || w.status === "close").length > 0 && <span className="chip gold">مختلف {result.words.filter((w) => w.status === "wrong" || w.status === "close").length}</span>}
            {result.extra.length > 0 && <span className="chip">زيادة: {result.extra.join(" ")}</span>}
          </div>
        )}
      </div>

      <div className="mic-wrap">
        {speech.blocked ? (
          <label htmlFor="q-input" className="mic-big" role="button" aria-label="سمّع بمايك الكيبورد" onClick={() => setResult(null)}>
            <Icon name="mic" size={34} />
          </label>
        ) : (
          <button className={`mic-big ${speech.listening ? "on" : ""}`} onClick={micPress} aria-label={speech.listening ? "وقّف وصحّح" : "سمّع بالمايك"}>
            <Icon name="mic" size={34} />
          </button>
        )}
        {speech.error && !speech.listening && <div className="error small" style={{ textAlign: "center", margin: 0 }}>{speech.error}</div>}
        {speech.listening && input && <div className="small" style={{ textAlign: "center", color: "var(--accent)" }}>سمعت: {input}</div>}
        <div className="muted small" style={{ textAlign: "center" }}>
          {speech.listening ? "أسمعك... سمّع الآية وأنا أصحح لحالي"
            : passed ? "ممتاز، ننتقل للآية التالية..."
            : speech.blocked ? "اضغط الزر يطلع الكيبورد، بعدها اضغط المايك اللي في الكيبورد وسمّع. أصحح لحالي لما تسكت."
            : "اضغط الزر وسمّع"}
        </div>
      </div>
      <textarea ref={inputRef} id="q-input" className="textarea" style={{ fontSize: 20, minHeight: 90 }} value={input} onChange={(e) => { setInput(e.target.value); if (result) setResult(null); }} placeholder="كلامك يطلع هنا..." />
      <div className="grid2" style={{ marginTop: 8 }}>
        {!result ? <>
          <button className="btn" onClick={() => setHint(!hint)}>{hint ? "اخفِ التلميح" : "تلميح (أول الحروف)"}</button>
          <button className="btn primary" onClick={() => verify()} disabled={!input.trim()}>صحّح</button>
        </> : <>
          <button className="btn" onClick={() => { setResult(null); setInput(""); if (autoMode) speech.start(); else inputRef.current?.focus(); }}>عيد الآية</button>
          <button className="btn primary" onClick={next} disabled={strict && !passed}>{idx >= to - from ? "خلصت" : "الآية التالية"}</button>
        </>}
      </div>
      {result && strict && !passed && <p className="muted small">صحّح الأخطاء الملوّنة وعيد الآية عشان تكمل، أو اطفِ خيار "ما أكمل لين أصحح".</p>}
      <div className="legend small muted" style={{ marginTop: 8 }}>
        <span className="qw ok">صحيح</span> <span className="qw close">قريب</span> <span className="qw wrong">مختلف</span> <span className="qw missing">ناقص</span>
      </div>
      <button className="btn ghost" onClick={() => { speech.stop(); setRunning(false); }}>إيقاف</button>
    </>
  );
}

/* ---------------- الحفظ بالإخفاء التدريجي ---------------- */

function Hifz({ quran }: { quran: string[][] }) {
  const [sura, setSura] = useState(() => Number(pref("masari.q.sura", "67")));
  const [from, setFrom] = useState(() => Number(pref("masari.q.from", "1")));
  const [to, setTo] = useState(() => Number(pref("masari.q.to", "5")));
  const [level, setLevel] = useState(0);
  const ayat = quran[sura - 1].slice(from - 1, to);
  const hidden = useMemo(() => {
    // نخفي كلمات بشكل ثابت حسب ترتيبها حتى ما تتغير كل ما رسمنا الصفحة
    return ayat.map((a, ai) => words(a).map((_, wi) => ((wi * 7 + ai * 3) % 4) < level));
  }, [sura, from, to, level]); // eslint-disable-line react-hooks/exhaustive-deps
  const [reveal, setReveal] = useState<string | null>(null);
  return (
    <>
      <RangePicker sura={sura} from={from} to={to} onChange={(s, f, t) => { setSura(s); setFrom(f); setTo(t); setReveal(null); }} />
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <b>كم تخفي؟</b>
          <span className="badge teal">{["0%", "25%", "50%", "75%", "100%"][level]}</span>
        </div>
        <input id="q-level" type="range" min={0} max={4} value={level} onChange={(e) => { setLevel(Number(e.target.value)); setReveal(null); }} style={{ width: "100%", accentColor: "var(--accent)" }} />
        <p className="muted small" style={{ margin: "4px 0 0" }}>اقرأ الآيات، بعدين زد الإخفاء شوي شوي. اضغط على أي كلمة مخفية عشان تشوفها.</p>
      </div>
      <div className="card quran-text">
        {from === 1 && sura !== 1 && sura !== 9 && <div style={{ textAlign: "center", color: "var(--muted)" }}>{BASMALA}</div>}
        {ayat.map((a, ai) => (
          <span key={ai}>
            {words(a).map((w, wi) => {
              const k = `${ai}-${wi}`;
              const isHidden = hidden[ai][wi] && reveal !== k;
              return isHidden
                ? <span key={wi} className="qw hidden" onClick={() => setReveal(k)}>{w.slice(0, 1)}{"ـ".repeat(Math.max(2, Math.min(5, normalize(w).length - 1)))} </span>
                : <span key={wi}>{w} </span>;
            })}
            <span style={{ color: "var(--gold)", whiteSpace: "nowrap" }}>﴿{from + ai}﴾</span>{" "}
          </span>
        ))}
      </div>
    </>
  );
}

/* ---------------- خريطتي وخطتي ---------------- */

function MyMap({ onPick }: { onPick: (s: number) => void }) {
  const recs = useLiveQuery(() => db.recitations.toArray(), []);
  const [goal, setGoal] = useState(() => Number(pref("masari.q.goal", "5")));
  const today = todayISO();
  const best = new Map<number, number>();
  const covered = new Map<number, Set<number>>();
  for (const r of recs ?? []) {
    best.set(r.sura, Math.max(best.get(r.sura) ?? 0, r.accuracy));
    if (r.accuracy >= 0.8) {
      const set = covered.get(r.sura) ?? new Set<number>();
      for (let a = r.from; a <= r.to; a++) set.add(a);
      covered.set(r.sura, set);
    }
  }
  const todayAyat = (recs ?? []).filter((r) => r.date === today).reduce((s, r) => s + (r.to - r.from + 1), 0);
  const totalCovered = [...covered.values()].reduce((s, x) => s + x.size, 0);
  return (
    <>
      <div className="card">
        <h3>وردك اليومي <span className="badge">{todayAyat} من {goal} آيات</span></h3>
        <Progress value={todayAyat / Math.max(1, goal)} />
        <div className="row" style={{ marginTop: 10 }}>
          <span className="muted small grow">هدفك اليومي في التسميع:</span>
          {[3, 5, 10, 20].map((g) => <button key={g} className={`chip ${g === goal ? "on" : ""}`} style={{ border: 0, cursor: "pointer" }} onClick={() => { setGoal(g); setPref("masari.q.goal", String(g)); }}>{g}</button>)}
        </div>
      </div>
      <div className="card">
        <h3>خريطة الحفظ <span className="muted small">{totalCovered} آية من 6236</span></h3>
        <Progress value={totalCovered / 6236} />
        <div className="qmap" style={{ marginTop: 12 }}>
          {SURAS.map(([name, n], i) => {
            const c = covered.get(i + 1)?.size ?? 0;
            const pct = c / n;
            return (
              <button key={i} className="qcell" title={name} onClick={() => onPick(i + 1)}
                style={{ background: pct ? `color-mix(in srgb, var(--accent) ${Math.round(20 + pct * 80)}%, var(--card-2))` : undefined, color: pct > 0.5 ? "var(--accent-ink)" : undefined }}>
                {i + 1}
              </button>
            );
          })}
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>كل مربع سورة. يتلوّن كل ما سمّعت آياتها بدقة 80% أو أكثر. اضغط على سورة عشان تسمّعها.</p>
      </div>
      {(recs?.length ?? 0) > 0 && (
        <div className="card">
          <h3>آخر التسميعات</h3>
          {(recs ?? []).slice(-8).reverse().map((r) => (
            <div className="list-item" key={r.id}>
              <span className="grow">{SURAS[r.sura - 1][0]} {r.from}-{r.to}</span>
              <span className="muted small">{r.date}</span>
              <span className={`chip ${r.accuracy >= 0.9 ? "green" : "gold"}`}>{Math.round(r.accuracy * 100)}%</span>
            </div>
          ))}
          {best.size > 0 && null}
        </div>
      )}
    </>
  );
}

export function Quran({ onBack }: { onBack: () => void }) {
  const quran = useQuran();
  const [tab, setTab] = useState<"tasmee" | "hifz" | "map">(() => pref("masari.q.tab", "tasmee") as "tasmee");
  const go = (t: typeof tab) => { setTab(t); setPref("masari.q.tab", t); };
  return (
    <>
      <BackHeader title="القرآن" onBack={onBack} />
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`chip ${tab === "tasmee" ? "on" : ""}`} onClick={() => go("tasmee")}>التسميع</button>
        <button className={`chip ${tab === "hifz" ? "on" : ""}`} onClick={() => go("hifz")}>الحفظ</button>
        <button className={`chip ${tab === "map" ? "on" : ""}`} onClick={() => go("map")}>خريطتي ووردي</button>
      </div>
      {!quran ? <div className="card empty">يحمّل المصحف...</div> : <>
        {tab === "tasmee" && <Tasmee quran={quran} />}
        {tab === "hifz" && <Hifz quran={quran} />}
        {tab === "map" && <MyMap onPick={(s) => { setPref("masari.q.sura", String(s)); setPref("masari.q.from", "1"); setPref("masari.q.to", String(Math.min(SURAS[s - 1][1], 5))); go("tasmee"); }} />}
      </>}
      <p className="muted small" style={{ textAlign: "center", marginTop: 16 }}>
        {TANZIL_NOTICE} <a href="https://tanzil.net" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>tanzil.net</a>
      </p>
    </>
  );
}
