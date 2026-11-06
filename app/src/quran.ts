/*
 * نص المصحف من مشروع تنزيل (Tanzil Project) — https://tanzil.net
 * يُعرض النص كما هو بدون أي تعديل. التطبيع (حذف التشكيل) يتم في الذاكرة فقط للمقارنة.
 */
import suras from "./quran/suras.json";

export const SURAS = suras as [string, number, string][]; // [الاسم، عدد الآيات، مكية/مدنية]

let cache: string[][] | null = null;

/** في نص تنزيل تأتي البسملة في بداية أول آية من كل سورة (عدا الفاتحة والتوبة)، فنفصلها عن الآية */
export let BASMALA = "";

/** يحمّل النص مرة وحدة (ملف كبير، فنحمّله وقت الحاجة) */
export async function loadQuran(): Promise<string[][]> {
  if (cache) return cache;
  const raw = (await import("./quran/quran-simple.txt?raw")).default as string;
  const out: string[][] = Array.from({ length: 114 }, () => []);
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("|");
    const j = line.indexOf("|", i + 1);
    const sura = Number(line.slice(0, i)), ayah = Number(line.slice(i + 1, j));
    let text = line.slice(j + 1).trim();
    if (sura === 1 && ayah === 1) BASMALA = text;
    if (ayah === 1 && sura !== 1) {
      const ws = text.split(" ");
      if (ws.length > 4 && ws.slice(0, 4).map(normalize).join("") === "بسماللهالرحمنالرحيم") text = ws.slice(4).join(" ");
    }
    out[sura - 1][ayah - 1] = text;
  }
  cache = out;
  return out;
}

export const TANZIL_NOTICE = "نص المصحف من مشروع تنزيل tanzil.net، منقول كما هو بدون تعديل.";

/** يحذف التشكيل وعلامات الوقف ويوحّد أشكال الحروف، للمقارنة فقط */
export function normalize(word: string): string {
  return word
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/[^ء-ي]/g, "");
}

export function words(text: string): string[] {
  return text.split(/\s+/).filter((w) => normalize(w).length > 0);
}

function charSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[m][n] / Math.max(m, n);
}

export type WordResult =
  | { status: "ok"; word: string }
  | { status: "close"; word: string; heard: string }
  | { status: "wrong"; word: string; heard: string }
  | { status: "missing"; word: string };

export interface CheckResult {
  words: WordResult[];
  extra: string[]; // كلمات زايدة قالها
  accuracy: number; // 0..1
}

/**
 * يقارن التسميع بالنص الصحيح كلمة بكلمة (محاذاة بأقل تعديلات).
 * يشتغل للقرآن والإنجليزي: للإنجليزي نمرر normalizeFn مختلفة.
 */
export function check(expected: string[], heard: string[], norm: (w: string) => string = normalize): CheckResult {
  const E = expected.map(norm), H = heard.map(norm);
  const m = E.length, n = H.length;
  const sim = (i: number, j: number) => charSimilarity(E[i], H[j]);
  const cost = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) cost[i][0] = i;
  for (let j = 1; j <= n; j++) cost[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const s = sim(i - 1, j - 1);
      cost[i][j] = Math.min(cost[i - 1][j] + 1, cost[i][j - 1] + 1, cost[i - 1][j - 1] + (s >= 0.999 ? 0 : s >= 0.6 ? 0.6 : 1.4));
    }
  const out: WordResult[] = [];
  const extra: string[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const s = sim(i - 1, j - 1);
      const c = s >= 0.999 ? 0 : s >= 0.6 ? 0.6 : 1.4;
      if (Math.abs(cost[i][j] - (cost[i - 1][j - 1] + c)) < 1e-9) {
        out.push(s >= 0.999 ? { status: "ok", word: expected[i - 1] }
          : s >= 0.6 ? { status: "close", word: expected[i - 1], heard: heard[j - 1] }
          : { status: "wrong", word: expected[i - 1], heard: heard[j - 1] });
        i--; j--; continue;
      }
    }
    if (i > 0 && Math.abs(cost[i][j] - (cost[i - 1][j] + 1)) < 1e-9) { out.push({ status: "missing", word: expected[i - 1] }); i--; continue; }
    extra.push(heard[j - 1]); j--;
  }
  out.reverse(); extra.reverse();
  const ok = out.filter((w) => w.status === "ok").length + 0.5 * out.filter((w) => w.status === "close").length;
  return { words: out, extra, accuracy: m ? Math.max(0, (ok - extra.length * 0.5) / m) : 0 };
}

export function normalizeEnglish(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']/g, "").replace(/'/g, "");
}
