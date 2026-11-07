import Dexie, { type EntityTable } from "dexie";

export interface Task {
  id?: number;
  title: string;
  date: string | null; // YYYY-MM-DD, null = بدون تاريخ
  time: string | null; // HH:MM
  done: boolean;
  goalId: number | null;
  createdAt: number;
}

export interface Milestone {
  id: string;
  title: string;
  done: boolean;
}

export interface Goal {
  id?: number;
  title: string;
  why: string; // ليش هذا الهدف مهم
  category: string;
  deadline: string | null;
  milestones: Milestone[];
  plan: string; // خطة يكتبها المساعد
  status: "active" | "done" | "paused";
  createdAt: number;
}

export interface JournalEntry {
  id?: number;
  date: string;
  text: string;
  mood: number; // 1..5
  photoIds?: number[];
  createdAt: number;
}

export interface Expense {
  id?: number;
  amount: number;
  category: string;
  note: string;
  date: string;
  createdAt: number;
}

export interface Debt {
  id?: number;
  person: string;
  amount: number;
  paid: number;
  direction: "i_owe" | "owed_to_me";
  note: string;
  dueDate: string | null;
  createdAt: number;
}

export interface Person {
  id?: number;
  name: string;
  relation: string;
  notes: string;
  analysis: string;
  analysisAt: number | null;
  createdAt: number;
}

export interface Interaction {
  id?: number;
  personId: number;
  date: string;
  text: string;
  createdAt: number;
}

export interface StudySession {
  id?: number;
  subject: string;
  minutes: number;
  note: string;
  date: string;
  createdAt: number;
}

/** مقطع محفوظ يدخل في المراجعة المتباعدة */
export interface MemoItem {
  id?: number;
  title: string; // مثال: سورة الملك ١-١٠
  addedOn: string;
  nextReview: string;
  intervalDays: number;
  reviews: number;
  createdAt: number;
}

/** صورة محفوظة داخل الجهاز (مصغّرة) */
export interface Photo {
  id?: number;
  blob: Blob;
  date: string;
  caption: string;
  createdAt: number;
}

export interface Book {
  id?: number;
  title: string;
  author: string;
  lang: "ar" | "en";
  status: "want" | "reading" | "done";
  totalPages: number;
  currentPage: number;
  notes: string;
  startedOn: string | null;
  finishedOn: string | null;
  createdAt: number;
}

/** نص للقراءة داخل التطبيق (إنجليزي غالباً) */
export interface ReadingText {
  id?: number;
  title: string;
  content: string;
  level: string;
  source: "pasted" | "file" | "ai";
  progress: number; // 0..1
  translation?: string;
  createdAt: number;
}

export interface VocabWord {
  id?: number;
  word: string;
  meaning: string; // بالعربي
  example: string;
  nextReview: string;
  intervalDays: number;
  reviews: number;
  createdAt: number;
}

/** تحليلات المساعد المحفوظة (عني، فترات) عشان نتابع التطور */
export interface Insight {
  id?: number;
  kind: "me" | "period";
  title: string;
  content: string;
  createdAt: number;
}

export interface Recitation {
  id?: number;
  sura: number; // 1..114
  from: number;
  to: number;
  accuracy: number; // 0..1
  date: string;
  createdAt: number;
}

export interface Habit {
  id?: number;
  name: string;
  kind: "habit" | "prayer";
  order: number;
  active: boolean;
  createdAt: number;
}

export interface HabitLog {
  id?: number;
  habitId: number;
  date: string;
}

/** نقاط الخبرة لكل نشاط (للسلسلة اليومية والحلقات) */
export interface Activity {
  id?: number;
  date: string;
  area: "english" | "quran" | "puzzle" | "reading" | "focus";
  xp: number;
  createdAt: number;
}

/** محتوى يومي من المساعد (كلمات اليوم، أسئلة اليوم...) عشان ما يتكرر الطلب */
export interface DailyItem {
  key: string; // 2026-11-06:words
  data: unknown;
}

/** حالة حفظ كل وجه (604 وجه) وجدول مراجعته */
export interface HifzPage {
  page: number; // 1..604
  status: "learning" | "memorized";
  part: number; // كم جزء خلص من الوجه أثناء الحفظ الجديد
  step: number; // درجة سلّم المراجعة
  due: string; // موعد المراجعة الجاية
  lastScore: number;
  reps: number;
  lapses: number;
  memorizedOn: string | null;
  updatedAt: number;
}

