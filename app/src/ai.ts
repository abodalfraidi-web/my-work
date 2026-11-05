import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { db } from "./db";
import { addDays, settings, todayISO } from "./utils";

const MODEL = "claude-opus-5-5";
// إذا رفض النموذج طلب، الـ API يعيده تلقائياً على نموذج بديل
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

export class NoKeyError extends Error {
  constructor() { super("ما فيه مفتاح Claude. حطّه من الإعدادات."); }
}

function client(): Anthropic {
  const apiKey = settings.apiKey;
  if (!apiKey) throw new NoKeyError();
  // تطبيق شخصي: المفتاح محفوظ في جوالك فقط ويُرسل مباشرة لـ Anthropic
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

export function friendlyError(e: unknown): string {
  if (e instanceof NoKeyError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "المفتاح غلط أو منتهي. راجعه من الإعدادات.";
  if (e instanceof Anthropic.RateLimitError) return "ضغط كثير على الخدمة، جرّب بعد دقيقة.";
  if (e instanceof Anthropic.APIConnectionError) return "ما فيه اتصال بالإنترنت.";
  if (e instanceof Anthropic.APIError) return `خطأ من الخدمة (${e.status}): ${e.message}`;
  return e instanceof Error ? e.message : "صار خطأ غير متوقع";
}

const PERSONA = `أنت "مساري"، المساعد الشخصي لـ{name}. تتكلم باللهجة السعودية البيضاء، ودود ومباشر وصادق، تحفّز بدون مبالغة، وتحاسب بلطف إذا فيه تقصير.
عندك بياناته الحقيقية من التطبيق (أهداف، مهام، يوميات، مصاريف، ديون، أشخاص، مذاكرة، حفظ). استخدمها في كلامك واستشهد بأرقام وتواريخ حقيقية منها، ولا تخترع بيانات مو موجودة.
الردود قصيرة ومرتبة ومناسبة لشاشة جوال. استخدم نقاط وإيموجي بقدر خفيف.`;

function persona(): string {
  return PERSONA.replace("{name}", settings.name || "صاحبي");
}

/** ملخص نصي لبيانات المستخدم يعطيه للمساعد */
export async function buildContext(): Promise<string> {
  const today = todayISO();
  const since30 = addDays(today, -30);
  const since14 = addDays(today, -14);
  const [goals, tasks, journal, expenses, debts, people, study, memo] = await Promise.all([
    db.goals.toArray(),
    db.tasks.toArray(),
    db.journal.where("date").aboveOrEqual(since14).toArray(),
    db.expenses.where("date").aboveOrEqual(since30).toArray(),
    db.debts.toArray(),
    db.people.toArray(),
    db.study.where("date").aboveOrEqual(since14).toArray(),
    db.memo.toArray(),
  ]);
  const L: string[] = [`اليوم: ${today}`];

  L.push("\n## الأهداف");
  for (const g of goals) {
    const done = g.milestones.filter((m) => m.done).length;
    L.push(`- [${g.status}] ${g.title} (${g.category}) | الموعد: ${g.deadline ?? "بدون"} | مراحل ${done}/${g.milestones.length} | السبب: ${g.why}`);
    for (const m of g.milestones) L.push(`   ${m.done ? "✓" : "○"} ${m.title}`);
  }

  L.push("\n## المهام (المفتوحة + آخر أسبوعين)");
  for (const t of tasks.filter((t) => !t.done || (t.date && t.date >= since14))) {
    L.push(`- ${t.done ? "✓" : "○"} ${t.title} | ${t.date ?? "بدون تاريخ"} ${t.time ?? ""}`);
  }

  L.push("\n## اليوميات (آخر أسبوعين)");
  for (const j of journal.sort((a, b) => a.date.localeCompare(b.date))) {
    L.push(`- ${j.date} مزاج ${j.mood}/5: ${j.text}`);
  }

  L.push("\n## المصاريف (آخر 30 يوم)");
  const byCat: Record<string, number> = {};
  for (const e of expenses) byCat[e.category] = (byCat[e.category] ?? 0) + e.amount;
  L.push(`المجموع: ${expenses.reduce((s, e) => s + e.amount, 0)} ريال`);
  for (const [c, v] of Object.entries(byCat)) L.push(`- ${c}: ${v}`);
  for (const e of expenses.slice(-25)) L.push(`  · ${e.date} ${e.amount} ${e.category} ${e.note}`);

  L.push("\n## الديون");
  for (const d of debts.filter((d) => d.paid < d.amount)) {
    L.push(`- ${d.direction === "i_owe" ? "علي لـ" : "لي عند"} ${d.person}: باقي ${d.amount - d.paid} من ${d.amount} | استحقاق ${d.dueDate ?? "بدون"} | ${d.note}`);
  }

  L.push("\n## الأشخاص");
  for (const p of people) L.push(`- ${p.name} (${p.relation || "بدون تصنيف"})`);

  L.push("\n## المذاكرة (آخر أسبوعين)");
  for (const s of study) L.push(`- ${s.date} ${s.subject} ${s.minutes} دقيقة ${s.note}`);

  L.push("\n## الحفظ");
  for (const m of memo) L.push(`- ${m.title} | المراجعة الجاية ${m.nextReview} | مرات المراجعة ${m.reviews}`);

  return L.join("\n");
}

/* ---------- تحويل الكلام الحر إلى سجلات ---------- */

const CaptureAction = z.object({
  kind: z.enum(["expense", "task", "journal", "interaction", "debt", "study", "memorize", "goal"]),
  summary: z.string().describe("وصف قصير بالعربي يظهر للمستخدم للتأكيد"),
  title: z.string().nullable().describe("عنوان المهمة أو الهدف أو المقطع المحفوظ"),
  text: z.string().nullable().describe("نص اليومية أو تفاصيل التواصل مع الشخص بصياغة واضحة"),
  amount: z.number().nullable(),
  category: z.string().nullable(),
  note: z.string().nullable(),
  date: z.string().nullable().describe("YYYY-MM-DD"),
  time: z.string().nullable().describe("HH:MM بنظام 24 ساعة"),
  personName: z.string().nullable(),
  direction: z.enum(["i_owe", "owed_to_me"]).nullable(),
  mood: z.number().int().nullable().describe("1 إلى 5"),
  minutes: z.number().nullable(),
  subject: z.string().nullable(),
});
const CaptureResult = z.object({
  actions: z.array(CaptureAction),
  reply: z.string().describe("رد قصير وودود على المستخدم بعد التسجيل"),
});
export type CaptureActionT = z.infer<typeof CaptureAction>;
export type CaptureResultT = z.infer<typeof CaptureResult>;

export async function parseCapture(input: string, categories: string[]): Promise<CaptureResultT> {
  const people = (await db.people.toArray()).map((p) => p.name);
  const today = todayISO();
  const res = await client().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(CaptureResult) },
    system: `${persona()}

مهمتك الحين: المستخدم كتب أو قال كلام حر، حوّله لسجلات في التطبيق. الكلام الواحد ممكن يحتوي أكثر من سجل.
اليوم ${today} (${new Date().toLocaleDateString("ar-SA-u-ca-gregory", { weekday: "long" })}). حوّل "بكرة" و"الخميس" ونحوها لتواريخ.
أنواع السجلات:
- expense: مصروف. amount بالريال، category واحدة من: ${categories.join("، ")}. note وصف.
- task: مهمة أو تذكير. title، date، time إن وُجد.
- journal: وش صار في يومه ومشاعره. text، mood (1-5) تقديرك من كلامه.
- interaction: جلسة أو تواصل أو كلام مع شخص معيّن. personName، text فيه وش صار ووش قال الشخص بالتفصيل.
- debt: دين. personName، amount، direction (i_owe = عليه هو، owed_to_me = له عند غيره)، note.
- study: مذاكرة. subject، minutes.
- memorize: حفظ جديد (قرآن أو غيره). title مثل "سورة الملك ١-١٠".
- goal: هدف جديد. title، note = ليش.
الأشخاص المعروفين: ${people.join("، ") || "لا أحد بعد"}. إذا الاسم يطابق واحد منهم استخدم نفس الكتابة.
الحقول اللي ما تنطبق خلها null. ما تخترع معلومات مو في الكلام.`,
    messages: [{ role: "user", content: input }],
  });
  if (res.stop_reason === "refusal") throw new Error("المساعد ما قدر يعالج هذا الطلب.");
  if (!res.parsed_output) throw new Error("ما قدرت أفهم الكلام، جرّب تكتبه بشكل ثاني.");
  return res.parsed_output;
}

