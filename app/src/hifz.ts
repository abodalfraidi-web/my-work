/*
 * محرك الحفظ: الورد بالمسارات الثلاثة (جديد، مراجعة قريبة، مراجعة بعيدة)،
 * وجدول المراجعة لكل وجه حسب نتيجة التسميع، ودفتر الأخطاء.
 * القاعدة من حلقات التحفيظ: المراجعة قبل الحفظ الجديد.
 */
import { db, type HifzPage } from "./db";
import { ayatOfPage, pageOf, PAGE_COUNT, type Ref, type CheckResult } from "./quran";
import { addDays, todayISO } from "./utils";

/** سلّم المراجعة بالأيام */
const LADDER = [1, 3, 7, 14, 30, 60, 90];

export interface HifzSettings {
  startPage: number;
  direction: "backward" | "forward"; // backward: من الناس للبقرة (الأشهر للمبتدئ)
  newPart: 1 | 2 | 3; // الوجه يتقسم على كم جزء: 1 وجه كامل، 2 نص، 3 ثلث
  nearCount: number; // المراجعة القريبة: آخر كم وجه
  farPerDay: number; // المراجعة البعيدة: كم وجه باليوم
}

const DEFAULTS: HifzSettings = { startPage: 604, direction: "backward", newPart: 3, nearCount: 5, farPerDay: 2 };

export function getSettings(): HifzSettings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("masari.hifz") ?? "{}") }; } catch { return DEFAULTS; }
}
export function saveSettings(s: HifzSettings) {
  try { localStorage.setItem("masari.hifz", JSON.stringify(s)); } catch { /* ignore */ }
}

/* ---------- خطوات الورد اللي خلصت اليوم ---------- */

export type WirdStep = "near" | "far" | "mistakes" | "new" | "link";
export function doneSteps(): Set<WirdStep> {
  try { return new Set(JSON.parse(localStorage.getItem(`masari.wird.${todayISO()}`) ?? "[]")); } catch { return new Set(); }
}
export function markStep(step: WirdStep) {
  const s = doneSteps(); s.add(step);
  try { localStorage.setItem(`masari.wird.${todayISO()}`, JSON.stringify([...s])); } catch { /* ignore */ }
}

/* ---------- جدول المراجعة ---------- */

/** نحدّث موعد مراجعة الوجه حسب دقة التسميع */
export async function rateRecall(page: number, accuracy: number) {
  const today = todayISO();
  const row = await db.hifz.get(page);
  if (!row || row.status !== "memorized") return;
  let step = row.step;
  let lapses = row.lapses;
  if (accuracy >= 0.95) step = Math.min(LADDER.length - 1, step + 1); // قوي: نبعّد
  else if (accuracy < 0.85) { step = 0; lapses++; } // ضعيف: يرجع بكرة
  await db.hifz.update(page, { step, lapses, lastScore: accuracy, reps: row.reps + 1, due: addDays(today, LADDER[step]), updatedAt: Date.now() });
}

/** نعلّم أوجه كمحفوظة (محفوظات قديمة)، ونوزّع مراجعتها على الأيام الجاية */
export async function markMemorized(pages: number[], spread = true) {
  const today = todayISO();
  const rows: HifzPage[] = pages.map((page, i) => ({
    page, status: "memorized", part: 0, step: 2,
    due: spread ? addDays(today, 1 + (i % 14)) : addDays(today, 1),
    lastScore: 0, reps: 0, lapses: 0, memorizedOn: today, updatedAt: Date.now(),
  }));
  await db.hifz.bulkPut(rows);
}

export async function unmark(pages: number[]) {
  await db.hifz.bulkDelete(pages);
}

/** الأوجه اللي تحفظها، الأحدث أولاً */
async function memorizedNewestFirst(): Promise<HifzPage[]> {
  const all = await db.hifz.where("status").equals("memorized").toArray();
  return all.sort((a, b) => (b.memorizedOn ?? "").localeCompare(a.memorizedOn ?? "") || b.updatedAt - a.updatedAt);
}

/* ---------- ورد اليوم ---------- */

export interface Wird {
  near: number[]; // أوجه المراجعة القريبة
  far: number[]; // أوجه المراجعة البعيدة المستحقة
  mistakes: Ref[]; // آيات فيها أخطاء ما انحلت
  newPage: number | null; // الوجه الجديد
  newPart: number; // رقم الجزء من الوجه (0..)
  newAyat: Ref[]; // آيات الحفظ الجديد اليوم
  totalMemorized: number;
}

