import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { ErrorBanner, PageHeader, formatCurrency } from "@/components/ui";
import { buildChargePayload, createEmptyCharges, type ChargeValues } from "@/lib/chargeTypes";
import { calculateConfiguredChargeAmount, type ConfiguredChargeUnit } from "@/lib/chargeCalculation";

type Supplier = { id: string; name: string; name_urdu?: string | null };
type Item = { id: string; name: string; name_urdu?: string | null; sku?: string | null; cost?: number | string | null; unit?: string | null };
type Godown = { id: string; name: string; name_urdu?: string | null };
type PurchaseLine = { item_id: string; description: string; godown_id: string; qty: string; unit_cost: string; tax_percent: string };
type ConsolidatedOption = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  supplier_id: string;
  supplier_name: string;
  reference_name?: string | null;
  reference_no: string | null;
  total: number | string;
  linked_purchase_order_id: string | null;
  invoice_type: "Purchase Invoice" | "Tax Invoice";
};
type ConfiguredCharge = {
  charge_key: string;
  charge_name: string;
  default_rate: number | string;
  is_fixed: boolean;
  tax_applicable: boolean;
  purchase_treatment?: "landed_cost" | "expense" | null;
  unit: ConfiguredChargeUnit;
  cost_account_id?: string | null;
};
type SupplierSnapshot = {
  currentOutstanding: number;
  lastPaymentDate: string | null;
  lastPaymentAmount: number;
  paidToday: number;
};

const emptyLine = (tax = "0", godown = ""): PurchaseLine => ({ item_id: "", description: "", godown_id: godown, qty: "1", unit_cost: "0", tax_percent: tax });
const treatmentOf = (charge: ConfiguredCharge) => charge.purchase_treatment || "landed_cost";
const unitLabel = (unit: ConfiguredChargeUnit) => ({ fixed: "Fixed", percent: "%", per_kg: "per kg", per_ton: "per ton", per_piece: "per piece" }[unit] || unit);

