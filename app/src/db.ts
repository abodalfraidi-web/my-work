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

const TABLES = [
  "tasks", "goals", "journal", "expenses", "debts",
  "people", "interactions", "study", "memo", "chat",
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
      await db.table(t).clear();
      const rows = parsed.data[t];
      if (Array.isArray(rows)) await db.table(t).bulkAdd(rows);
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
