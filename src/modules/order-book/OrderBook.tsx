import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Plus, RefreshCw, Save, Settings2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import { ErrorBanner, PageHeader } from "@/components/ui";

type OrderType = "sales" | "purchase";
type Party = { id: string; name: string; name_urdu?: string | null };
type Item = { id: string; name: string; name_urdu?: string | null; unit?: string | null };
type Employee = { id: string; name: string; name_urdu?: string | null };
type Header = { id: string; order_no: string; order_type: OrderType; party_id: string; salesperson_id?: string | null; order_date: string; status: string; notes?: string | null };
type Commitment = { id: string; order_id: string; item_id: string; ordered_qty: number | string; fulfilled_qty: number | string; cancelled_qty: number | string; rate_status: "pending" | "agreed" | "revised" | "closed"; agreed_rate: number | string | null; effective_date: string; source: string; remarks?: string | null };
type DraftLine = { item_id: string; qty: string; rate_status: "pending" | "agreed"; agreed_rate: string; effective_date: string; remarks: string };

const today = () => new Date().toISOString().slice(0, 10);
const emptyLine = (): DraftLine => ({ item_id: "", qty: "", rate_status: "pending", agreed_rate: "", effective_date: today(), remarks: "" });
const n = (value: unknown) => Number(value) || 0;