export default function MainPurchaseInvoiceV2() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [configuredCharges, setConfiguredCharges] = useState<ConfiguredCharge[]>([]);
  const [selectedChargeKeys, setSelectedChargeKeys] = useState<string[]>([]);
  const [chargeToAdd, setChargeToAdd] = useState("");
  const [charges, setCharges] = useState<ChargeValues>(createEmptyCharges());
  const [orderNo, setOrderNo] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceType, setInvoiceType] = useState<"Purchase Invoice" | "Tax Invoice">("Purchase Invoice");
  const [globalTaxPercent, setGlobalTaxPercent] = useState("0");
  const [taxConfigured, setTaxConfigured] = useState(false);
  const [rows, setRows] = useState<PurchaseLine[]>([emptyLine()]);
  const [allConsolidated, setAllConsolidated] = useState<ConsolidatedOption[]>([]);
  const [selectedConsolidatedIds, setSelectedConsolidatedIds] = useState<string[]>([]);
  const [consolidatedSearch, setConsolidatedSearch] = useState("");
  const [supplierSnapshot, setSupplierSnapshot] = useState<SupplierSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [supplierRes, itemRes, godownRes, orderNoRes, taxRes, chargeRes, consolidatedRes] = await Promise.all([
        supabase.from("suppliers").select("id,name,name_urdu").eq("is_active", true).order("name"),
        supabase.from("items").select("id,name,name_urdu,sku,cost,unit").order("name"),
        supabase.from("godowns").select("id,name,name_urdu").order("name"),
        supabase.rpc("next_purchase_order_no"),
        supabase.from("tax_rates").select("rate,is_fixed").eq("is_active", true).eq("is_fixed", true).in("applies_to", ["purchase", "both"]).order("created_at").limit(1).maybeSingle(),
        supabase.from("charge_master").select("charge_key,charge_name,default_rate,is_fixed,tax_applicable,purchase_treatment,unit,cost_account_id").eq("is_active", true).in("applies_to", ["purchase", "both"]).order("charge_name"),
        supabase.rpc("get_available_consolidated_purchase_invoices_v2", { p_supplier_id: null, p_order_id: null }),
      ]);
      const firstError = supplierRes.error || itemRes.error || godownRes.error || orderNoRes.error || taxRes.error || chargeRes.error || consolidatedRes.error;
      if (firstError) throw firstError;

      const loadedGodowns = (godownRes.data ?? []) as Godown[];
      const loadedCharges = (chargeRes.data ?? []) as ConfiguredCharge[];
      setSuppliers((supplierRes.data ?? []) as Supplier[]);
      setItems((itemRes.data ?? []) as Item[]);
      setGodowns(loadedGodowns);
      setOrderNo(String(orderNoRes.data ?? ""));
      setAllConsolidated((consolidatedRes.data ?? []) as ConsolidatedOption[]);

      const tax = taxRes.data ? String(Number(taxRes.data.rate) || 0) : "0";
      setGlobalTaxPercent(tax);
      setTaxConfigured(Boolean(taxRes.data));
      setRows([emptyLine(tax, loadedGodowns[0]?.id ?? "")]);

      setConfiguredCharges(loadedCharges);
      const autoKeys = loadedCharges.filter((charge) => charge.is_fixed && Number(charge.default_rate) > 0).map((charge) => charge.charge_key);
      setSelectedChargeKeys(autoKeys);
      const next = createEmptyCharges();
      loadedCharges.forEach((charge) => {
        next[charge.charge_key] = autoKeys.includes(charge.charge_key) ? String(Number(charge.default_rate) || 0) : "0";
      });
      setCharges(next);
    } catch (e: any) {
      setError(e?.message || "Failed to load purchase form.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBase(); }, [loadBase]);

  useEffect(() => {
    const loadSnapshot = async () => {
      if (!supplierId) { setSupplierSnapshot(null); return; }
      setSnapshotLoading(true);
      const [ordersRes, paymentsRes] = await Promise.all([
        supabase.from("purchase_orders").select("id,order_date,total,paid_amount,outstanding_amount,status").eq("supplier_id", supplierId).eq("status", "posted"),
        supabase.from("purchase_payment_allocations").select("allocation_date,amount,created_at").eq("supplier_id", supplierId).order("allocation_date", { ascending: false }).order("created_at", { ascending: false }),
      ]);
      setSnapshotLoading(false);
      if (ordersRes.error || paymentsRes.error) return;
      const orders = ordersRes.data ?? [];
      const payments = paymentsRes.data ?? [];
      const today = new Date().toISOString().slice(0, 10);
      setSupplierSnapshot({
        currentOutstanding: orders.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.outstanding_amount) || 0), 0),
        lastPaymentDate: payments[0]?.allocation_date ? String(payments[0].allocation_date) : null,
        lastPaymentAmount: Number(payments[0]?.amount) || 0,
        paidToday: payments.reduce((sum: number, row: any) => String(row.allocation_date).slice(0, 10) === today ? sum + (Number(row.amount) || 0) : sum, 0),
      });
    };
    void loadSnapshot();
  }, [supplierId]);

  const selectedCharges = useMemo(() => configuredCharges.filter((charge) => selectedChargeKeys.includes(charge.charge_key)), [configuredCharges, selectedChargeKeys]);
  const availableCharges = useMemo(() => configuredCharges.filter((charge) => !selectedChargeKeys.includes(charge.charge_key)), [configuredCharges, selectedChargeKeys]);
  const consolidated = useMemo(() => allConsolidated.filter((invoice) => (!supplierId || invoice.supplier_id === supplierId) && invoice.invoice_type === invoiceType), [allConsolidated, supplierId, invoiceType]);
  const visibleConsolidated = useMemo(() => {
    const q = consolidatedSearch.trim().toLowerCase();
    if (!q) return consolidated;
    return consolidated.filter((invoice) => [invoice.invoice_no, invoice.reference_name, invoice.reference_no, invoice.supplier_name, invoice.invoice_date].some((value) => String(value ?? "").toLowerCase().includes(q)));
  }, [consolidated, consolidatedSearch]);
  const directSubtotal = rows.reduce((sum, row) => sum + (Number(row.qty) || 0) * (Number(row.unit_cost) || 0), 0);

  useEffect(() => {
    if (!selectedChargeKeys.length) return;
    setCharges((current) => {
      const next = { ...current };
      selectedChargeKeys.forEach((key) => {
        const charge = configuredCharges.find((candidate) => candidate.charge_key === key);
        if (!charge) return;
        next[key] = String(calculateConfiguredChargeAmount({ unit: charge.unit, rate: Number(charge.default_rate) || 0, rows, items, baseAmount: directSubtotal }));
      });
      return next;
    });
  }, [selectedChargeKeys, configuredCharges, rows, items, directSubtotal]);

  useEffect(() => {
    setSelectedConsolidatedIds((current) => current.filter((id) => consolidated.some((invoice) => invoice.id === id)));
  }, [supplierId, invoiceType, consolidated]);

  const directItemTax = invoiceType === "Tax Invoice" ? rows.reduce((sum, row) => {
    const base = (Number(row.qty) || 0) * (Number(row.unit_cost) || 0);
    return sum + base * (Number(row.tax_percent) || 0) / 100;
  }, 0) : 0;
  const directCharges = selectedCharges.reduce((sum, charge) => sum + (Number(charges[charge.charge_key]) || 0), 0);
  const directChargeTax = invoiceType === "Tax Invoice" ? selectedCharges.reduce((sum, charge) => charge.tax_applicable ? sum + (Number(charges[charge.charge_key]) || 0) * (Number(globalTaxPercent) || 0) / 100 : sum, 0) : 0;
  const landedCharges = selectedCharges.reduce((sum, charge) => treatmentOf(charge) === "landed_cost" ? sum + (Number(charges[charge.charge_key]) || 0) : sum, 0);
  const expenseCharges = selectedCharges.reduce((sum, charge) => treatmentOf(charge) === "expense" ? sum + (Number(charges[charge.charge_key]) || 0) : sum, 0);
  const selectedConsolidated = allConsolidated.filter((invoice) => selectedConsolidatedIds.includes(invoice.id));
  const consolidatedTotal = selectedConsolidated.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const grandTotal = directSubtotal + directItemTax + directCharges + directChargeTax + consolidatedTotal;
  const projectedSupplierBalance = (supplierSnapshot?.currentOutstanding || 0) + grandTotal;

  const updateLine = (index: number, field: keyof PurchaseLine, value: string) => {
    setRows((current) => current.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, [field]: value };
      if (field === "item_id") {
        const item = items.find((candidate) => candidate.id === value);
        if (item) next.unit_cost = String(Number(item.cost) || 0);
      }
      return next;
    }));
  };

  const addCharge = () => {
    if (!chargeToAdd) return;
    const charge = configuredCharges.find((candidate) => candidate.charge_key === chargeToAdd);
    if (!charge) return;
    const amount = calculateConfiguredChargeAmount({ unit: charge.unit, rate: Number(charge.default_rate) || 0, rows, items, baseAmount: directSubtotal });
    setSelectedChargeKeys((current) => current.includes(charge.charge_key) ? current : [...current, charge.charge_key]);
    setCharges((current) => ({ ...current, [charge.charge_key]: String(amount) }));
    setChargeToAdd("");
  };

  const removeCharge = (key: string) => {
    setSelectedChargeKeys((current) => current.filter((value) => value !== key));
    setCharges((current) => ({ ...current, [key]: "0" }));
  };

  const toggleConsolidated = (invoice: ConsolidatedOption, checked: boolean) => {
    setError(null);
    if (checked) {
      if (!supplierId) setSupplierId(invoice.supplier_id);
      if (supplierId && supplierId !== invoice.supplier_id) {
        setError("Main Purchase Invoice aur Consolidated Purchase ka supplier same hona chahiye.");
        return;
      }
      setSelectedConsolidatedIds((current) => current.includes(invoice.id) ? current : [...current, invoice.id]);
    } else {
      setSelectedConsolidatedIds((current) => current.filter((id) => id !== invoice.id));
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    let createdOrderId: string | null = null;
    try {
      if (!supplierId) throw new Error("Please select a supplier or select a Consolidated Purchase Invoice.");
      if (invoiceType === "Tax Invoice" && !taxConfigured) throw new Error("Add and fix an active Purchase/Both tax rate in Tax Settings before creating a Tax Invoice.");
      const validRows = rows.filter((row) => row.item_id && Number(row.qty) > 0);
      if (!validRows.length && !selectedConsolidatedIds.length) throw new Error("Add at least one direct item or select a Consolidated Purchase Invoice.");
      if (validRows.some((row) => !row.godown_id)) throw new Error("Select a destination godown for every direct item.");

      const selectedDocs = allConsolidated.filter((invoice) => selectedConsolidatedIds.includes(invoice.id));
      if (selectedDocs.some((invoice) => invoice.supplier_id !== supplierId)) throw new Error("Selected Consolidated Purchase Invoice belongs to another supplier.");
      if (selectedDocs.some((invoice) => invoice.invoice_type !== invoiceType)) throw new Error("Main and Consolidated Purchase invoice tax type must match.");

      const { data: order, error: orderError } = await supabase.from("purchase_orders").insert({
        order_no: orderNo,
        supplier_id: supplierId,
        order_date: orderDate,
        status: "draft",
        invoice_type: invoiceType,
        tax_percent: invoiceType === "Tax Invoice" ? Number(globalTaxPercent) || 0 : 0,
        total: grandTotal,
        ...buildChargePayload(charges),
      }).select().single();
      if (orderError) throw orderError;
      createdOrderId = order.id;

      if (validRows.length) {
        const { error: lineError } = await supabase.from("purchase_order_lines").insert(validRows.map((row) => ({
          order_id: order.id,
          item_id: row.item_id,
          godown_id: row.godown_id,
          qty: Number(row.qty) || 0,
          unit_cost: Number(row.unit_cost) || 0,
          tax_percent: invoiceType === "Tax Invoice" ? Number(row.tax_percent) || 0 : 0,
          description: row.description.trim() || null,
          line_total: (Number(row.qty) || 0) * (Number(row.unit_cost) || 0),
        })));
        if (lineError) throw lineError;
      }

      const chargeRows = selectedCharges.map((charge) => ({
        order_id: order.id,
        charge_key: charge.charge_key,
        charge_label: charge.charge_name,
        amount: Number(charges[charge.charge_key]) || 0,
        tax_percent: invoiceType === "Tax Invoice" && charge.tax_applicable ? Number(globalTaxPercent) || 0 : 0,
        treatment: treatmentOf(charge),
        cost_account_id: charge.cost_account_id || null,
        rate: Number(charge.default_rate) || 0,
      })).filter((charge) => charge.amount > 0);
      if (chargeRows.length) {
        const { error: chargeError } = await supabase.from("purchase_order_charges").insert(chargeRows);
        if (chargeError) throw chargeError;
      }

      const { error: linkError } = await supabase.rpc("replace_purchase_order_consolidated_invoices", { p_order_id: order.id, p_consolidated_invoice_ids: selectedConsolidatedIds });
      if (linkError) throw linkError;
      navigate(`/purchase/${order.id}`);
    } catch (e: any) {
      if (createdOrderId) await supabase.from("purchase_orders").delete().eq("id", createdOrderId).eq("status", "draft");
      setError(e?.message || "Failed to save Main Purchase Invoice.");
    } finally {
      setSaving(false);
    }
  };

  return <div>
    <Link to="/purchase" className="mb-4 inline-block text-sm text-primary-600 hover:text-primary-700">← Back to Purchase</Link>
    <PageHeader title="Main Purchase Invoice / مین خریداری انوائس" subtitle="Supplier, consolidated documents, financial position, items, charges and review" />
    {error && <ErrorBanner message={error} />}

    <form onSubmit={handleSave} className="space-y-4">
      <section className="card p-5">
        <div className="mb-4"><h3 className="font-semibold text-slate-900">Invoice Information / انوائس معلومات</h3><p className="mt-1 text-xs text-slate-500">Supplier, invoice type and tax details</p></div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div><label className="label">Invoice Type / انوائس قسم</label><select className="input" value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as "Purchase Invoice" | "Tax Invoice")}><option value="Purchase Invoice">Without Tax / بغیر ٹیکس</option><option value="Tax Invoice">With Tax / ٹیکس کے ساتھ</option></select></div>
          <div><label className="label">Invoice No. / انوائس نمبر</label><input className="input cursor-not-allowed bg-slate-50" readOnly value={orderNo} /></div>
          <div><label className="label">Invoice Date / تاریخ</label><input className="input" type="date" required value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
          <div><label className="label">Supplier / سپلائر</label><select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">— Select supplier —</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.name_urdu ? ` / ${supplier.name_urdu}` : ""}</option>)}</select></div>
        </div>
        {invoiceType === "Tax Invoice" && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3"><span className="text-sm font-medium text-blue-800">Configured VAT / مقررہ ویٹ</span><span className="rounded-md bg-white px-3 py-1 text-sm font-bold text-blue-800">{globalTaxPercent}%</span><span className="text-xs text-blue-600">Locked from Tax Settings</span></div>}
      </section>

      <section className="rounded-xl border border-blue-300 bg-blue-50/40 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-blue-950">Select Consolidated Purchase / کنسولیڈیٹڈ خریداری منتخب کریں</h3><p className="mt-1 text-xs text-blue-700">Select one or more posted Consolidated Purchase invoices to add into this Main Purchase Invoice. Stock is not received twice.</p></div><Link to="/purchase/consolidated" className="btn-secondary text-sm">Open Consolidated Purchase</Link></div>
        <label className="label">Search Consolidated Invoice / تلاش کریں</label>
        <input className="input mb-3" placeholder="Type Invoice No., Reference or Supplier..." value={consolidatedSearch} onChange={(e) => setConsolidatedSearch(e.target.value)} />
        {loading ? <div className="rounded-lg border bg-white p-4 text-center text-sm text-slate-400">Loading…</div> : visibleConsolidated.length === 0 ? <div className="rounded-lg border bg-white p-4 text-center text-sm text-slate-500">{supplierId ? "No posted unused Consolidated Purchase invoices available for this supplier and invoice type." : "No posted unused Consolidated Purchase invoices available for this invoice type."}</div> : <div className="max-h-64 space-y-2 overflow-y-auto">{visibleConsolidated.map((invoice) => <label key={invoice.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-blue-100 bg-white p-3 hover:bg-blue-50"><span className="flex items-center gap-3"><input type="checkbox" checked={selectedConsolidatedIds.includes(invoice.id)} onChange={(e) => toggleConsolidated(invoice, e.target.checked)} /><span><span className="font-medium">{invoice.invoice_no}</span><span className="ml-2 text-xs text-slate-500">{invoice.invoice_date}{invoice.reference_no ? ` · ${invoice.reference_no}` : ""}</span>{!supplierId && <span className="ml-2 text-xs font-semibold text-blue-700">{invoice.supplier_name}</span>}</span></span><span className="font-semibold">{formatCurrency(Number(invoice.total) || 0)}</span></label>)}</div>}
        <div className="mt-3 grid gap-2 md:grid-cols-2"><div className="rounded-lg bg-white px-4 py-3"><div className="text-xs font-semibold uppercase text-slate-500">Selected Invoices / منتخب انوائس</div><div className="mt-1 font-bold">{selectedConsolidatedIds.length}</div></div><div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-right"><div className="text-xs font-semibold uppercase text-blue-600">Selected Consolidated Total / کل</div><div className="mt-1 font-bold text-blue-700">{formatCurrency(consolidatedTotal)}</div></div></div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b px-4 py-3"><h3 className="font-semibold text-slate-900">Supplier Financial Position / سپلائر مالی پوزیشن</h3><p className="mt-1 text-xs text-slate-500">Outstanding balance, latest payment and projected balance</p></div>
        <div className="grid grid-cols-1 md:grid-cols-5">
          <div className="border-r p-4"><div className="text-xs font-semibold uppercase text-slate-500">Current AP Balance / موجودہ بقایا</div><div className="mt-1 font-bold text-amber-700">{snapshotLoading ? "…" : formatCurrency(supplierSnapshot?.currentOutstanding || 0)}</div></div>
          <div className="border-r p-4"><div className="text-xs font-semibold uppercase text-slate-500">Last Payment / آخری ادائیگی</div><div className="mt-1 font-bold text-emerald-700">{snapshotLoading ? "…" : formatCurrency(supplierSnapshot?.lastPaymentAmount || 0)}</div><div className="mt-1 text-xs text-slate-500">{supplierSnapshot?.lastPaymentDate || "No payment / کوئی ادائیگی نہیں"}</div></div>
          <div className="border-r p-4"><div className="text-xs font-semibold uppercase text-slate-500">Paid Today / آج ادائیگی</div><div className="mt-1 font-bold text-blue-700">{snapshotLoading ? "…" : formatCurrency(supplierSnapshot?.paidToday || 0)}</div></div>
          <div className="border-r p-4"><div className="text-xs font-semibold uppercase text-slate-500">Invoice Balance / انوائس بقایا</div><div className="mt-1 font-bold">{formatCurrency(grandTotal)}</div></div>
          <div className="p-4"><div className="text-xs font-semibold uppercase text-slate-500">Projected Balance / متوقع بقایا</div><div className="mt-1 font-bold text-rose-700">{formatCurrency(projectedSupplierBalance)}</div></div>
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Purchase Items / خریداری آئٹمز</h3><p className="mt-1 text-xs text-slate-500">Direct items only. Consolidated items remain linked separately.</p></div><button type="button" className="btn-secondary text-sm" onClick={() => setRows((current) => [...current, emptyLine(invoiceType === "Tax Invoice" ? globalTaxPercent : "0", godowns[0]?.id ?? "")])}>+ Add Row</button></div>
        <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-slate-50"><tr><th className="p-2 text-left">Item / آئٹم</th><th className="p-2 text-left">Godown / گودام</th><th className="p-2 text-right">Qty / مقدار</th><th className="p-2 text-left">UOM / پیمائش اکائی</th><th className="p-2 text-right">Unit Cost</th>{invoiceType === "Tax Invoice" && <th className="p-2 text-right">VAT</th>}<th className="p-2 text-right">Line Total</th><th className="p-2" /></tr></thead><tbody>{rows.map((row, index) => { const item = items.find((candidate) => candidate.id === row.item_id); const base = (Number(row.qty) || 0) * (Number(row.unit_cost) || 0); const vat = invoiceType === "Tax Invoice" ? base * (Number(row.tax_percent) || 0) / 100 : 0; return <tr key={index} className="border-t border-slate-100 align-top"><td className="p-2"><select className="input w-full" value={row.item_id} onChange={(e) => updateLine(index, "item_id", e.target.value)}><option value="">— Select item —</option>{items.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.sku ? ` (${candidate.sku})` : ""}</option>)}</select><input className="input mt-1 w-full" placeholder="Optional description / اختیاری تفصیل" value={row.description} onChange={(e) => updateLine(index, "description", e.target.value)} /></td><td className="p-2"><select className="input w-full" value={row.godown_id} onChange={(e) => updateLine(index, "godown_id", e.target.value)}><option value="">— Select —</option>{godowns.map((godown) => <option key={godown.id} value={godown.id}>{godown.name}{godown.name_urdu ? ` / ${godown.name_urdu}` : ""}</option>)}</select></td><td className="p-2"><input className="input w-full text-right" type="number" min="0.001" step="0.001" value={row.qty} onChange={(e) => updateLine(index, "qty", e.target.value)} /></td><td className="p-2"><div className="input bg-slate-50">{item?.unit || "—"}</div></td><td className="p-2"><input className="input w-full text-right" type="number" min="0" step="0.01" value={row.unit_cost} onChange={(e) => updateLine(index, "unit_cost", e.target.value)} /></td>{invoiceType === "Tax Invoice" && <td className="p-2 text-right">{globalTaxPercent}%</td>}<td className="p-2 text-right font-semibold whitespace-nowrap">{formatCurrency(base + vat)}</td><td className="p-2 text-center">{rows.length > 1 && <button type="button" className="text-rose-600" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>Remove</button>}</td></tr>; })}</tbody></table></div>
        <div className="mt-3 flex justify-end"><div className="rounded-lg bg-slate-50 px-4 py-2 text-right"><div className="text-xs text-slate-500">Direct Items Total</div><div className="font-bold">{formatCurrency(directSubtotal + directItemTax)}</div></div></div>
      </section>

      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Applicable Charges / قابل اطلاق چارجز</h3><p className="mt-1 text-xs text-slate-500">Purchase/Both charges come from Charge Master. Per-kg / per-ton / per-piece charges recalculate automatically.</p></div><Link to="/sales/charges" className="btn-secondary text-sm">Charge Master</Link></div>
        {configuredCharges.length === 0 ? <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">No active Purchase/Both charges are configured. Add a charge in Charge Master with Applies To = Purchase or Both.</div> : <><div className="flex flex-wrap gap-2"><select className="input max-w-sm" value={chargeToAdd} onChange={(e) => setChargeToAdd(e.target.value)}><option value="">— Select charge to add —</option>{availableCharges.map((charge) => <option key={charge.charge_key} value={charge.charge_key}>{charge.charge_name}</option>)}</select><button type="button" className="btn-secondary" onClick={addCharge} disabled={!chargeToAdd}>+ Add Charge</button></div>{selectedCharges.length === 0 ? <div className="mt-4 rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-400">No purchase charges selected.</div> : <div className="mt-4 space-y-2">{selectedCharges.map((charge) => <div key={charge.charge_key} className="grid grid-cols-1 items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 md:grid-cols-[1fr_180px_160px_115px_auto]"><div><div className="font-medium">{charge.charge_name}</div><div className="text-xs text-slate-500">Rate {Number(charge.default_rate || 0).toLocaleString()} {unitLabel(charge.unit)}{charge.is_fixed ? " · Locked" : ""}</div></div><input className="input text-right" type="number" min="0" step="0.01" disabled={charge.is_fixed || charge.unit !== "fixed"} value={charges[charge.charge_key] ?? "0"} onChange={(e) => setCharges((current) => ({ ...current, [charge.charge_key]: e.target.value }))}/><span className="text-xs text-slate-600">{treatmentOf(charge) === "landed_cost" ? "Landed Cost / Inventory" : "Expense"}</span><span className="text-xs text-slate-600">{charge.tax_applicable ? "Taxable" : "Non-taxable"}</span><button type="button" className="text-sm text-rose-600 disabled:text-slate-300" disabled={charge.is_fixed && Number(charge.default_rate) > 0} onClick={() => removeCharge(charge.charge_key)}>Remove</button></div>)}</div>}</>}
      </section>

      <section className="card p-5"><div className="grid gap-5 lg:grid-cols-[1fr_420px]"><div><h3 className="font-semibold text-slate-900">Review & Save / جائزہ اور محفوظ کریں</h3><p className="mt-1 text-sm text-slate-500">Saving creates a Draft Purchase Invoice. Direct stock and accounting post only from the invoice detail workflow; linked Consolidated stock is never received twice.</p></div><div className="rounded-xl bg-slate-50 p-4 text-sm"><div className="flex justify-between py-1"><span>Direct Items</span><span>{formatCurrency(directSubtotal)}</span></div>{invoiceType === "Tax Invoice" && <div className="flex justify-between py-1"><span>Items VAT</span><span>{formatCurrency(directItemTax)}</span></div>}<div className="flex justify-between py-1"><span>Landed Cost Charges</span><span>{formatCurrency(landedCharges)}</span></div><div className="flex justify-between py-1"><span>Expense Charges</span><span>{formatCurrency(expenseCharges)}</span></div>{invoiceType === "Tax Invoice" && <div className="flex justify-between py-1"><span>Charge VAT</span><span>{formatCurrency(directChargeTax)}</span></div>}<div className="flex justify-between py-1"><span>Linked Consolidated</span><span>{formatCurrency(consolidatedTotal)}</span></div><div className="mt-2 flex justify-between border-t border-slate-200 pt-3 text-lg font-bold"><span>Grand Total / مجموعی کل</span><span>{formatCurrency(grandTotal)}</span></div></div></div><div className="mt-5 flex justify-end"><button className="btn-primary" disabled={saving || loading}>{saving ? "Saving..." : "Save Draft Purchase Invoice"}</button></div></section>
    </form>
  </div>;
}