/* ---------- نص متدفق (محادثة وتحليل) ---------- */

export async function streamReply(opts: {
  task: string;
  messages: { role: "user" | "assistant"; content: string }[];
  onText: (soFar: string) => void;
  effort?: "low" | "medium" | "high";
  withContext?: boolean;
}): Promise<string> {
  const ctx = opts.withContext === false ? "" : await buildContext();
  const stream = client().beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: opts.effort ?? "medium" },
    system: `${persona()}\n\n${opts.task}${ctx ? `\n\n# بيانات المستخدم\n${ctx}` : ""}`,
    messages: opts.messages,
  });
  let text = "";
  stream.on("text", (delta) => {
    text += delta;
    opts.onText(text);
  });
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") throw new Error("المساعد ما قدر يكمل هذا الطلب.");
  return text;
}

export function analyzePerson(personName: string, profile: string, log: string, onText: (s: string) => void) {
  return streamReply({
    task: `حلّل شخصية وعلاقة المستخدم مع "${personName}" بناءً على سجل التواصل تحت. اكتب:
1. **صورة عامة** عن الشخص (طباعه، اهتماماته، أسلوبه) من الأدلة فقط.
2. **نمط العلاقة**: كيف تمشي الأمور بينكم، ووش يتكرر.
3. **نقاط انتبه لها** وأي إشارات مهمة.
4. **كيف تتعامل معه** بشكل أفضل.
5. **متابعات مقترحة**: أشياء وعدت فيها أو مواضيع تستاهل ترجع لها.
كن منصف ولا تحكم بقسوة من موقف واحد، ووضّح إذا البيانات قليلة.

# الملف
${profile}

# سجل التواصل
${log}`,
    messages: [{ role: "user", content: `حلّل لي ${personName}` }],
    onText,
    effort: "high",
    withContext: false,
  });
}

