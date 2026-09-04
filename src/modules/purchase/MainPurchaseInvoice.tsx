import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { ErrorBanner, PageHeader, formatCurrency } from "@/components/ui";
import {
  buildChargePayload,
  calculateChargeTotalForContext,
  createEmptyCharges,
  getChargesForContext,
  type ChargeValues,
} from "@/lib/chargeTypes";

type Supplier = { id: string; name: string };
type Item = { id: string; name: string; sku?: string | null; cost?: number | string | null };
type Godown = { id: string; name: string };
type PurchaseLine = { item_id: string; godown_id: string; qty: string; unit_cost: string; tax_percent: string };
type ConsolidatedOption = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  reference_name: string | null;
  reference_no: string | null;
  subtotal: number | string;
  item_tax: number | string;
  charges_total: number | string;
  charge_tax: number | string;
  total: number | string;
  linked_purchase_order_id: string | null;
};
type ConfiguredCharge = { charge_key: string; charge_name: string; default_rate: number; is_fixed: boolean };

const emptyLine = (tax = "0", godown = ""): PurchaseLine => ({
  item_id: "",
  godown_id: godown,
  qty: "1",
  unit_cost: "0",
  tax_percent: tax,
});

export default function MainPurchaseInvoice() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [configuredCharges, setConfiguredCharges] = useState<ConfiguredCharge[]>([]);
  const [orderNo, setOrderNo] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceType, setInvoiceType] = useState<"Purchase Invoice" | "Tax Invoice">("Purchase Invoice");
  const [globalTaxPercent, setGlobalTaxPercent] = useState("0");
  const [taxConfigured, setTaxConfigured] = useState(false);
  const [rows, setRows] = useState<PurchaseLine[]>([emptyLine()]);
  const [charges, setCharges] = useState<ChargeValues>(createEmptyCharges());
  const [consolidated, setConsolidated] = useState<ConsolidatedOption[]>([]);
  const [selectedConsolidatedIds, setSelectedConsolidatedIds] = useState<string[]>([]);
  const [loadingConsolidated, setLoadingConsolidated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const purchaseCharges = getChargesForContext("purchase");

  const loadBase = useCallback(async () => {
    const [supplierRes, itemRes, godownRes, orderNoRes, taxRes, chargeRes] = await Promise.all([
      supabase.from("suppliers").select("id,name").eq("is_active", true).order("name"),
      supabase.from("items").select("id,name,sku,cost").order("name"),
      supabase.from("godowns").select("id,name").order("name"),
      supabase.rpc("next_purchase_order_no"),
      supabase.from("tax_rates").select("rate,is_fixed").eq("is_active", true).eq("is_fixed", true).in("applies_to", ["purchase", "both"]).order("created_at").limit(1).maybeSingle(),
      supabase.from("charge_master").select("charge_key,charge_name,default_rate,is_fixed").eq("is_active", true).in("applies_to", ["purchase", "both"]).order("charge_name"),
    ]);

    const firstError = supplierRes.error || itemRes.error || godownRes.error || orderNoRes.error || taxRes.error || chargeRes.error;
    if (firstError) throw firstError;

    const loadedGodowns = (godownRes.data ?? []) as Godown[];
    setSuppliers((supplierRes.data ?? []) as Supplier[]);
    setItems((itemRes.data ?? []) as Item[]);
    setGodowns(loadedGodowns);
    setOrderNo(String(orderNoRes.data ?? ""));

    if (taxRes.data) {
      const rate = String(Number(taxRes.data.rate) || 0);
      setGlobalTaxPercent(rate);
      setTaxConfigured(true);
      setRows([emptyLine(rate, loadedGodowns[0]?.id ?? "")]);
    } else {
      setRows([emptyLine("0", loadedGodowns[0]?.id ?? "")]);
    }

    const loadedCharges = (chargeRes.data ?? []) as ConfiguredCharge[];
    setConfiguredCharges(loadedCharges);
    setCharges((current) => loadedCharges.reduce((next, charge) => {
      if (charge.charge_key in next) next[charge.charge_key] = String(Number(charge.default_rate) || 0);
      return next;
    }, { ...current }));
  }, []);

  useEffect(() => {
    void loadBase().catch((e: any) => setError(e?.message || "Failed to load purchase form."));
  }, [loadBase]);

  useEffect(() => {
    const load = async () => {
      if (!supplierId) {
        setConsolidated([]);
        setSelectedConsolidatedIds([]);
        return;
      }
      setLoadingConsolidated(true);
      const { data, error: loadError } = await supabase.rpc("get_available_consolidated_purchase_invoices", {
        p_supplier_id: supplierId,
        p_order_id: null,
      });
      setLoadingConsolidated(false);
      if (loadError) {
        setError(loadError.message);
        setConsolidated([]);
        return;
      }
      setConsolidated((data ?? []) as ConsolidatedOption[]);
      setSelectedConsolidatedIds([]);
    };
    void load();
  }, [supplierId]);

  const directSubtotal = rows.reduce((sum, row) => sum + (Number(row.qty) || 0) * (Number(row.unit_cost) || 0), 0);
  const directItemTax = invoiceType === "Tax Invoice"
    ? rows.reduce((sum, row) => {
        const base = (Number(row.qty) || 0) * (Number(row.unit_cost) || 0);
        return sum + base * (Number(row.tax_percent) || 0) / 100;
      }, 0)
    : 0;
  const directCharges = calculateChargeTotalForContext(charges, "purchase");
  const directChargeTax = invoiceType === "Tax Invoice" ? directCharges * (Number(globalTaxPercent) || 0) / 100 : 0;
  const selectedConsolidated = useMemo(() => consolidated.filter((row) => selectedConsolidatedIds.includes(row.id)), [consolidated, selectedConsolidatedIds]);
  const consolidatedTotal = selectedConsolidated.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const grandTotal = directSubtotal + directItemTax + directCharges + directChargeTax + consolidatedTotal;

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

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      if (!supplierId) throw new Error("Please select a supplier.");
      if (invoiceType === "Tax Invoice" && !taxConfigured) throw new Error("Add and fix an active Purchase/Both tax rate in Tax Settings before creating a Tax Invoice.");

      const validRows = rows.filter((row) => row.item_id && Number(row.qty) > 0);
      if (validRows.length === 0 && selectedConsolidatedIds.length === 0) throw new Error("Add at least one direct item or select a Consolidated Purchase Invoice.");
      if (validRows.some((row) => !row.godown_id)) throw new Error("Select a destination godown for every direct item.");

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

      if (validRows.length > 0) {
        const { error: lineError } = await supabase.from("purchase_order_lines").insert(validRows.map((row) => ({
          order_id: order.id,
          item_id: row.item_id,
          godown_id: row.godown_id,
          qty: Number(row.qty) || 0,
          unit_cost: Number(row.unit_cost) || 0,
          tax_percent: invoiceType === "Tax Invoice" ? Number(row.tax_percent) || 0 : 0,
          line_total: (Number(row.qty) || 0) * (Number(row.unit_cost) || 0),
        })));
        if (lineError) throw lineError;
      }

      const { error: linkError } = await supabase.rpc("replace_purchase_order_consolidated_invoices", {
        p_order_id: order.id,
        p_consolidated_invoice_ids: selectedConsolidatedIds,
      });
      if (linkError) throw linkError;

      navigate(`/purchase/${order.id}`);
    } catch (e: any) {
      setError(e?.message || "Failed to save Main Purchase Invoice.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link to="/purchase" className="mb-4 inline-block text-sm text-primary-600">← Back to Purchase</Link>
      <PageHeader title="Main Purchase Invoice / مین خریداری انوائس" subtitle="Direct purchase items + previously posted Consolidated Purchase Invoices" />
      {error && <ErrorBanner message={error} />}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="card p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div><label className="label">Invoice No.</label><input className="input bg-slate-50" readOnly value={orderNo} /></div>
            <div><label className="label">Supplier / سپلائر</label><select className="input" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">— Select supplier —</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div>
            <div><label className="label">Date / تاریخ</label><input className="input" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
            <div><label className="label">Invoice Type / قسم</label><select className="input" value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as "Purchase Invoice" | "Tax Invoice")}><option value="Purchase Invoice">Without Tax / بغیر ٹیکس</option><option value="Tax Invoice">With Tax / ٹیکس کے ساتھ</option></select></div>
          </div>
          {invoiceType === "Tax Invoice" && <div className="mt-4 max-w-xs"><label className="label">Configured VAT % / مقررہ ویٹ</label><input className="input bg-slate-50 cursor-not-allowed" disabled value={globalTaxPercent} /></div>}
        </div>

        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">Direct Main Invoice Items / مین انوائس آئٹمز</h3><button type="button" className="btn-secondary text-sm" onClick={() => setRows([...rows, emptyLine(globalTaxPercent, godowns[0]?.id ?? "")])}>+ Add Row</button></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="py-2 text-left">Item</th><th>Godown</th><th className="text-right">Qty</th><th className="text-right">Unit Cost</th>{invoiceType === "Tax Invoice" && <th className="text-right">VAT</th>}<th className="text-right">Amount</th><th /></tr></thead><tbody>{rows.map((row, index) => {
            const base = (Number(row.qty) || 0) * (Number(row.unit_cost) || 0);
            const tax = invoiceType === "Tax Invoice" ? base * (Number(row.tax_percent) || 0) / 100 : 0;
            return <tr key={index} className="border-b border-slate-100"><td className="py-2 pr-2"><select className="input" value={row.item_id} onChange={(e) => updateLine(index, "item_id", e.target.value)}><option value="">— Select —</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` (${item.sku})` : ""}</option>)}</select></td><td className="px-2"><select className="input" value={row.godown_id} onChange={(e) => updateLine(index, "godown_id", e.target.value)}><option value="">— Select —</option>{godowns.map((godown) => <option key={godown.id} value={godown.id}>{godown.name}</option>)}</select></td><td className="px-2"><input className="input w-24 text-right" type="number" min="0" step="0.01" value={row.qty} onChange={(e) => updateLine(index, "qty", e.target.value)} /></td><td className="px-2"><input className="input w-28 text-right" type="number" min="0" step="0.01" value={row.unit_cost} onChange={(e) => updateLine(index, "unit_cost", e.target.value)} /></td>{invoiceType === "Tax Invoice" && <td className="px-2"><input className="input w-20 bg-slate-50 text-right cursor-not-allowed" disabled value={row.tax_percent} /></td>}<td className="px-2 text-right font-medium">{formatCurrency(base + tax)}</td><td className="pl-2 text-right">{rows.length > 1 && <button type="button" className="text-error-600" onClick={() => setRows(rows.filter((_, i) => i !== index))}>Remove</button>}</td></tr>;
          })}</tbody></table></div>
        </div>

        <div className="card p-6">
          <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">Add Consolidated Purchase / کنسولیڈیٹڈ خریداری شامل کریں</h3><p className="text-xs text-slate-500">These documents stay separate and are attached to this Main Invoice later. Stock is not received twice.</p></div><Link to="/purchase/consolidated" className="btn-secondary text-sm">Open Consolidated Purchase</Link></div>
          {!supplierId ? <div className="text-sm text-slate-400">Select supplier first.</div> : loadingConsolidated ? <div className="text-sm text-slate-400">Loading…</div> : consolidated.length === 0 ? <div className="text-sm text-slate-400">No posted Consolidated Purchase Invoice available for this supplier.</div> : <div className="space-y-2">{consolidated.map((invoice) => <label key={invoice.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3"><span className="flex items-center gap-3"><input type="checkbox" checked={selectedConsolidatedIds.includes(invoice.id)} onChange={(e) => setSelectedConsolidatedIds((current) => e.target.checked ? [...current, invoice.id] : current.filter((id) => id !== invoice.id))} /><span><span className="font-medium">{invoice.invoice_no}</span><span className="ml-2 text-xs text-slate-500">{invoice.invoice_date}{invoice.reference_no ? ` · ${invoice.reference_no}` : ""}</span></span></span><span className="font-semibold">{formatCurrency(Number(invoice.total) || 0)}</span></label>)}</div>}
        </div>

        <div className="card p-6">
          <h3 className="mb-4 font-semibold">Main Invoice Charges / مین انوائس چارجز</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{purchaseCharges.map((chargeType) => {
            const config = configuredCharges.find((charge) => charge.charge_key === chargeType.key);
            return <div key={chargeType.key}><label className="label">{config?.charge_name ?? chargeType.label}</label><input className="input text-right" type="number" min="0" step="0.01" disabled={Boolean(config?.is_fixed)} value={charges[chargeType.key]} onChange={(e) => setCharges({ ...charges, [chargeType.key]: e.target.value })} /></div>;
          })}</div>
        </div>

        <div className="card p-6">
          <div className="ml-auto max-w-md space-y-2 text-sm">
            <div className="flex justify-between"><span>Direct Items</span><span>{formatCurrency(directSubtotal)}</span></div>
            {invoiceType === "Tax Invoice" && <div className="flex justify-between"><span>Direct VAT</span><span>{formatCurrency(directItemTax + directChargeTax)}</span></div>}
            <div className="flex justify-between"><span>Main Charges</span><span>{formatCurrency(directCharges)}</span></div>
            <div className="flex justify-between"><span>Linked Consolidated</span><span>{formatCurrency(consolidatedTotal)}</span></div>
            <div className="flex justify-between border-t pt-2 text-lg font-bold"><span>Grand Total</span><span>{formatCurrency(grandTotal)}</span></div>
          </div>
          <div className="mt-5 flex justify-end gap-3"><Link to="/purchase" className="btn-secondary">Cancel</Link><button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving..." : "Save Main Purchase Invoice"}</button></div>
        </div>
      </form>
    </div>
  );
}
