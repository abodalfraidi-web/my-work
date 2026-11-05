export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return todayISO(dt);
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
    weekday: "long", day: "numeric", month: "long",
  });
}

export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
    day: "numeric", month: "short",
  });
}

export function money(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "صباح الخير";
  if (h < 18) return "مساء النور";
  return "مساء الخير";
}

export const MOODS = ["😞", "😕", "😐", "🙂", "😄"];

export const EXPENSE_CATEGORIES = [
  "أكل وقهوة", "مواصلات وبنزين", "فواتير", "تسوق", "صحة", "تعليم",
  "ترفيه", "عائلة", "اشتراكات", "سكن", "أخرى",
];

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** ملف تقويم يفتحه الآيفون ويضيف الموعد مع تنبيه */
export function downloadICS(title: string, date: string, time: string | null): void {
  const [y, m, d] = date.split("-");
  const [hh, mm] = (time ?? "09:00").split(":");
  const start = `${y}${m}${d}T${hh}${mm}00`;
  const endDate = new Date(+y, +m - 1, +d, +hh, +mm + 30);
  const end = `${todayISO(endDate).replaceAll("-", "")}T${String(endDate.getHours()).padStart(2, "0")}${String(endDate.getMinutes()).padStart(2, "0")}00`;
  const esc = (s: string) => s.replace(/[,;\\]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//masari//ar", "BEGIN:VEVENT",
    `UID:${uid()}@masari`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${esc(title)}`,
    "BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY", `DESCRIPTION:${esc(title)}`, "END:VALARM",
    "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", `DESCRIPTION:${esc(title)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "reminder.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export const settings = {
  get apiKey(): string {
    try { return localStorage.getItem("masari.apiKey") ?? ""; } catch { return ""; }
  },
  set apiKey(v: string) {
    try { localStorage.setItem("masari.apiKey", v.trim()); } catch { /* ignore */ }
  },
  get name(): string {
    try { return localStorage.getItem("masari.name") ?? ""; } catch { return ""; }
  },
  set name(v: string) {
    try { localStorage.setItem("masari.name", v.trim()); } catch { /* ignore */ }
  },
};
