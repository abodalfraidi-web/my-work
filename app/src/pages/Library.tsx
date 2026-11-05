import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useRef, useState } from "react";
import { friendlyError, lookupWord, writeReading, type WordInfoT } from "../ai";
import { db, type Book, type ReadingText, type VocabWord } from "../db";
import { Icon } from "../Icon";
import { ask, BackHeader, Progress, Sheet, useAIText, useToast } from "../ui";
import { addDays, todayISO } from "../utils";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const STATUS: Record<Book["status"], string> = { reading: "أقرأه الحين", want: "أبي أقرأه", done: "خلصته" };

function pref(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function setPref(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* ignore */ }
}

export function reviewWord(w: VocabWord, remembered: boolean) {
  const interval = remembered ? Math.min(Math.max(1, Math.round(w.intervalDays * 2.3)), 120) : 1;
  return db.vocab.update(w.id!, { intervalDays: interval, nextReview: addDays(todayISO(), interval), reviews: w.reviews + 1 });
}

/* ---------------- الكتب ---------------- */

function BookEditor({ book, open, onClose }: { book?: Book; open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState(book?.title ?? "");
  const [author, setAuthor] = useState(book?.author ?? "");
  const [lang, setLang] = useState<Book["lang"]>(book?.lang ?? "ar");
  const [total, setTotal] = useState(String(book?.totalPages || ""));
  const [status, setStatus] = useState<Book["status"]>(book?.status ?? "reading");
  async function save() {
    if (!title.trim()) return;
    const data = { title: title.trim(), author: author.trim(), lang, totalPages: Number(total) || 0, status };
    if (book?.id) await db.books.update(book.id, data);
    else await db.books.add({ ...data, currentPage: 0, notes: "", startedOn: status === "reading" ? todayISO() : null, finishedOn: null, createdAt: Date.now() });
    onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title={book ? "تعديل الكتاب" : "كتاب جديد"}>
      <label className="field"><span>اسم الكتاب</span><input id="book-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field"><span>المؤلف</span><input id="book-author" className="input" value={author} onChange={(e) => setAuthor(e.target.value)} /></label>
      <div className="grid2">
        <label className="field"><span>اللغة</span>
          <div className="chips">
            <button className={`chip ${lang === "ar" ? "on" : ""}`} onClick={() => setLang("ar")}>عربي</button>
            <button className={`chip ${lang === "en" ? "on" : ""}`} onClick={() => setLang("en")}>English</button>
          </div>
        </label>
        <label className="field"><span>عدد الصفحات</span><input id="book-pages" className="input" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} /></label>
      </div>
      <label className="field"><span>الحالة</span>
        <div className="chips">{(Object.keys(STATUS) as Book["status"][]).map((s) => <button key={s} className={`chip ${s === status ? "on" : ""}`} onClick={() => setStatus(s)}>{STATUS[s]}</button>)}</div>
      </label>
      <button className="btn primary block" onClick={save} disabled={!title.trim()}>احفظ</button>
      {book?.id && <button className="btn danger block" style={{ marginTop: 8 }} onClick={async () => {
        if (await ask(`تحذف "${book.title}"؟`)) { await db.books.delete(book.id!); onClose(); }
      }}>حذف</button>}
    </Sheet>
  );
}

