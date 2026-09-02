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

  const [rows, setRows] = useState<PurchaseRow[]>([
    { item_id: "", qty: "0", unit_cost: "0" },
  ]);

  const [charges, setCharges] = useState<ChargeValues>(createEmptyCharges());
  const purchaseCharges = getChargesForContext("purchase");

  const fetchData = useCallback(async () => {
    const [supRes, itemRes, orderNoRes] = await Promise.all([
      supabase.from("suppliers").select("*").eq("is_active", true).order("name"),
      supabase.from("items").select("*").order("name"),
      supabase.rpc("next_purchase_order_no"),
    ]);
    setSuppliers(supRes.data ?? []);
    setItems(itemRes.data ?? []);
    if (orderNoRes.error) {
      setError(orderNoRes.error.message);
      return;
    }
    setOrderNo(orderNoRes.data ?? "");
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addRow = () => setRows([...rows, { item_id: "", qty: "0", unit_cost: "0" }]);
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

  const rowsTotal = rows.reduce((s, r) => (s + (parseFloat(r.qty) || 0) * (parseFloat(r.unit_cost) || 0)), 0);
  const chargesTotal = calculateChargeTotalForContext(charges, "purchase");
  const grandTotal = rowsTotal + chargesTotal;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!supplierId) {
      setError("Please select a supplier.");
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <th className="text-right py-2 px-3 font-medium text-slate-600">Amount / رقم</th>
                  <th className="py-2 pl-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const amount = (parseFloat(row.qty) || 0) * (parseFloat(row.unit_cost) || 0);
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
                      <td className="py-2 px-3 text-right font-medium text-slate-700">{formatCurrency(amount)}</td>
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
              <div className="text-sm text-slate-500">Items Total / آئٹمز کل</div>
              <div className="text-lg font-bold text-slate-900">{formatCurrency(rowsTotal)}</div>
            </div>
          </div>
        </div>

        {/* Dynamic Charges */}
        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Charges / چارجز</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {purchaseCharges.map((ct) => (
              <div key={ct.key}>
                <label className="label">{ct.label}</label>
                <input
                  className="input text-right"
                  type="number"
                  step="0.01"
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
              <div className="flex justify-between text-sm text-slate-600"><span>Items Total / آئٹمز کل</span><span>{formatCurrency(rowsTotal)}</span></div>
              <div className="flex justify-between text-sm text-slate-600"><span>Charges Total / چارجز کل</span><span>{formatCurrency(chargesTotal)}</span></div>
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
