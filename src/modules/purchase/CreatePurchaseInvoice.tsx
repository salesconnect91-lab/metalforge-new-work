import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Supplier, Item } from "@/types";
import { PageHeader, ErrorBanner, formatCurrency } from "@/components/ui";
import { getChargesForContext, calculateChargeTotalForContext, buildChargePayload, createEmptyCharges, ChargeValues } from "@/lib/chargeTypes";

interface PurchaseRow {
  item_id: string;
  qty: string;
  unit_cost: string;
  tax_percent: string;
}

interface ConfiguredCharge {
  charge_key: string;
  charge_name: string;
  default_rate: number;
  is_fixed: boolean;
}

export default function CreatePurchaseInvoice() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [orderNo, setOrderNo] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceType, setInvoiceType] = useState<"Purchase Invoice" | "Tax Invoice">("Purchase Invoice");
  const [globalTaxPercent, setGlobalTaxPercent] = useState("0");
  const [taxRateLocked, setTaxRateLocked] = useState(false);
  const [taxRateConfigured, setTaxRateConfigured] = useState(false);
  const [configuredCharges, setConfiguredCharges] = useState<ConfiguredCharge[]>([]);

  const [rows, setRows] = useState<PurchaseRow[]>([
    { item_id: "", qty: "0", unit_cost: "0", tax_percent: "0" },
  ]);

  const [charges, setCharges] = useState<ChargeValues>(createEmptyCharges());
  const purchaseCharges = getChargesForContext("purchase");

  const fetchData = useCallback(async () => {
    const [supRes, itemRes, orderNoRes, taxRes, chargeRes] = await Promise.all([
      supabase.from("suppliers").select("*").eq("is_active", true).order("name"),
      supabase.from("items").select("*").order("name"),
      supabase.rpc("next_purchase_order_no"),
      supabase
        .from("tax_rates")
        .select("rate,is_fixed")
        .eq("is_active", true)
        .eq("is_fixed", true)
        .in("applies_to", ["purchase", "both"])
        .order("created_at")
        .limit(1)
        .maybeSingle(),
      supabase.from("charge_master").select("charge_key,charge_name,default_rate,is_fixed").eq("is_active", true).in("applies_to", ["purchase", "both"]).order("charge_name"),
    ]);
    setSuppliers(supRes.data ?? []);
    setItems(itemRes.data ?? []);
    if (taxRes.error || chargeRes.error) {
      setError(taxRes.error?.message || chargeRes.error?.message || "Settings load failed.");
      return;
    }
    if (taxRes.data) {
      const rate = String(Number(taxRes.data.rate) || 0);
      setGlobalTaxPercent(rate);
      setTaxRateLocked(Boolean(taxRes.data.is_fixed));
      setTaxRateConfigured(true);
      setRows((current) => current.map((row) => ({ ...row, tax_percent: rate })));
    }
    const loadedCharges = (chargeRes.data ?? []) as ConfiguredCharge[];
    setConfiguredCharges(loadedCharges);
    setCharges((current) => loadedCharges.reduce((next, charge) => {
      if (charge.charge_key in next) next[charge.charge_key] = String(Number(charge.default_rate) || 0);
      return next;
    }, { ...current }));
    if (orderNoRes.error) {
      setError(orderNoRes.error.message);
      return;
    }
    setOrderNo(orderNoRes.data ?? "");
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addRow = () => setRows([
    ...rows,
    { item_id: "", qty: "0", unit_cost: "0", tax_percent: globalTaxPercent },
  ]);
  const removeRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i));

  const updateRow = (index: number, field: keyof PurchaseRow, value: string) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "item_id") {
      const item = items.find((i) => i.id === value);
      if (item) updated[index].unit_cost = String(item.cost);
    }
    setRows(updated);
  };

  const rowsTotal = rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.unit_cost) || 0), 0);
  const itemTaxAmount = invoiceType === "Tax Invoice"
    ? rows.reduce((s, r) => {
        const base = (parseFloat(r.qty) || 0) * (parseFloat(r.unit_cost) || 0);
        return s + (base * (parseFloat(r.tax_percent) || 0)) / 100;
      }, 0)
    : 0;
  const chargesTotal = calculateChargeTotalForContext(charges, "purchase");
  const chargeTaxAmount = invoiceType === "Tax Invoice"
    ? (chargesTotal * (parseFloat(globalTaxPercent) || 0)) / 100
    : 0;
  const vatAmount = itemTaxAmount + chargeTaxAmount;
  const grandTotal = rowsTotal + chargesTotal + vatAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!supplierId) {
      setError("Please select a supplier.");
      setSaving(false);
      return;
    }

    if (invoiceType === "Tax Invoice" && !taxRateConfigured) {
      setError("Add and fix an active Purchase/Both tax rate in Tax Settings before creating a Tax Invoice.");
      setSaving(false);
      return;
    }

    const validRows = rows.filter((r) => r.item_id && parseFloat(r.qty) > 0);
    if (validRows.length === 0) {
      setError("Add at least one item row with a quantity.");
      setSaving(false);
      return;
    }

    const chargePayload = buildChargePayload(charges);

    const { data: order, error: orderError } = await supabase
      .from("purchase_orders")
      .insert({
        order_no: orderNo,
        supplier_id: supplierId,
        order_date: orderDate,
        status: "draft",
        invoice_type: invoiceType,
        tax_percent: invoiceType === "Tax Invoice" ? parseFloat(globalTaxPercent) || 0 : 0,
        total: grandTotal,
        ...chargePayload,
      })
      .select()
      .single();

    if (orderError) {
      setError(orderError.message);
      setSaving(false);
      return;
    }

    const linePayloads = validRows.map((r) => ({
      order_id: order.id,
      item_id: r.item_id,
      qty: parseFloat(r.qty) || 0,
      unit_cost: parseFloat(r.unit_cost) || 0,
      tax_percent: invoiceType === "Tax Invoice" ? parseFloat(r.tax_percent) || 0 : 0,
      line_total: (parseFloat(r.qty) || 0) * (parseFloat(r.unit_cost) || 0),
    }));

    const { error: linesError } = await supabase.from("purchase_order_lines").insert(linePayloads);
    if (linesError) {
      setError(linesError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    navigate(`/purchase/${order.id}`);
  };

  return (
    <div>
      <Link to="/purchase" className="text-sm text-primary-600 hover:text-primary-700 mb-4 inline-block">← Back to Purchase Orders</Link>
      <PageHeader title="Create Purchase Invoice / خریداری انوائس بنائیں" subtitle="Build a supplier purchase order with items and dynamic charges / سپلائر خریداری اور چارجز درج کریں" />

      {error && <ErrorBanner message={error} />}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Order Details / آرڈر کی تفصیل</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="label">Order No. / آرڈر نمبر</label>
              <input className="input bg-slate-50 cursor-not-allowed" required readOnly value={orderNo} />
            </div>
            <div>
              <label className="label">Supplier / سپلائر</label>
              <select className="input" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— Select supplier —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Order Date / آرڈر کی تاریخ</label>
              <input className="input" type="date" required value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Purchase Type / خریداری کی قسم</label>
              <select
                className="input"
                value={invoiceType}
                onChange={(e) => setInvoiceType(e.target.value as "Purchase Invoice" | "Tax Invoice")}
              >
                <option value="Purchase Invoice">Without Tax (Purchase Invoice) / بغیر ٹیکس</option>
                <option value="Tax Invoice">With Tax (Purchase Tax Invoice) / ٹیکس کے ساتھ</option>
              </select>
            </div>
            <div>
              <label className="label">Global VAT % / ویٹ فیصد</label>
              <input
                className="input text-right"
                type="number"
                min="0"
                max="100"
                step="0.01"
                disabled={invoiceType !== "Tax Invoice" || taxRateLocked}
                value={globalTaxPercent}
                onChange={(e) => {
                  const value = e.target.value;
                  setGlobalTaxPercent(value);
                  setRows(rows.map((row) => ({ ...row, tax_percent: value })));
                }}
              />
            </div>
          </div>
        </div>

        {/* Item Rows */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Item Rows / آئٹم قطاریں</h3>
            <button type="button" onClick={addRow} className="btn-secondary text-sm">+ Add Row</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 pr-3 font-medium text-slate-600">Item / آئٹم</th>
                  <th className="text-right py-2 px-3 font-medium text-slate-600">Qty (kg) / مقدار</th>
                  <th className="text-right py-2 px-3 font-medium text-slate-600">Unit Cost / فی یونٹ لاگت</th>
                  {invoiceType === "Tax Invoice" && (
                    <th className="text-right py-2 px-3 font-medium text-slate-600">VAT % / ویٹ</th>
                  )}
                  <th className="text-right py-2 px-3 font-medium text-slate-600">Amount Incl. VAT / رقم</th>
                  <th className="py-2 pl-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const amount = (parseFloat(row.qty) || 0) * (parseFloat(row.unit_cost) || 0);
                  const lineTax = invoiceType === "Tax Invoice"
                    ? (amount * (parseFloat(row.tax_percent) || 0)) / 100
                    : 0;
                  return (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 pr-3">
                        <select className="input" value={row.item_id} onChange={(e) => updateRow(i, "item_id", e.target.value)}>
                          <option value="">— Select —</option>
                          {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.sku})</option>)}
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <input className="input w-24 text-right" type="number" step="0.01" value={row.qty} onChange={(e) => updateRow(i, "qty", e.target.value)} />
                      </td>
                      <td className="py-2 px-3">
                        <input className="input w-28 text-right" type="number" step="0.01" value={row.unit_cost} onChange={(e) => updateRow(i, "unit_cost", e.target.value)} />
                      </td>
                      {invoiceType === "Tax Invoice" && (
                        <td className="py-2 px-3">
                          <input
                            className="input w-20 text-right"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={row.tax_percent}
                            onChange={(e) => updateRow(i, "tax_percent", e.target.value)}
                          />
                        </td>
                      )}
                      <td className="py-2 px-3 text-right font-medium text-slate-700">{formatCurrency(amount + lineTax)}</td>
                      <td className="py-2 pl-3">
                        {rows.length > 1 && (
                          <button type="button" onClick={() => removeRow(i)} className="text-error-600 hover:text-error-700 text-sm">✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end mt-3">
            <div className="text-right">
              <div className="text-sm text-slate-500">Items Total Incl. VAT / آئٹمز کل</div>
              <div className="text-lg font-bold text-slate-900">{formatCurrency(rowsTotal + itemTaxAmount)}</div>
            </div>
          </div>
        </div>

        {/* Dynamic Charges */}
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Charges / چارجز</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {purchaseCharges.map((ct) => (
              <div key={ct.key}>
                <label className="label">{configuredCharges.find((charge) => charge.charge_key === ct.key)?.charge_name ?? ct.label}</label>
                <input
                  className="input text-right"
                  type="number"
                  step="0.01"
                  disabled={configuredCharges.find((charge) => charge.charge_key === ct.key)?.is_fixed}
                  value={charges[ct.key]}
                  onChange={(e) => setCharges({ ...charges, [ct.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="card p-6">
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm text-slate-600"><span>Items Subtotal / آئٹمز ذیلی کل</span><span>{formatCurrency(rowsTotal)}</span></div>
              <div className="flex justify-between text-sm text-slate-600"><span>Charges / چارجز</span><span>{formatCurrency(chargesTotal)}</span></div>
              {invoiceType === "Tax Invoice" && (
                <>
                  <div className="flex justify-between text-sm text-slate-600"><span>Items VAT / آئٹمز ویٹ</span><span>{formatCurrency(itemTaxAmount)}</span></div>
                  <div className="flex justify-between text-sm text-slate-600"><span>Charges VAT / چارجز ویٹ</span><span>{formatCurrency(chargeTaxAmount)}</span></div>
                  <div className="flex justify-between text-sm font-semibold text-slate-700"><span>Total VAT / کل ویٹ</span><span>{formatCurrency(vatAmount)}</span></div>
                </>
              )}
              <div className="flex justify-between text-lg font-bold text-slate-900 border-t border-slate-200 pt-2"><span>Grand Total / مجموعی کل</span><span>{formatCurrency(grandTotal)}</span></div>
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <button type="button" onClick={() => navigate("/purchase")} className="btn-secondary">Cancel / منسوخ کریں</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Create Purchase Order"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
