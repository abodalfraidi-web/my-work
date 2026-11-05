import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { db } from "./db";
import { capability, inArtifact, type SampleFn } from "./platform";
import { addDays, settings, todayISO } from "./utils";

const MODEL = "claude-opus-5-5";
// إذا رفض النموذج طلب، الـ API يعيده تلقائياً على نموذج بديل
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

export class NoKeyError extends Error {
  constructor() { super("ما فيه مفتاح Claude. حطّه من الإعدادات."); }
}

/** داخل claude.ai: نستخدم حساب Claude حقك بدون مفتاح */
async function sampler(): Promise<SampleFn | null> {
  return inArtifact ? capability<SampleFn>("sample") : null;
}

const SAMPLE_ERRORS: Record<string, string> = {
  not_granted: "لازم تسمح للصفحة تستخدم Claude (من نافذة الإذن).",
  sampling_disabled: "Claude مو متاح لحسابك هنا.",
  rate_limited: "وصلت حد الاستخدام مؤقتاً، جرّب بعد شوي.",
  refused: "المساعد ما قدر يعالج هذا الطلب، جرّب صياغة ثانية.",
  invalid_json: "ما قدرت أرتب الكلام، جرّب مرة ثانية أو وضّح أكثر.",
  session_expired: "سجّل دخولك في Claude من جديد.",
};

function client(): Anthropic {
  const apiKey = settings.apiKey;
  if (!apiKey) throw new NoKeyError();
  // تطبيق شخصي: المفتاح محفوظ في جوالك فقط ويُرسل مباشرة لـ Anthropic
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

export function friendlyError(e: unknown): string {
  if (e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string") {
    const code = (e as { code: string }).code;
    return SAMPLE_ERRORS[code] ?? "صار خطأ في الاتصال بـ Claude، جرّب مرة ثانية.";
  }
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
  const [books, vocabCount, lastMe] = await Promise.all([
    db.books.toArray(),
    db.vocab.count(),
    db.insights.where("kind").equals("me").last(),
  ]);
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

  L.push("\n## القراءة والإنجليزي");
  for (const b of books) L.push(`- [${b.status}] ${b.title} (${b.lang === "en" ? "إنجليزي" : "عربي"}) صفحة ${b.currentPage}/${b.totalPages || "?"}`);
  L.push(`كلمات إنجليزية محفوظة: ${vocabCount}`);

  if (lastMe) {
    L.push(`\n## آخر تحليل كتبته عنه (${new Date(lastMe.createdAt).toISOString().slice(0, 10)})`);
    L.push(lastMe.content.slice(0, 1500));
  }

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
  reply: z.string().describe("رد ودود: يأكد وش سجّل، وإذا حكى عن يومه يعطيه تعليق تحليلي قصير ونصيحة وحدة"),
});
export type CaptureActionT = z.infer<typeof CaptureAction>;
export type CaptureResultT = z.infer<typeof CaptureResult>;

export async function parseCapture(input: string, categories: string[], images: Blob[] = []): Promise<CaptureResultT> {
  const people = (await db.people.toArray()).map((p) => p.name);
  const today = todayISO();
  const system = `${persona()}

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
إذا فيه صور: فاتورة أو إيصال = expense بالمبلغ الإجمالي والتصنيف المناسب. صورة من يومه = journal يوصفها باختصار.
الحقول اللي ما تنطبق خلها null. ما تخترع معلومات مو في الكلام أو الصور.
في reply: أكّد وش سجّلت بجملة، وإذا حكى عن يومه أو مشاعره علّق عليها بتحليل قصير صادق (جملتين) ونصيحة وحدة.`;

  const sample = await sampler();
  if (sample) {
    const raw = await sample.json<unknown>(`${system}

رد فقط بكائن JSON بهذا الشكل بالضبط:
{"reply": "رد قصير وودود", "actions": [{"kind": "expense|task|journal|interaction|debt|study|memorize|goal", "summary": "وصف قصير", "title": null, "text": null, "amount": null, "category": null, "note": null, "date": null, "time": null, "personName": null, "direction": null, "mood": null, "minutes": null, "subject": null}]}

كلام المستخدم:
"""${input || "(ما كتب شي، شوف الصور)"}"""`, { cache: false, ...(images.length ? { images } : {}) });
    const parsed = CaptureResult.safeParse(normalize(raw));
    if (!parsed.success) throw new Error("ما قدرت أفهم الكلام، جرّب تكتبه بشكل ثاني.");
    return parsed.data;
  }

  const res = await client().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(CaptureResult) },
    system,
    messages: [{
      role: "user",
      content: [
        ...(await Promise.all(images.map(toImageBlock))),
        { type: "text" as const, text: input || "(ما كتب شي، شوف الصور)" },
      ],
    }],
  });
  if (res.stop_reason === "refusal") throw new Error("المساعد ما قدر يعالج هذا الطلب.");
  if (!res.parsed_output) throw new Error("ما قدرت أفهم الكلام، جرّب تكتبه بشكل ثاني.");
  return res.parsed_output;
}

