/* تشغيل التطبيق داخل claude.ai (نسخة تجريبية) أو كتطبيق مستقل على الآيفون */

type Use = (name: string) => Promise<unknown>;
const claudeRuntime = (window as unknown as { claude?: { use?: Use } }).claude;

/** true لما الصفحة تشتغل كـ Artifact داخل claude.ai */
export const inArtifact = typeof claudeRuntime?.use === "function";

const cache = new Map<string, Promise<unknown>>();
export function capability<T>(name: string): Promise<T | null> {
  if (!inArtifact) return Promise.resolve(null);
  if (!cache.has(name)) cache.set(name, claudeRuntime!.use!(name).catch(() => null));
  return cache.get(name) as Promise<T | null>;
}

export interface SampleFn {
  (input: string | { role: "user" | "assistant"; content: string }[], opts?: {
    onText?: (u: { text: string; delta: string }) => void;
    modelTier?: "quick" | "default" | "complex";
    cache?: boolean;
  }): Promise<{ text: string; truncated: boolean }>;
  json<T>(input: string, opts?: { modelTier?: "quick" | "default" | "complex"; cache?: boolean; images?: Blob[] }): Promise<T>;
}

interface Downloads {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}

/** يعطي المستخدم ملف (نسخة احتياطية أو موعد تقويم) */
export async function saveFile(filename: string, data: string, mime: string): Promise<boolean> {
  if (inArtifact) {
    const dl = await capability<Downloads>("downloads");
    if (!dl) return false;
    try { await dl.save({ filename, data: new Blob([data], { type: mime }) }); return true; }
    catch { return false; }
  }
  const file = new File([data], filename, { type: mime });
  if (mime === "application/json" && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; } catch { /* ألغى المشاركة */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}

/* ---------- مزامنة سحابية خاصة (داخل claude.ai فقط) ---------- */
// تحفظ نسخة من بياناتك النصية في مساحتك الخاصة على claude.ai (ما يشوفها غيرك)
// عشان ما تضيع لو انمسح المتصفح، وتنتقل معك بين الأجهزة.

interface DocRef {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface CloudDb { doc(path: string): DocRef }
interface UserCap { id(): Promise<string | null> }

const CHUNK = 60000; // حروف لكل وثيقة (الحد 256KB)

async function cloudBase(): Promise<{ db: CloudDb; base: string } | null> {
  const [db, user] = await Promise.all([capability<CloudDb>("db"), capability<UserCap>("user")]);
  if (!db || !user) return null;
  const id = await user.id().catch(() => null);
  return id ? { db, base: `data/users/${id}` } : null;
}

export type SyncState = "off" | "idle" | "saving" | "saved" | "error";
let syncState: SyncState = inArtifact ? "idle" : "off";
let lastSaved: number | null = null;
const listeners = new Set<() => void>();
export const sync = {
  get state() { return syncState; },
  get lastSaved() { return lastSaved; },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};
function setSync(s: SyncState) { syncState = s; listeners.forEach((f) => f()); }

export async function cloudSave(json: string): Promise<void> {
  const c = await cloudBase();
  if (!c) { setSync("off"); return; }
  setSync("saving");
  try {
    const n = Math.ceil(json.length / CHUNK) || 1;
    const meta = await c.db.doc(`${c.base}/backup-meta`).get();
    const oldN = Number(meta.data()?.chunks ?? 0);
    for (let i = 0; i < n; i++) {
      await c.db.doc(`${c.base}/backup-chunk${i}`).set({ s: json.slice(i * CHUNK, (i + 1) * CHUNK) });
    }
    await c.db.doc(`${c.base}/backup-meta`).set({ chunks: n, at: Date.now() });
    for (let i = n; i < oldN; i++) await c.db.doc(`${c.base}/backup-chunk${i}`).delete().catch(() => {});
    lastSaved = Date.now();
    setSync("saved");
  } catch {
    setSync("error");
  }
}

export async function cloudLoad(): Promise<string | null> {
  const c = await cloudBase();
  if (!c) return null;
  try {
    const meta = await c.db.doc(`${c.base}/backup-meta`).get();
    const n = Number(meta.data()?.chunks ?? 0);
    if (!n) return null;
    let json = "";
    for (let i = 0; i < n; i++) json += String((await c.db.doc(`${c.base}/backup-chunk${i}`).get()).data()?.s ?? "");
    lastSaved = Number(meta.data()?.at ?? 0) || null;
    return json;
  } catch {
    return null;
  }
}