function BookCard({ book }: { book: Book }) {
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState("");
  const [notes, setNotes] = useState(book.notes);
  const [open, setOpen] = useState(false);
  const pct = book.totalPages ? book.currentPage / book.totalPages : 0;
  async function setCurrent(p: number) {
    const current = Math.max(0, book.totalPages ? Math.min(book.totalPages, p) : p);
    const done = !!book.totalPages && current >= book.totalPages;
    await db.books.update(book.id!, { currentPage: current, ...(done ? { status: "done", finishedOn: todayISO() } : {}) });
    setPage("");
  }
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }} onClick={() => setOpen(!open)}>
        <div className="grow">
          <b className={book.lang === "en" ? "ltr" : ""} style={{ display: "block" }}>{book.title}</b>
          <span className="muted small">{book.author || "—"} · {book.lang === "en" ? "English" : "عربي"}</span>
        </div>
        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setEditing(true); }} aria-label="تعديل"><Icon name="edit" size={18} /></button>
      </div>
      {book.status !== "want" && (
        <div style={{ marginTop: 10 }}>
          <Progress value={pct} />
          <div className="muted small" style={{ marginTop: 4 }}>صفحة {book.currentPage}{book.totalPages ? ` من ${book.totalPages}` : ""}</div>
        </div>
      )}
      {book.status === "reading" && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => setCurrent(book.currentPage + 10)}>+10</button>
          <input id={`page-${book.id}`} className="input" inputMode="numeric" placeholder="وصلت صفحة..." value={page} onChange={(e) => setPage(e.target.value)} />
          <button className="btn primary" disabled={!Number(page)} onClick={() => setCurrent(Number(page))}>حفظ</button>
        </div>
      )}
      {open && (
        <div style={{ marginTop: 10 }}>
          <textarea id={`notes-${book.id}`} className="textarea" placeholder="أفكار واقتباسات من الكتاب..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="btn block" style={{ marginTop: 6 }} disabled={notes === book.notes} onClick={() => db.books.update(book.id!, { notes })}>احفظ الملاحظات</button>
        </div>
      )}
      <BookEditor key={String(editing)} book={book} open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}

