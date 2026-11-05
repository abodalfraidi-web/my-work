import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, type Debt } from "../db";
import { BackHeader, Progress, Sheet, ask } from "../ui";
import { EXPENSE_CATEGORIES, money, shortDate, todayISO } from "../utils";

function ExpenseEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  async function save() {
    const n = Number(amount);
    if (!n) return;
    await db.expenses.add({ amount: n, category, note: note.trim(), date, createdAt: Date.now() });
    setAmount(""); setNote(""); onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="مصروف">
      <input className="input" style={{ fontSize: 28, textAlign: "center", fontWeight: 700 }} inputMode="decimal" autoFocus placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <div className="chips" style={{ margin: "12px 0" }}>
        {EXPENSE_CATEGORIES.map((c) => <button key={c} className={`chip ${c === category ? "on" : ""}`} onClick={() => setCategory(c)}>{c}</button>)}
      </div>
      <div className="grid2">
        <input className="input" placeholder="وصف (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <button className="btn primary block" style={{ marginTop: 12 }} onClick={save} disabled={!Number(amount)}>احفظ</button>
    </Sheet>
  );
}

function DebtEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<Debt["direction"]>("i_owe");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  async function save() {
    if (!person.trim() || !Number(amount)) return;
    await db.debts.add({ person: person.trim(), amount: Number(amount), paid: 0, direction, note, dueDate: dueDate || null, createdAt: Date.now() });
    setPerson(""); setAmount(""); setNote(""); setDueDate(""); onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="دين">
      <div className="chips" style={{ marginBottom: 10 }}>
        <button className={`chip ${direction === "i_owe" ? "on" : ""}`} onClick={() => setDirection("i_owe")}>علي أنا</button>
        <button className={`chip ${direction === "owed_to_me" ? "on" : ""}`} onClick={() => setDirection("owed_to_me")}>لي عند غيري</button>
      </div>
      <label className="field"><span>الشخص أو الجهة</span><input className="input" value={person} onChange={(e) => setPerson(e.target.value)} /></label>
      <div className="grid2">
        <label className="field"><span>المبلغ</span><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="field"><span>موعد السداد</span><input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
      </div>
      <label className="field"><span>ملاحظة</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <button className="btn primary block" onClick={save}>احفظ</button>
    </Sheet>
  );
}