export function planGoal(goalText: string, onText: (s: string) => void) {
  return streamReply({
    task: `ساعد المستخدم يخطط لهدفه. اعطه خطة عملية مرتبة:
- وضّح الهدف بشكل قابل للقياس.
- قسّمه لـ 4 إلى 7 مراحل، كل مرحلة في سطر يبدأ بـ "- [ ] " ومعها مدة تقريبية.
- أول 3 خطوات يسويها هالأسبوع.
- العوائق المتوقعة وكيف يتجاوزها.
خذ بعين الاعتبار وقته والتزاماته من بياناته.`,
    messages: [{ role: "user", content: goalText }],
    onText,
    effort: "high",
  });
}

export function analyzePeriod(days: number, onText: (s: string) => void) {
  return streamReply({
    task: `اكتب تقرير تحليلي لآخر ${days} يوم من حياة المستخدم من بياناته:
1. **الملخص**: كيف كانت الفترة بجملتين.
2. **الإنجاز**: المهام والأهداف، وش تقدّم ووش تأخر.
3. **المزاج واليوميات**: الأنماط اللي تلاحظها (أيام حلوة/سيئة ووش السبب المحتمل).
4. **الفلوس**: وين راحت أغلب المصاريف، وأي تنبيه، ووضع الديون.
5. **المذاكرة والحفظ**: الالتزام والاستمرارية.
6. **العلاقات**: مع مين تواصل أكثر وأي متابعة لازمة.
7. **3 توصيات** محددة للفترة الجاية.
كن صريح ومحدد، استشهد بأرقام.`,
    messages: [{ role: "user", content: "حلّل فترتي" }],
    onText,
    effort: "high",
  });
}

export function morningBrief(onText: (s: string) => void) {
  return streamReply({
    task: `اعطه موجز اليوم بشكل قصير جداً (5 أسطر كحد أقصى): أهم 3 أشياء لازم يسويها اليوم مرتبة بالأولوية مع السبب، وأي مراجعة حفظ أو دين مستحق، وجملة تحفيزية مرتبطة بأهدافه.`,
    messages: [{ role: "user", content: "وش المفروض أسوي اليوم؟" }],
    onText,
    effort: "medium",
  });
}