function Books() {
  const [adding, setAdding] = useState(false);
  const books = useLiveQuery(() => db.books.toArray(), []);
  return (
    <>
      <button className="btn primary block" style={{ marginBottom: 12 }} onClick={() => setAdding(true)}><Icon name="plus" size={18} /> أضف كتاب</button>
      {books?.length === 0 && <div className="card empty">أضف الكتاب اللي تقرأه الحين، وسجّل وين وصلت كل يوم.</div>}
      {(["reading", "want", "done"] as Book["status"][]).map((st) => {
        const list = (books ?? []).filter((b) => b.status === st);
        if (!list.length) return null;
        return <div key={st}><div className="section-title">{STATUS[st]}</div>{list.map((b) => <BookCard key={b.id} book={b} />)}</div>;
      })}
      <BookEditor key={String(adding)} open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

/* ---------------- القارئ الإنجليزي ---------------- */

function WordSheet({ word, sentence, onClose }: { word: string; sentence: string; onClose: () => void }) {
  const toast = useToast();
  const [info, setInfo] = useState<WordInfoT | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = useLiveQuery(() => db.vocab.where("word").equals(word.toLowerCase()).first(), [word]);
  async function explain() {
    setBusy(true); setError(null);
    try { setInfo(await lookupWord(word, sentence)); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  async function save() {
    if (!info) return;
    await db.vocab.add({ word: word.toLowerCase(), meaning: info.meaning, example: info.example, nextReview: addDays(todayISO(), 1), intervalDays: 1, reviews: 0, createdAt: Date.now() });
    toast("انحفظت الكلمة");
    onClose();
  }
  return (
    <Sheet open onClose={onClose}>
      <h2 className="ltr" style={{ fontFamily: "Georgia, serif" }}>{word}</h2>
      {saved && <p><span className="chip green">محفوظة</span> {saved.meaning}</p>}
      {error && <div className="error">{error}</div>}
      {info ? (
        <div className="stack">
          <div style={{ fontSize: 20, fontWeight: 600 }}>{info.meaning}</div>
          <div className="muted">{info.explanation}</div>
          <div className="ltr card" style={{ background: "var(--card-2)", boxShadow: "none" }}>{info.example}</div>
          {!saved && <button className="btn primary block" onClick={save}>احفظها في كلماتي</button>}
        </div>
      ) : !saved && (
        <button className="btn primary block" onClick={explain} disabled={busy}>{busy ? "يشرح..." : "اشرح لي الكلمة"}</button>
      )}
    </Sheet>
  );
}

function ReaderView({ text, onBack }: { text: ReadingText; onBack: () => void }) {
  const [pick, setPick] = useState<{ word: string; sentence: string } | null>(null);
  const vocab = useLiveQuery(() => db.vocab.toArray(), []);
  const known = useMemo(() => new Set((vocab ?? []).map((v) => v.word)), [vocab]);
  const paragraphs = text.content.split(/\n+/).filter((p) => p.trim() && !p.startsWith("# "));
  return (
    <>
      <BackHeader title={text.title} onBack={onBack} />
      <p className="muted small">اضغط على أي كلمة ما تعرفها عشان تشوف معناها وتحفظها. الكلمات اللي تحتها خط موجودة في كلماتي.</p>
      <div className="card reader">
        {paragraphs.map((p, i) => (
          <p key={i}>
            {p.split(/(\s+)/).map((tok, j) => {
              const clean = tok.replace(/[^A-Za-z'-]/g, "");
              if (!clean) return tok;
              return (
                <span key={j} className={`w ${known.has(clean.toLowerCase()) ? "known" : ""} ${pick?.word === clean ? "sel" : ""}`}
                  onClick={() => setPick({ word: clean, sentence: p.split(/(?<=[.!?])\s+/).find((s) => s.includes(tok)) ?? p })}>{tok}</span>
              );
            })}
          </p>
        ))}
      </div>
      <button className="btn green block" onClick={async () => { await db.texts.update(text.id!, { progress: 1 }); onBack(); }}><Icon name="check" size={18} /> خلصت القراءة</button>
      {pick && <WordSheet word={pick.word} sentence={pick.sentence} onClose={() => setPick(null)} />}
    </>
  );
}

function Reading() {
  const toast = useToast();
  const texts = useLiveQuery(() => db.texts.orderBy("createdAt").reverse().toArray(), []);
  const [openId, setOpenId] = useState<number | null>(null);
  const [level, setLevel] = useState(() => pref("masari.level", "A2"));
  const [topic, setTopic] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const ai = useAIText();
  const fileRef = useRef<HTMLInputElement>(null);
  const open = texts?.find((t) => t.id === openId);
  if (open) return <ReaderView text={open} onBack={() => setOpenId(null)} />;

  function titleOf(content: string, fallback: string) {
    const first = content.split("\n").find((l) => l.trim()) ?? "";
    return first.startsWith("# ") ? first.slice(2).trim() : fallback;
  }
  async function generate() {
    const words = (await db.vocab.toArray()).map((v) => v.word);
    const content = await ai.run((onText) => writeReading(level, topic, words, onText), friendlyError);
    if (!content) return;
    const id = await db.texts.add({ title: titleOf(content, topic || "Reading"), content, level, source: "ai", progress: 0, createdAt: Date.now() });
    ai.setText(""); setTopic(""); setOpenId(id as number);
  }
  async function addText(content: string, source: ReadingText["source"], name: string) {
    if (!content.trim()) return;
    await db.texts.add({ title: titleOf(content, name), content, level: "", source, progress: 0, createdAt: Date.now() });
    toast("انضاف النص");
  }

  return (
    <>
      <div className="card">
        <h3><span className="row"><Icon name="spark" size={18} className="title-icon" />نص إنجليزي بمستواك</span></h3>
        <div className="chips" style={{ marginBottom: 8 }}>
          {LEVELS.map((l) => <button key={l} className={`chip ${l === level ? "on" : ""}`} onClick={() => { setLevel(l); setPref("masari.level", l); }}>{l}</button>)}
        </div>
        <input id="reading-topic" className="input" placeholder="الموضوع (اختياري): سفر، بزنس، قصة..." value={topic} onChange={(e) => setTopic(e.target.value)} />
        {ai.error && <div className="error" style={{ marginTop: 8 }}>{ai.error}</div>}
        {ai.busy && <div className="muted small ltr" style={{ marginTop: 8, maxHeight: 80, overflow: "hidden" }}>{ai.text || "Writing..."}</div>}
        <button className="btn primary block" style={{ marginTop: 8 }} onClick={generate} disabled={ai.busy}>{ai.busy ? "يكتب لك..." : "اكتب لي نص أقرأه"}</button>
        <div className="grid2" style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => setPasting(true)}>الصق نص</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>ملف نصي</button>
        </div>
        <input ref={fileRef} type="file" accept=".txt,text/plain" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await addText(await f.text(), "file", f.name.replace(/\.txt$/i, ""));
          e.target.value = "";
        }} />
        <p className="muted small" style={{ marginBottom: 0 }}>A1 مبتدئ، A2 أساسي، B1 متوسط، B2 فوق المتوسط، C1 متقدم.</p>
      </div>

      {(texts ?? []).map((t) => (
        <button key={t.id} className="menu-item" onClick={() => setOpenId(t.id!)}>
          <span className="i"><Icon name="book" /></span>
          <span className="grow"><b className="ltr">{t.title}</b><span className="muted small">{t.level ? `${t.level} · ` : ""}{t.content.split(/\s+/).length} كلمة</span></span>
          {t.progress >= 1 ? <span className="chip green">مقروء</span> : <Icon name="chevron" size={18} />}
        </button>
      ))}

      <Sheet open={pasting} onClose={() => setPasting(false)} title="الصق نص إنجليزي">
        <textarea id="paste-text" className="textarea ltr" style={{ minHeight: 220 }} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste an article, a chapter, anything..." />
        <button className="btn primary block" style={{ marginTop: 8 }} disabled={!pasteText.trim()} onClick={async () => {
          await addText(pasteText, "pasted", pasteText.trim().split(/\s+/).slice(0, 5).join(" "));
          setPasteText(""); setPasting(false);
        }}>أضف</button>
      </Sheet>
    </>
  );
}

/* ---------------- كلماتي ---------------- */

function Words() {
  const today = todayISO();
  const due = useLiveQuery(() => db.vocab.where("nextReview").belowOrEqual(today).toArray(), [today]);
  const all = useLiveQuery(() => db.vocab.orderBy("word").toArray(), []);
  const [flipped, setFlipped] = useState(false);
  const current = due?.[0];
  return (
    <>
      <div className="card" style={{ textAlign: "center" }}>
        <h3 style={{ justifyContent: "center" }}>مراجعة اليوم <span className="chip gold">{due?.length ?? 0}</span></h3>
        {current ? (
          <>
            <div className="ltr" style={{ textAlign: "center", fontFamily: "Georgia, serif", fontSize: 30, margin: "12px 0" }}>{current.word}</div>
            {flipped ? (
              <>
                <div style={{ fontSize: 20, fontWeight: 600 }}>{current.meaning}</div>
                <div className="muted ltr" style={{ textAlign: "center", margin: "6px 0 12px" }}>{current.example}</div>
                <div className="grid2">
                  <button className="btn" style={{ color: "var(--danger)" }} onClick={() => { setFlipped(false); reviewWord(current, false); }}>نسيتها</button>
                  <button className="btn green" onClick={() => { setFlipped(false); reviewWord(current, true); }}>عرفتها</button>
                </div>
              </>
            ) : <button className="btn primary block" onClick={() => setFlipped(true)}>اعرض المعنى</button>}
          </>
        ) : <div className="empty">ما فيه كلمات للمراجعة اليوم. اقرأ نص واضغط على الكلمات الجديدة عشان تحفظها.</div>}
      </div>
      {all && all.length > 0 && (
        <div className="card">
          <h3>كل كلماتي <span className="muted small">{all.length}</span></h3>
          {all.map((w) => (
            <div className="list-item" key={w.id}>
              <b className="ltr" style={{ minWidth: 0 }}>{w.word}</b>
              <span className="grow muted">{w.meaning}</span>
              <button className="btn danger" aria-label="حذف" onClick={async () => (await ask(`تحذف "${w.word}"؟`)) && db.vocab.delete(w.id!)}><Icon name="x" size={16} /></button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function Library({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"books" | "reading" | "words">(() => pref("masari.libTab", "books") as "books");
  const go = (t: typeof tab) => { setTab(t); setPref("masari.libTab", t); };
  return (
    <>
      <BackHeader title="مكتبتي" onBack={onBack} />
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`chip ${tab === "books" ? "on" : ""}`} onClick={() => go("books")}>كتبي</button>
        <button className={`chip ${tab === "reading" ? "on" : ""}`} onClick={() => go("reading")}>قراءة إنجليزي</button>
        <button className={`chip ${tab === "words" ? "on" : ""}`} onClick={() => go("words")}>كلماتي</button>
      </div>
      {tab === "books" && <Books />}
      {tab === "reading" && <Reading />}
      {tab === "words" && <Words />}
    </>
  );
}