function PayDebt({ debt, onClose }: { debt: Debt | null; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  if (!debt) return null;
  const left = debt.amount - debt.paid;
  return (
    <Sheet open onClose={onClose} title={`سداد: ${debt.person}`}>
      <p className="muted">الباقي {money(left)}</p>
      <input className="input" inputMode="decimal" autoFocus placeholder="المبلغ المسدد" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <div className="grid2" style={{ marginTop: 10 }}>
        <button className="btn green" onClick={async () => { await db.debts.update(debt.id!, { paid: debt.amount }); onClose(); }}>سددت الكل ✓</button>
        <button className="btn primary" disabled={!Number(amount)} onClick={async () => {
          await db.debts.update(debt.id!, { paid: Math.min(debt.amount, debt.paid + Number(amount)) }); onClose();
        }}>سجّل الدفعة</button>
      </div>
      <button className="btn danger block" style={{ marginTop: 8 }} onClick={async () => { if (await ask("تحذف الدين؟")) { await db.debts.delete(debt.id!); onClose(); } }}>حذف</button>
    </Sheet>
  );
}

export function Money({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"expenses" | "debts">("expenses");
  const [addExp, setAddExp] = useState(false);
  const [addDebt, setAddDebt] = useState(false);
  const [paying, setPaying] = useState<Debt | null>(null);
  const month = todayISO().slice(0, 7);
  const expenses = useLiveQuery(() => db.expenses.where("date").startsWith(month).reverse().sortBy("date"), [month]);
  const debts = useLiveQuery(() => db.debts.toArray(), []);

  const total = (expenses ?? []).reduce((s, e) => s + e.amount, 0);
  const byCat = Object.entries((expenses ?? []).reduce<Record<string, number>>((m, e) => ((m[e.category] = (m[e.category] ?? 0) + e.amount), m), {}))
    .sort((a, b) => b[1] - a[1]);
  const max = byCat[0]?.[1] ?? 1;
  const open = (debts ?? []).filter((d) => d.paid < d.amount);
  const iOwe = open.filter((d) => d.direction === "i_owe").reduce((s, d) => s + d.amount - d.paid, 0);
  const owedToMe = open.filter((d) => d.direction === "owed_to_me").reduce((s, d) => s + d.amount - d.paid, 0);

  return (
    <>
      <BackHeader title="فلوسي" onBack={onBack} right={<button className="btn primary" onClick={() => (tab === "expenses" ? setAddExp(true) : setAddDebt(true))}>+ إضافة</button>} />
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`chip ${tab === "expenses" ? "on" : ""}`} onClick={() => setTab("expenses")}>💸 المصاريف</button>
        <button className={`chip ${tab === "debts" ? "on" : ""}`} onClick={() => setTab("debts")}>🤝 الديون</button>
      </div>

      {tab === "expenses" ? (
        <>
          <div className="stat" style={{ marginBottom: 12 }}><div className="l">مصاريف هالشهر</div><div className="v">{money(total)}</div></div>
          {byCat.length > 0 && (
            <div className="card">
              <h3>وين راحت الفلوس</h3>
              {byCat.map(([c, v]) => (
                <div className="hbar" key={c}><span>{c}</span><div className="track"><div style={{ width: `${(v / max) * 100}%` }} /></div><span>{money(v)}</span></div>
              ))}
            </div>
          )}
          <div className="card">
            <h3>السجل</h3>
            {expenses?.length === 0 && <div className="empty">ما سجلت مصاريف هالشهر. قل للمايك "صرفت 25 غدا" 🎙️</div>}
            {(expenses ?? []).map((e) => (
              <div className="list-item" key={e.id}>
                <div className="grow">{e.note || e.category}<div className="muted small">{e.category} · {shortDate(e.date)}</div></div>
                <b>{money(e.amount)}</b>
                <button className="btn danger" onClick={async () => (await ask("تحذف؟")) && db.expenses.delete(e.id!)}>✕</button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grid2" style={{ marginBottom: 12 }}>
            <div className="stat"><div className="l">علي</div><div className="v" style={{ color: "var(--danger)" }}>{money(iOwe)}</div></div>
            <div className="stat"><div className="l">لي</div><div className="v" style={{ color: "var(--accent-2)" }}>{money(owedToMe)}</div></div>
          </div>
          <div className="card">
            {debts?.length === 0 && <div className="empty">ما فيه ديون 👌</div>}
            {(debts ?? []).sort((a, b) => Number(a.paid >= a.amount) - Number(b.paid >= b.amount)).map((d) => {
              const settled = d.paid >= d.amount;
              return (
                <div className="list-item" key={d.id} onClick={() => setPaying(d)} style={{ cursor: "pointer", opacity: settled ? 0.5 : 1, display: "block" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span><span className={`chip ${d.direction === "i_owe" ? "red" : "green"}`}>{d.direction === "i_owe" ? "علي" : "لي"}</span> {d.person}</span>
                    <b>{settled ? "مسدد ✓" : money(d.amount - d.paid)}</b>
                  </div>
                  <div style={{ margin: "6px 0" }}><Progress value={d.paid / d.amount} /></div>
                  <div className="muted small">{money(d.paid)} من {money(d.amount)}{d.dueDate ? ` · الاستحقاق ${d.dueDate}` : ""}{d.note ? ` · ${d.note}` : ""}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <ExpenseEditor open={addExp} onClose={() => setAddExp(false)} />
      <DebtEditor open={addDebt} onClose={() => setAddDebt(false)} />
      <PayDebt key={paying?.id} debt={paying} onClose={() => setPaying(null)} />
    </>
  );
}