async function toImageBlock(b: Blob) {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return {
    type: "image" as const,
    source: { type: "base64" as const, media_type: "image/jpeg" as const, data: btoa(bin) },
  };
}

/** يكمّل الحقول الناقصة بـ null عشان يمر من التحقق */
function normalize(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as { reply?: unknown; actions?: unknown };
  const keys = Object.keys(CaptureAction.shape);
  const actions = Array.isArray(r.actions) ? r.actions.map((a) => {
    const o: Record<string, unknown> = {};
    for (const k of keys) o[k] = (a as Record<string, unknown>)?.[k] ?? null;
    if (typeof o.amount === "string") o.amount = Number(o.amount) || null;
    if (typeof o.minutes === "string") o.minutes = Number(o.minutes) || null;
    if (typeof o.mood === "number") o.mood = Math.round(o.mood);
    if (typeof o.summary !== "string") o.summary = String(o.title ?? o.text ?? "");
    return o;
  }) : [];
  return { reply: typeof r.reply === "string" ? r.reply : "", actions };
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
  const system = `${persona()}\n\n${opts.task}${ctx ? `\n\n# بيانات المستخدم\n${ctx}` : ""}`;

  const sample = await sampler();
  if (sample) {
    const { text } = await sample(
      [{ role: "user", content: `# تعليماتك (ثابتة)\n${system}` }, ...opts.messages],
      {
        cache: false,
        modelTier: opts.effort === "high" ? "complex" : "default",
        onText: ({ text }) => opts.onText(text),
      },
    );
    return text;
  }

  const stream = client().beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: opts.effort ?? "medium" },
    system,
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

export function analyzeMe(onText: (s: string) => void) {
  return streamReply({
    task: `اكتب تحليل شخصي عميق وصادق عن المستخدم من كل بياناته (اليوميات، المهام، الأهداف، المصاريف، العلاقات، المذاكرة، القراءة). لو فيه تحليل سابق قارن معه ووضّح وش تغيّر.
اكتب بهذا الترتيب:
## الصورة العامة
جملتين عن شخصيته وأسلوب حياته كما تظهر في البيانات.
## نقاط القوة
3 إلى 5 نقاط، كل وحدة مع دليل من بياناته.
## نقاط الضعف
3 إلى 5 نقاط بصراحة ولطف، كل وحدة مع دليل.
## الأنماط اللي لاحظتها
عادات متكررة (أيام، أوقات، مزاج، صرف، علاقات).
## خطة تطوير 30 يوم
3 محاور فقط، لكل محور عادة يومية صغيرة ومقياس نجاح.
## سؤال لك
سؤال واحد يخليه يفكر.
إذا البيانات قليلة قل ذلك بوضوح وركّز على اللي موجود.`,
    messages: [{ role: "user", content: "حلّلني" }],
    onText,
    effort: "high",
  });
}

const WordInfo = z.object({
  meaning: z.string(),
  explanation: z.string(),
  example: z.string(),
});
export type WordInfoT = z.infer<typeof WordInfo>;

export async function lookupWord(word: string, sentence: string): Promise<WordInfoT> {
  const prompt = `اشرح الكلمة الإنجليزية "${word}" كما جاءت في هذي الجملة: "${sentence}".
رد فقط بـ JSON: {"meaning": "المعنى بالعربي بكلمة أو كلمتين", "explanation": "شرح قصير بالعربي للمعنى في السياق ونوع الكلمة", "example": "جملة إنجليزية بسيطة جديدة فيها الكلمة"}`;
  const sample = await sampler();
  if (sample) {
    const raw = await sample.json<Record<string, unknown>>(prompt, { modelTier: "quick" });
    return WordInfo.parse({ meaning: String(raw.meaning ?? ""), explanation: String(raw.explanation ?? ""), example: String(raw.example ?? "") });
  }
  const res = await client().beta.messages.parse({
    model: MODEL,
    max_tokens: 1000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(WordInfo) },
    messages: [{ role: "user", content: prompt }],
  });
  if (!res.parsed_output) throw new Error("ما قدرت أشرح الكلمة.");
  return res.parsed_output;
}

export function writeReading(level: string, topic: string, knownWords: string[], onText: (s: string) => void) {
  return streamReply({
    task: `You write graded English reading texts for an Arabic-speaking learner.
Level: ${level} (CEFR). Topic: ${topic || "something useful for daily life and self-improvement"}.
Write ONE engaging text of about 250-350 words. Use natural English suited to the level, short paragraphs, and a title on the first line starting with "# ".
Reuse some of these words the learner is studying, if they fit: ${knownWords.slice(0, 20).join(", ") || "none yet"}.
Write only the text. No translation, no notes.`,
    messages: [{ role: "user", content: "Write the text." }],
    onText,
    effort: "medium",
    withContext: false,
  });
}