/** كلمة غلطت فيها في التسميع */
export interface QMistake {
  id?: number;
  sura: number;
  ayah: number;
  word: string;
  heard: string;
  kind: "missing" | "wrong";
  date: string;
  hits: number; // كم مرة سمّعت الآية صح بعد الغلط
  resolved: boolean;
}

export interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export const db = new Dexie("masari") as Dexie & {
  tasks: EntityTable<Task, "id">;
  goals: EntityTable<Goal, "id">;
  journal: EntityTable<JournalEntry, "id">;
  expenses: EntityTable<Expense, "id">;
  debts: EntityTable<Debt, "id">;
  people: EntityTable<Person, "id">;
  interactions: EntityTable<Interaction, "id">;
  study: EntityTable<StudySession, "id">;
  memo: EntityTable<MemoItem, "id">;
  chat: EntityTable<ChatMessage, "id">;
  photos: EntityTable<Photo, "id">;
  books: EntityTable<Book, "id">;
  texts: EntityTable<ReadingText, "id">;
  vocab: EntityTable<VocabWord, "id">;
  insights: EntityTable<Insight, "id">;
  recitations: EntityTable<Recitation, "id">;
  habits: EntityTable<Habit, "id">;
  habitLogs: EntityTable<HabitLog, "id">;
  activity: EntityTable<Activity, "id">;
  daily: EntityTable<DailyItem, "key">;
  hifz: EntityTable<HifzPage, "page">;
  qmistakes: EntityTable<QMistake, "id">;
};

db.version(1).stores({
  tasks: "++id, date, done, goalId",
  goals: "++id, status",
  journal: "++id, date",
  expenses: "++id, date, category",
  debts: "++id, person",
  people: "++id, name",
  interactions: "++id, personId, date",
  study: "++id, date, subject",
  memo: "++id, nextReview",
  chat: "++id, createdAt",
});
db.version(2).stores({
  photos: "++id, date",
  books: "++id, status",
  texts: "++id, createdAt",
  vocab: "++id, nextReview, word",
  insights: "++id, kind, createdAt",
});
db.version(3).stores({
  recitations: "++id, sura, date",
  habits: "++id, order",
  habitLogs: "++id, date, habitId, [habitId+date]",
  activity: "++id, date, area",
  daily: "key",
});
db.version(4).stores({
  hifz: "page, status, due",
  qmistakes: "++id, resolved, [sura+ayah]",
});

// الصور ما تدخل في النسخة الاحتياطية النصية (حجمها كبير)
export const TABLES = [
  "tasks", "goals", "journal", "expenses", "debts",
  "people", "interactions", "study", "memo", "chat",
  "books", "texts", "vocab", "insights",
  "recitations", "habits", "habitLogs", "activity", "daily",
  "hifz", "qmistakes",
] as const;

export async function exportAll(): Promise<string> {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) out[t] = await db.table(t).toArray();
  return JSON.stringify({ app: "masari", version: 1, exportedAt: Date.now(), data: out });
}

export async function importAll(json: string): Promise<void> {
  const parsed = JSON.parse(json);
  if (parsed?.app !== "masari" || typeof parsed.data !== "object") {
    throw new Error("الملف مو نسخة احتياطية من مساري");
  }
  await db.transaction("rw", TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      if (!Array.isArray(parsed.data[t])) continue;
      await db.table(t).clear();
      const rows = parsed.data[t];
      if (Array.isArray(rows)) await db.table(t).bulkPut(rows);
    }
  });
}

/** يلقى الشخص بالاسم أو ينشئه */
export async function findOrCreatePerson(name: string): Promise<number> {
  const clean = name.trim();
  const all = await db.people.toArray();
  const hit = all.find((p) => p.name === clean) ??
    all.find((p) => p.name.includes(clean) || clean.includes(p.name));
  if (hit?.id) return hit.id;
  return (await db.people.add({
    name: clean, relation: "", notes: "", analysis: "", analysisAt: null, createdAt: Date.now(),
  })) as number;
}

export async function isEmpty(): Promise<boolean> {
  for (const t of TABLES) if ((await db.table(t).count()) > 0) return false;
  return true;
}

/** يصغّر الصورة لـ 1280px ويحفظها */
export async function addPhoto(file: Blob, date: string, caption = ""): Promise<number> {
  const blob = await shrinkImage(file, 1280);
  return (await db.photos.add({ blob, date, caption, createdAt: Date.now() })) as number;
}

export async function shrinkImage(file: Blob, max: number): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
  } catch {
    return file;
  }
}
