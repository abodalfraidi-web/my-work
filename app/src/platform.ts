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
  json<T>(input: string, opts?: { modelTier?: "quick" | "default" | "complex"; cache?: boolean }): Promise<T>;
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
