import { db, type Activity } from "./db";
import { addDays, todayISO } from "./utils";

export const DAILY_GOAL = 40; // نقاط التعلّم اليومية

export function addXP(area: Activity["area"], xp: number) {
  return db.activity.add({ date: todayISO(), area, xp, createdAt: Date.now() });
}

/** عدد الأيام المتتالية (لين اليوم أو أمس) اللي فيها نشاط */
export function streakFrom(dates: Set<string>): number {
  let d = todayISO();
  if (!dates.has(d)) d = addDays(d, -1);
  let n = 0;
  while (dates.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export async function areaStreak(area?: Activity["area"]): Promise<number> {
  const rows = area ? await db.activity.where("area").equals(area).toArray() : await db.activity.toArray();
  return streakFrom(new Set(rows.map((r) => r.date)));
}

export async function todayXP(area?: Activity["area"]): Promise<number> {
  const rows = await db.activity.where("date").equals(todayISO()).toArray();
  return rows.filter((r) => !area || r.area === area).reduce((s, r) => s + r.xp, 0);
}

/** محتوى يومي: يرجع المخزّن أو يولّده مرة وحدة */
export async function getDaily<T>(kind: string): Promise<T | undefined> {
  return (await db.daily.get(`${todayISO()}:${kind}`))?.data as T | undefined;
}
export function setDaily(kind: string, data: unknown) {
  return db.daily.put({ key: `${todayISO()}:${kind}`, data });
}

/** نطق إنجليزي بصوت الجهاز */
export function speak(text: string, rate = 0.9) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return false;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = rate;
    const v = synth.getVoices().find((x) => x.lang.startsWith("en-US")) ?? synth.getVoices().find((x) => x.lang.startsWith("en"));
    if (v) u.voice = v;
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}
