import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, Download, Printer, RefreshCw, Scale, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ErrorBanner, formatCurrency } from "@/components/ui";

type ViewMode = "stock" | "commercial";

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const qty = (value: unknown) => n(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
const money = (value: unknown) => formatCurrency(n(value));

export default function SteelStockControl() {
  const [mode, setMode] = useState<ViewMode>("stock");
  const [stock, setStock] = useState<any[]>([]);
  const [commercial, setCommercial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [godown, setGodown] = useState("all");
  const [varianceOnly, setVarianceOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [stockResult, commercialResult] = await Promise.all([
      supabase
        .from("steel_stock_reconciliation")
        .select("*")
        .order("item_name")
        .order("godown")
        .limit(20000),
      supabase
        .from("steel_item_commercial_summary")
        .select("*")
        .order("item_name")
        .limit(10000),
    ]);

    const firstError = stockResult.error ?? commercialResult.error;
    if (firstError) setError(firstError.message);
    setStock(stockResult.data ?? []);
    setCommercial(commercialResult.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const categories = useMemo(() => Array.from(new Set(stock.map((r) => r.category_name).filter(Boolean))).sort(), [stock]);
  const godowns = useMemo(() => Array.from(new Set(stock.map((r) => r.godown).filter(Boolean))).sort(), [stock]);

  const filteredStock = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stock.filter((r) => {
      const haystack = [r.item_name, r.sku, r.grade, r.size, r.category_name, r.sub_category, r.godown]
        .filter(Boolean).join(" ").toLowerCase();
      return (!q || haystack.includes(q))
        && (category === "all" || r.category_name === category)
        && (godown === "all" || r.godown === godown)
        && (!varianceOnly || Math.abs(n(r.variance_quantity)) >= 0.0001);
    });
  }, [stock, search, category, godown, varianceOnly]);

  const filteredCommercial = useMemo(() => {
    const q = search.trim().toLowerCase();
    return commercial.filter((r) => {
      const haystack = [r.item_name, r.sku, r.grade, r.size, r.category_name, r.sub_category]
        .filter(Boolean).join(" ").toLowerCase();
      return (!q || haystack.includes(q)) && (category === "all" || r.category_name === category);
    });
  }, [commercial, search, category]);

  const summary = useMemo(() => filteredStock.reduce((a, r) => ({
    current: a.current + n(r.current_quantity),
    book: a.book + n(r.book_quantity),
    variance: a.variance + n(r.variance_quantity),
    value: a.value + n(r.stock_value),
    purchase: a.purchase + n(r.purchase_in_qty),
    sale: a.sale + n(r.sales_out_qty),
    productionIn: a.productionIn + n(r.production_in_qty),
    productionOut: a.productionOut + n(r.production_out_qty),
  }), { current: 0, book: 0, variance: 0, value: 0, purchase: 0, sale: 0, productionIn: 0, productionOut: 0 }), [filteredStock]);

  const exportCsv = () => {
    const rows = mode === "stock"
      ? filteredStock.map((r) => ({
          Category: r.category_name ?? "",
          Item: r.item_name ?? "",
          SKU: r.sku ?? "",
          Grade: r.grade ?? "",
          Size: r.size ?? "",
          Godown: r.godown ?? "",
          Purchase: n(r.purchase_in_qty),
          Sales: n(r.sales_out_qty),
          "Production In": n(r.production_in_qty),
          "Production Out": n(r.production_out_qty),
          "Sales Return": n(r.sales_return_qty),
          "Purchase Return": n(r.purchase_return_qty),
          "Other In": n(r.other_in_qty),
          "Other Out": n(r.other_out_qty),
          "Book Qty": n(r.book_quantity),
          "Current Qty": n(r.current_quantity),
          Variance: n(r.variance_quantity),
          "Avg Cost": n(r.avg_cost),
          "Stock Value": n(r.stock_value),
        }))
      : filteredCommercial.map((r) => ({
          Category: r.category_name ?? "",
          Item: r.item_name ?? "",
          Grade: r.grade ?? "",
          Size: r.size ?? "",
          "Net Purchase Qty": n(r.net_purchase_qty),
          "Net Purchase Value": n(r.net_purchase_value),
          "Avg Purchase Rate": n(r.avg_purchase_rate),
          "Net Sales Qty": n(r.net_sales_qty),
          "Net Sales Value": n(r.net_sales_value),
          "Avg Sale Rate": n(r.avg_sale_rate),
          "Rate Spread": n(r.rate_spread),
        }));

    if (!rows.length) {
      setError("No report data to export / ایکسپورٹ کرنے کے لیے ڈیٹا موجود نہیں۔");
      return;
    }

    const headers = Object.keys(rows[0]);
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(","), ...rows.map((row) => headers.map((h) => esc((row as any)[h])).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = mode === "stock" ? "Steel_Stock_Reconciliation.csv" : "Steel_Commercial_Summary.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="print-report space-y-4 pb-12" data-print-root>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <Scale className="h-5 w-5 text-blue-600" />
              Steel Stock Control / اسٹیل اسٹاک کنٹرول
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Book stock, physical stock, movement reconciliation and commercial rate intelligence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button type="button" onClick={exportCsv} className="btn-secondary"><Download className="h-3.5 w-3.5" /> Excel / CSV</button>
            <button type="button" onClick={() => window.print()} className="btn-secondary"><Printer className="h-3.5 w-3.5" /> Print / PDF</button>
            <button type="button" onClick={() => void load()} className="btn-secondary"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="summary-card"><div className="summary-label">Current Stock / موجودہ اسٹاک</div><div className="summary-value">{qty(summary.current)}</div></div>
        <div className="summary-card"><div className="summary-label">Book Stock / حسابی اسٹاک</div><div className="summary-value">{qty(summary.book)}</div></div>
        <div className="summary-card"><div className="summary-label">Variance / فرق</div><div className={`summary-value ${Math.abs(summary.variance) >= 0.0001 ? "text-rose-700" : "text-emerald-700"}`}>{qty(summary.variance)}</div></div>
        <div className="summary-card"><div className="summary-label">Stock Value / اسٹاک مالیت</div><div className="summary-value">{money(summary.value)}</div></div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 print:hidden lg:flex-row lg:items-end">
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode("stock")} className={mode === "stock" ? "btn-primary" : "btn-secondary"}><Boxes className="h-3.5 w-3.5" /> Stock Reconciliation</button>
          <button type="button" onClick={() => setMode("commercial")} className={mode === "commercial" ? "btn-primary" : "btn-secondary"}><TrendingUp className="h-3.5 w-3.5" /> Purchase / Sale Rates</button>
        </div>
        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-4">
          <input className="input" placeholder="Search item, size, grade..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">All Categories</option>{categories.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          {mode === "stock" && <select className="input" value={godown} onChange={(e) => setGodown(e.target.value)}><option value="all">All Godowns</option>{godowns.map((x) => <option key={x} value={x}>{x}</option>)}</select>}
          {mode === "stock" && <label className="flex h-8 items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold"><input type="checkbox" checked={varianceOnly} onChange={(e) => setVarianceOnly(e.target.checked)} /> Variance only</label>}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm text-slate-500">Loading steel stock logic…</div>
      ) : mode === "stock" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-3 md:grid-cols-4">
            <div><span className="text-xs text-slate-500">Purchase In</span><div className="font-bold">{qty(summary.purchase)}</div></div>
            <div><span className="text-xs text-slate-500">Sales Out</span><div className="font-bold">{qty(summary.sale)}</div></div>
            <div><span className="text-xs text-slate-500">Production In</span><div className="font-bold">{qty(summary.productionIn)}</div></div>
            <div><span className="text-xs text-slate-500">Production Consumption</span><div className="font-bold">{qty(summary.productionOut)}</div></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50"><tr>
                <th className="p-2 text-left">Category</th><th className="p-2 text-left">Item</th><th className="p-2 text-left">Grade / Size</th><th className="p-2 text-left">Godown</th>
                <th className="p-2 text-right">Purchase</th><th className="p-2 text-right">Sale</th><th className="p-2 text-right">Prod In</th><th className="p-2 text-right">Prod Out</th>
                <th className="p-2 text-right">Returns Net</th><th className="p-2 text-right">Book</th><th className="p-2 text-right">Current</th><th className="p-2 text-right">Variance</th><th className="p-2 text-right">Value</th>
              </tr></thead>
              <tbody>{filteredStock.map((r, i) => {
                const variance = n(r.variance_quantity);
                const returnsNet = n(r.sales_return_qty) - n(r.purchase_return_qty);
                return <tr key={`${r.item_id}-${r.godown_id}-${i}`} className="border-t border-slate-100">
                  <td className="p-2">{r.category_name || "—"}</td><td className="p-2 font-semibold">{r.item_name}</td><td className="p-2">{[r.grade, r.size].filter(Boolean).join(" / ") || "—"}</td><td className="p-2">{r.godown || "—"}</td>
                  <td className="p-2 text-right">{qty(r.purchase_in_qty)}</td><td className="p-2 text-right">{qty(r.sales_out_qty)}</td><td className="p-2 text-right">{qty(r.production_in_qty)}</td><td className="p-2 text-right">{qty(r.production_out_qty)}</td>
                  <td className="p-2 text-right">{qty(returnsNet)}</td><td className="p-2 text-right font-semibold">{qty(r.book_quantity)}</td><td className="p-2 text-right font-bold">{qty(r.current_quantity)}</td>
                  <td className={`p-2 text-right font-bold ${Math.abs(variance) >= 0.0001 ? "text-rose-700" : "text-emerald-700"}`}>{Math.abs(variance) >= 0.0001 && <AlertTriangle className="mr-1 inline h-3 w-3" />}{qty(variance)}</td>
                  <td className="p-2 text-right">{money(r.stock_value)}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50"><tr>
                <th className="p-2 text-left">Category</th><th className="p-2 text-left">Item</th><th className="p-2 text-left">Grade / Size</th>
                <th className="p-2 text-right">Purchase Qty</th><th className="p-2 text-right">Purchase Avg</th><th className="p-2 text-right">Sale Qty</th><th className="p-2 text-right">Sale Avg</th><th className="p-2 text-right">Rate Spread</th>
              </tr></thead>
              <tbody>{filteredCommercial.map((r) => <tr key={r.item_id} className="border-t border-slate-100">
                <td className="p-2">{r.category_name || "—"}</td><td className="p-2 font-semibold">{r.item_name}</td><td className="p-2">{[r.grade, r.size].filter(Boolean).join(" / ") || "—"}</td>
                <td className="p-2 text-right">{qty(r.net_purchase_qty)}</td><td className="p-2 text-right">{money(r.avg_purchase_rate)}</td><td className="p-2 text-right">{qty(r.net_sales_qty)}</td><td className="p-2 text-right">{money(r.avg_sale_rate)}</td>
                <td className={`p-2 text-right font-bold ${n(r.rate_spread) < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(r.rate_spread)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