export function nextNewPage(s: HifzSettings, taken: Set<number>): number | null {
  let p = s.startPage;
  for (let i = 0; i < PAGE_COUNT; i++) {
    if (!taken.has(p)) return p;
    p += s.direction === "backward" ? -1 : 1;
    if (p < 1 || p > PAGE_COUNT) return null;
  }
  return null;
}

/** نقسم آيات الوجه على أجزاء متقاربة */
export function partsOfPage(page: number, parts: number): Ref[][] {
  const ayat = ayatOfPage(page);
  const n = Math.max(1, Math.min(parts, ayat.length));
  const out: Ref[][] = [];
  const size = Math.ceil(ayat.length / n);
  for (let i = 0; i < ayat.length; i += size) out.push(ayat.slice(i, i + size));
  return out;
}

export async function computeWird(s = getSettings()): Promise<Wird> {
  const today = todayISO();
  const memorized = await memorizedNewestFirst();
  const learning = await db.hifz.where("status").equals("learning").toArray();
  const near = memorized.slice(0, s.nearCount).map((r) => r.page).sort((a, b) => a - b);
  const nearSet = new Set(near);
  const far = memorized
    .filter((r) => !nearSet.has(r.page) && r.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due) || a.lastScore - b.lastScore)
    .slice(0, s.farPerDay)
    .map((r) => r.page);
  // (القيم المنطقية ما تنفهرس في IndexedDB، فنفلتر بعد القراءة)
  const openMistakes = (await db.qmistakes.toArray()).filter((m) => !m.resolved);
  const seen = new Set<string>();
  const mistakes: Ref[] = [];
  for (const m of openMistakes) {
    const k = `${m.sura}:${m.ayah}`;
    if (!seen.has(k)) { seen.add(k); mistakes.push([m.sura, m.ayah]); }
    if (mistakes.length >= 8) break;
  }
  const inProgress = learning[0];
  const taken = new Set([...memorized.map((r) => r.page)]);
  const newPage = inProgress?.page ?? nextNewPage(s, taken);
  const parts = newPage ? partsOfPage(newPage, s.newPart) : [];
  const newPart = Math.min(inProgress?.part ?? 0, Math.max(0, parts.length - 1));
  return { near, far, mistakes, newPage, newPart, newAyat: parts[newPart] ?? [], totalMemorized: memorized.length };
}

/** خلص جزء من الحفظ الجديد: إذا خلصت أجزاء الوجه كلها يصير محفوظ */
export async function completeNewPart(page: number, parts: number) {
  const today = todayISO();
  const row = await db.hifz.get(page);
  const part = (row?.status === "learning" ? row.part : 0) + 1;
  if (part >= parts) {
    await db.hifz.put({ page, status: "memorized", part: 0, step: 0, due: addDays(today, 1), lastScore: 1, reps: 1, lapses: 0, memorizedOn: today, updatedAt: Date.now() });
    return true;
  }
  await db.hifz.put({ page, status: "learning", part, step: 0, due: today, lastScore: 0, reps: 0, lapses: 0, memorizedOn: null, updatedAt: Date.now() });
  return false;
}

/* ---------- دفتر الأخطاء ---------- */

export async function logMistakes(ref: Ref, r: CheckResult) {
  const today = todayISO();
  const bad = r.words.filter((w) => w.status === "missing" || w.status === "wrong");
  for (const w of bad) {
    await db.qmistakes.add({
      sura: ref[0], ayah: ref[1], word: w.word, heard: "heard" in w ? w.heard : "",
      kind: w.status === "missing" ? "missing" : "wrong", date: today, hits: 0, resolved: false,
    });
  }
}

/** سمّع الآية صح: إذا صحّت مرتين بعد الغلط تنحل */
export async function ayahPassed(ref: Ref) {
  const rows = await db.qmistakes.where("[sura+ayah]").equals(ref).toArray();
  for (const m of rows) {
    if (m.resolved) continue;
    const hits = m.hits + 1;
    await db.qmistakes.update(m.id!, { hits, resolved: hits >= 2 });
  }
}

/** نتيجة جلسة تسميع: نحدّث مراجعة كل وجه شارك فيها */
export async function applySession(results: { ref: Ref; accuracy: number }[]) {
  const byPage = new Map<number, number[]>();
  for (const r of results) {
    const p = pageOf(r.ref);
    byPage.set(p, [...(byPage.get(p) ?? []), r.accuracy]);
  }
  for (const [p, accs] of byPage) await rateRecall(p, accs.reduce((a, b) => a + b, 0) / accs.length);
}