export default function OrderBook() {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.company_id ?? "";
  const [tab, setTab] = useState<OrderType>("sales");
  const [salesEnabled, setSalesEnabled] = useState(false);
  const [purchaseEnabled, setPurchaseEnabled] = useState(false);
  const [bilingual, setBilingual] = useState(true);
  const [customers, setCustomers] = useState<Party[]>([]);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [headers, setHeaders] = useState<Header[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [partyId, setPartyId] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError(null);
    const [settingsRes, customersRes, suppliersRes, itemsRes, employeesRes, headersRes, commitmentsRes] = await Promise.all([
      supabase.from("order_book_settings").select("*").eq("company_id", companyId).maybeSingle(),
      supabase.from("customers").select("id,name,name_urdu").eq("is_active", true).order("name"),
      supabase.from("suppliers").select("id,name,name_urdu").eq("is_active", true).order("name"),
      supabase.from("items").select("id,name,name_urdu,unit").order("name"),
      supabase.from("employees").select("id,name,name_urdu").eq("is_active", true).order("name"),
      supabase.from("order_book_headers").select("id,order_no,order_type,party_id,salesperson_id,order_date,status,notes").order("order_date", { ascending: false }).order("created_at", { ascending: false }).limit(2000),
      supabase.from("order_book_commitments").select("id,order_id,item_id,ordered_qty,fulfilled_qty,cancelled_qty,rate_status,agreed_rate,effective_date,source,remarks").order("created_at", { ascending: true }).limit(10000),
    ]);
    const firstError = [settingsRes, customersRes, suppliersRes, itemsRes, employeesRes, headersRes, commitmentsRes].find((result) => result.error)?.error;
    if (firstError) setError(firstError.message);
    const settings = settingsRes.data as any;
    setSalesEnabled(Boolean(settings?.sales_order_book_enabled));
    setPurchaseEnabled(Boolean(settings?.purchase_order_book_enabled));
    setBilingual(settings?.bilingual_labels !== false);
    setCustomers((customersRes.data ?? []) as Party[]);
    setSuppliers((suppliersRes.data ?? []) as Party[]);
    setItems((itemsRes.data ?? []) as Item[]);
    setEmployees((employeesRes.data ?? []) as Employee[]);
    setHeaders((headersRes.data ?? []) as Header[]);
    setCommitments((commitmentsRes.data ?? []) as Commitment[]);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPartyId(""); setSalespersonId(""); setLines([emptyLine()]); }, [tab]);

  const saveSettings = async (patch: Partial<{ sales_order_book_enabled: boolean; purchase_order_book_enabled: boolean; bilingual_labels: boolean }>) => {
    if (!companyId) return;
    setError(null);
    const payload = { company_id: companyId, sales_order_book_enabled: salesEnabled, purchase_order_book_enabled: purchaseEnabled, bilingual_labels: bilingual, updated_at: new Date().toISOString(), ...patch };
    const { error: saveError } = await supabase.from("order_book_settings").upsert(payload, { onConflict: "company_id" });
    if (saveError) { setError(saveError.message); return; }
    if (patch.sales_order_book_enabled !== undefined) setSalesEnabled(patch.sales_order_book_enabled);
    if (patch.purchase_order_book_enabled !== undefined) setPurchaseEnabled(patch.purchase_order_book_enabled);
    if (patch.bilingual_labels !== undefined) setBilingual(patch.bilingual_labels);
    setNotice("Order Book settings saved / آرڈر بک سیٹنگ محفوظ ہوگئی");
    setTimeout(() => setNotice(""), 2500);
  };

  const createOrder = async () => {
    setError(null); setNotice("");
    const validLines = lines.filter((line) => line.item_id && n(line.qty) > 0);
    if (!partyId) return setError(tab === "sales" ? "Select customer / گاہک منتخب کریں" : "Select supplier / سپلائر منتخب کریں");
    if (!validLines.length) return setError("Add at least one valid item and quantity / کم از کم ایک درست آئٹم اور مقدار شامل کریں");
    const invalidAgreed = validLines.find((line) => line.rate_status === "agreed" && line.agreed_rate.trim() === "");
    if (invalidAgreed) return setError("Agreed lines require a rate / طے شدہ لائن کیلئے ریٹ ضروری ہے");
    setSaving(true);
    try {
      const { data: orderNo, error: noError } = await supabase.rpc("next_order_book_no", { p_order_type: tab });
      if (noError) throw noError;
      const { data: header, error: headerError } = await supabase.from("order_book_headers").insert({
        company_id: companyId,
        order_no: String(orderNo),
        order_type: tab,
        party_id: partyId,
        salesperson_id: tab === "sales" ? (salespersonId || null) : null,
        order_date: orderDate,
        status: "confirmed",
        notes: notes.trim() || null,
      }).select("id").single();
      if (headerError) throw headerError;
      const { error: lineError } = await supabase.from("order_book_commitments").insert(validLines.map((line) => ({
        company_id: companyId,
        order_id: header.id,
        item_id: line.item_id,
        ordered_qty: n(line.qty),
        fulfilled_qty: 0,
        cancelled_qty: 0,
        rate_status: line.rate_status,
        agreed_rate: line.rate_status === "agreed" ? n(line.agreed_rate) : null,
        effective_date: line.effective_date || orderDate,
        source: "order",
        remarks: line.remarks.trim() || null,
      })));
      if (lineError) throw lineError;
      setPartyId(""); setSalespersonId(""); setNotes(""); setLines([emptyLine()]);
      setNotice(`${String(orderNo)} saved successfully / کامیابی سے محفوظ ہوگیا`);
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to save order.");
    } finally {
      setSaving(false);
    }
  };

  const partyMap = useMemo(() => new Map((tab === "sales" ? customers : suppliers).map((party) => [party.id, party])), [tab, customers, suppliers]);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const employeeMap = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const visibleHeaders = headers.filter((header) => header.order_type === tab);
  const enabled = tab === "sales" ? salesEnabled : purchaseEnabled;

  const toggleLabel = (value: boolean) => value ? "Active / فعال" : "Inactive / غیر فعال";
  const dualName = (record?: { name: string; name_urdu?: string | null }) => record ? `${record.name}${bilingual && record.name_urdu ? ` / ${record.name_urdu}` : ""}` : "—";

  return <div className="space-y-5 pb-10">
    <PageHeader title="Order Book & Rate Commitments / آرڈر بک اور ریٹ معاہدے" subtitle="Quantity, agreed/pending rates, fulfilment balance and complete commercial history — no GL posting until invoice posting." action={<button className="btn btn-secondary" onClick={() => void load()}><RefreshCw className="h-4 w-4"/>Refresh / تازہ کریں</button>} />
    {error && <ErrorBanner message={error} />}
    {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div>}

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 font-bold"><Settings2 className="h-4 w-4"/>Service Control / سروس کنٹرول</div>
      <div className="grid gap-3 md:grid-cols-3">
        <Toggle title="Sales Order Book / سیلز آرڈر بک" value={salesEnabled} onChange={(value) => void saveSettings({ sales_order_book_enabled: value })} label={toggleLabel(salesEnabled)} />
        <Toggle title="Purchase Order Book / پرچیز آرڈر بک" value={purchaseEnabled} onChange={(value) => void saveSettings({ purchase_order_book_enabled: value })} label={toggleLabel(purchaseEnabled)} />
        <Toggle title="English + Urdu / انگریزی + اردو" value={bilingual} onChange={(value) => void saveSettings({ bilingual_labels: value })} label={toggleLabel(bilingual)} />
      </div>
      <p className="mt-3 text-xs text-slate-500">Inactive keeps the existing direct invoice workflow unchanged. / غیر فعال ہونے پر موجودہ براہِ راست انوائس طریقہ جوں کا توں رہے گا۔</p>
    </section>

    <div className="flex gap-2 rounded-lg bg-slate-100 p-1">
      <button className={`flex-1 rounded-md px-4 py-2 text-sm font-bold ${tab === "sales" ? "bg-white shadow-sm text-blue-700" : "text-slate-600"}`} onClick={() => setTab("sales")}>Sales Orders / سیلز آرڈرز</button>
      <button className={`flex-1 rounded-md px-4 py-2 text-sm font-bold ${tab === "purchase" ? "bg-white shadow-sm text-blue-700" : "text-slate-600"}`} onClick={() => setTab("purchase")}>Purchase Orders / پرچیز آرڈرز</button>
    </div>

    {!enabled ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><b>{tab === "sales" ? "Sales Order Book" : "Purchase Order Book"}</b> is inactive for this company. Existing invoice workflow remains unchanged. / یہ سروس اس کمپنی کیلئے غیر فعال ہے۔</div> : <>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><BookOpen className="h-5 w-5 text-blue-600"/><div><h2 className="font-bold">New {tab === "sales" ? "Sales" : "Purchase"} Order / نیا آرڈر</h2><p className="text-xs text-slate-500">A pending-rate line is recorded without assuming any price. / زیرِ التوا ریٹ پر قیمت خود سے نہیں لگائی جائے گی۔</p></div></div>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label={tab === "sales" ? "Customer / گاہک" : "Supplier / سپلائر"}><select className="input w-full" value={partyId} onChange={(e) => setPartyId(e.target.value)}><option value="">— Select / منتخب کریں —</option>{(tab === "sales" ? customers : suppliers).map((party) => <option key={party.id} value={party.id}>{dualName(party)}</option>)}</select></Field>
          {tab === "sales" && <Field label="Salesperson / سیلز پرسن"><select className="input w-full" value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)}><option value="">— Optional / اختیاری —</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{dualName(employee)}</option>)}</select></Field>}
          <Field label="Order Date / آرڈر تاریخ"><input type="date" className="input w-full" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></Field>
          <Field label="Notes / نوٹس"><input className="input w-full" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional / اختیاری" /></Field>
        </div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead><tr className="border-b bg-slate-50 text-slate-600"><th className="p-2 text-left">Item / آئٹم</th><th className="p-2 text-right">Qty / مقدار</th><th className="p-2 text-left">Rate Status / ریٹ حالت</th><th className="p-2 text-right">Agreed Rate / طے شدہ ریٹ</th><th className="p-2 text-left">Effective Date / مؤثر تاریخ</th><th className="p-2 text-left">Remarks / تفصیل</th><th className="w-20"/></tr></thead><tbody>{lines.map((line, index) => <tr key={index} className="border-b align-top"><td className="p-2"><select className="input" value={line.item_id} onChange={(e) => setLines((current) => current.map((row, i) => i === index ? { ...row, item_id: e.target.value } : row))}><option value="">— Select item —</option>{items.map((item) => <option key={item.id} value={item.id}>{dualName(item)}{item.unit ? ` (${item.unit})` : ""}</option>)}</select></td><td className="p-2"><input type="number" min="0" step="0.001" className="input text-right" value={line.qty} onChange={(e) => setLines((current) => current.map((row, i) => i === index ? { ...row, qty: e.target.value } : row))}/></td><td className="p-2"><select className="input" value={line.rate_status} onChange={(e) => setLines((current) => current.map((row, i) => i === index ? { ...row, rate_status: e.target.value as DraftLine["rate_status"], agreed_rate: e.target.value === "pending" ? "" : row.agreed_rate } : row))}><option value="pending">Rate Pending / ریٹ زیرِ التوا</option><option value="agreed">Agreed / طے شدہ</option></select></td><td className="p-2"><input type="number" min="0" step="0.01" className="input text-right" disabled={line.rate_status === "pending"} value={line.agreed_rate} onChange={(e) => setLines((current) => current.map((row, i) => i === index ? { ...row, agreed_rate: e.target.value } : row))} placeholder={line.rate_status === "pending" ? "Pending" : "0.00"}/></td><td className="p-2"><input type="date" className="input" value={line.effective_date} onChange={(e) => setLines((current) => current.map((row, i) => i === index ? { ...row, effective_date: e.target.value } : row))}/></td><td className="p-2"><input className="input" value={line.remarks} onChange={(e) => setLines((current) => current.map((row, i) => i === index ? { ...row, remarks: e.target.value } : row))}/></td><td className="p-2 text-right">{lines.length > 1 && <button type="button" className="text-rose-600" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>Remove</button>}</td></tr>)}</tbody></table></div>
        <div className="mt-4 flex flex-wrap justify-between gap-2"><button type="button" className="btn btn-secondary" onClick={() => setLines((current) => [...current, emptyLine()])}><Plus className="h-4 w-4"/>Add Line / لائن شامل کریں</button><button type="button" className="btn btn-primary" disabled={saving} onClick={() => void createOrder()}><Save className="h-4 w-4"/>{saving ? "Saving…" : "Save Order / آرڈر محفوظ کریں"}</button></div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="font-bold">Order Register / آرڈر رجسٹر</h2><p className="text-xs text-slate-500">Agreed, pending, fulfilled and remaining quantity stays visible as history.</p></div>{loading ? <div className="p-10 text-center text-slate-400">Loading… / لوڈ ہو رہا ہے…</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-sm"><thead><tr className="bg-slate-50 text-slate-600"><th className="p-2 text-left">Order</th><th className="p-2 text-left">Party / پارٹی</th>{tab === "sales" && <th className="p-2 text-left">Salesperson</th>}<th className="p-2 text-left">Date</th><th className="p-2 text-left">Item</th><th className="p-2 text-right">Ordered</th><th className="p-2 text-right">Fulfilled</th><th className="p-2 text-right">Balance</th><th className="p-2 text-right">Rate</th><th className="p-2 text-left">Rate Status</th><th className="p-2 text-left">Effective</th></tr></thead><tbody>{visibleHeaders.flatMap((header) => { const rows = commitments.filter((commitment) => commitment.order_id === header.id); return rows.map((commitment) => { const item = itemMap.get(commitment.item_id); const balance = Math.max(0, n(commitment.ordered_qty) - n(commitment.fulfilled_qty) - n(commitment.cancelled_qty)); return <tr key={commitment.id} className="border-t"><td className="p-2 font-bold">{header.order_no}</td><td className="p-2">{dualName(partyMap.get(header.party_id))}</td>{tab === "sales" && <td className="p-2">{dualName(employeeMap.get(header.salesperson_id || ""))}</td>}<td className="p-2">{header.order_date}</td><td className="p-2">{dualName(item)}</td><td className="p-2 text-right">{n(commitment.ordered_qty).toLocaleString()}</td><td className="p-2 text-right">{n(commitment.fulfilled_qty).toLocaleString()}</td><td className="p-2 text-right font-bold">{balance.toLocaleString()}</td><td className="p-2 text-right">{commitment.agreed_rate == null ? "—" : n(commitment.agreed_rate).toLocaleString()}</td><td className="p-2">{commitment.rate_status === "pending" ? "Rate Pending / ریٹ زیرِ التوا" : `${commitment.rate_status} / طے شدہ`}</td><td className="p-2">{commitment.effective_date}</td></tr>; }); })}{visibleHeaders.length === 0 && <tr><td className="p-10 text-center text-slate-400" colSpan={11}>No orders yet / ابھی کوئی آرڈر نہیں</td></tr>}</tbody></table></div>}</section>
    </>}
  </div>;
}

function Toggle({ title, value, onChange, label }: { title: string; value: boolean; onChange: (value: boolean) => void; label: string }) { return <div className="rounded-lg border border-slate-200 p-3"><div className="text-sm font-bold">{title}</div><div className="mt-2 flex items-center justify-between gap-3"><span className={`text-xs font-bold ${value ? "text-emerald-700" : "text-slate-500"}`}>{label}</span><button type="button" aria-pressed={value} onClick={() => onChange(!value)} className={`relative h-6 w-11 rounded-full transition ${value ? "bg-emerald-500" : "bg-slate-300"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${value ? "left-6" : "left-1"}`}/></button></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-1 block text-xs font-bold text-slate-600">{label}</label>{children}</div>; }
