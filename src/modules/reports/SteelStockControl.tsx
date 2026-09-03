import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, CalendarDays, Download, Printer, RefreshCw, Scale, Table2, TrendingUp } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import { ErrorBanner, formatCurrency } from "@/components/ui";

type ViewMode = "matrix" | "commercial" | "history" | "exceptions";
type AnyRow = Record<string, any>;

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const qty = (value: unknown) => n(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
const money = (value: unknown) => formatCurrency(n(value));
const pct = (value: unknown) => `${n(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

const steelGroup = (row: AnyRow) => {
  const raw = [row.sub_category, row.category_name, row.item_name, row.sku].filter(Boolean).join(" ").toLowerCase();
  if (/tr\s*toti|toti\s*tr|toti/.test(raw)) return "TR Toti";
  if (/sarya|saria|rebar|deformed/.test(raw)) return "Sarya";
  if (/(^|\s)tr($|\s)|tee\s*bar|t-?iron/.test(raw)) return "TR";
  if (/oval/.test(raw)) return "Oval";
  if (/girder|i[- ]?beam|beam/.test(raw)) return "Girder";
  return row.sub_category || row.category_name || "Other Steel";
};

const downloadWorkbook = (sheets: Array<{ name: string; rows: AnyRow[] }>, filename: string) => {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Message: "No data" }]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
};

export default function SteelStockControl() {
  const { activeCompany } = useAuth();
  const [mode, setMode] = useState<ViewMode>("matrix");
  const [stock, setStock] = useState<AnyRow[]>([]);
  const [commercial, setCommercial] = useState<AnyRow[]>([]);
  const [periodCommercial, setPeriodCommercial] = useState<AnyRow[]>([]);
  const [history, setHistory] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [godown, setGodown] = useState("all");
  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate, setToDate] = useState(today());
  const [asOfDate, setAsOfDate] = useState(today());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [stockResult, commercialResult] = await Promise.all([
      supabase.from("steel_stock_reconciliation").select("*").order("item_name").order("godown").limit(20000),
      supabase.from("steel_item_commercial_summary").select("*").order("item_name").limit(10000),
    ]);
    const firstError = stockResult.error ?? commercialResult.error;
    if (firstError) setError(firstError.message);
    setStock(stockResult.data ?? []);
    setCommercial(commercialResult.data ?? []);
    setLoading(false);
  }, []);

  const loadPeriod = useCallback(async () => {
    setPeriodLoading(true);
    setError(null);
    const [{ data: pc, error: pcError }, { data: hist, error: histError }] = await Promise.all([
      supabase.rpc("steel_period_commercial_summary", { p_from: fromDate, p_to: toDate }),
      supabase.rpc("steel_stock_as_of", { p_as_of: asOfDate }),
    ]);
    const firstError = pcError ?? histError;
    if (firstError) setError(firstError.message);
    setPeriodCommercial((pc ?? []) as AnyRow[]);
    setHistory((hist ?? []) as AnyRow[]);
    setPeriodLoading(false);
  }, [fromDate, toDate, asOfDate]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadPeriod(); }, [loadPeriod]);

  const groups = useMemo(() => Array.from(new Set(stock.map(steelGroup))).sort(), [stock]);
  const godowns = useMemo(() => Array.from(new Set(stock.map((r) => r.godown || "Unassigned"))).sort(), [stock]);

  const matchesCommon = useCallback((r: AnyRow) => {
    const q = search.trim().toLowerCase();
    const haystack = [r.item_name, r.sku, r.grade, r.size, r.category_name, r.sub_category, r.godown, steelGroup(r)].filter(Boolean).join(" ").toLowerCase();
    return (!q || haystack.includes(q)) && (group === "all" || steelGroup(r) === group);
  }, [search, group]);

  const filteredStock = useMemo(() => stock.filter((r) => matchesCommon(r) && (godown === "all" || (r.godown || "Unassigned") === godown)), [stock, godown, matchesCommon]);
  const filteredCommercial = useMemo(() => periodCommercial.filter(matchesCommon), [periodCommercial, matchesCommon]);
  const filteredHistory = useMemo(() => history.filter((r) => matchesCommon(r) && (godown === "all" || (r.godown || "Unassigned") === godown)), [history, godown, matchesCommon]);
  const exceptions = useMemo(() => filteredStock.filter((r) => n(r.current_quantity) < 0 || Math.abs(n(r.variance_quantity)) >= 0.0001), [filteredStock]);

  const summary = useMemo(() => filteredStock.reduce((a, r) => ({
    current: a.current + n(r.current_quantity), book: a.book + n(r.book_quantity), variance: a.variance + n(r.variance_quantity), value: a.value + n(r.stock_value),
    purchase: a.purchase + n(r.purchase_in_qty), sale: a.sale + n(r.sales_out_qty), productionIn: a.productionIn + n(r.production_in_qty), productionOut: a.productionOut + n(r.production_out_qty),
  }), { current: 0, book: 0, variance: 0, value: 0, purchase: 0, sale: 0, productionIn: 0, productionOut: 0 }), [filteredStock]);

  const commercialSummary = useMemo(() => filteredCommercial.reduce((a, r) => ({
    purchaseQty: a.purchaseQty + n(r.net_purchase_qty), purchaseValue: a.purchaseValue + n(r.net_purchase_value), salesQty: a.salesQty + n(r.net_sales_qty), salesValue: a.salesValue + n(r.net_sales_value),
  }), { purchaseQty: 0, purchaseValue: 0, salesQty: 0, salesValue: 0 }), [filteredCommercial]);
  const weightedPurchase = commercialSummary.purchaseQty ? commercialSummary.purchaseValue / commercialSummary.purchaseQty : 0;
  const weightedSale = commercialSummary.salesQty ? commercialSummary.salesValue / commercialSummary.salesQty : 0;
  const weightedSpread = weightedSale - weightedPurchase;
  const weightedMarginPct = weightedSale ? (weightedSpread / weightedSale) * 100 : 0;

  const matrixRows = useMemo(() => {
    const map = new Map<string, AnyRow>();
    filteredStock.forEach((r) => {
      const key = r.item_id;
      const base = map.get(key) ?? { item_id: r.item_id, group: steelGroup(r), sku: r.sku, item_name: r.item_name, grade: r.grade, size: r.size, unit: r.unit, total: 0, value: 0 };
      base[r.godown || "Unassigned"] = n(base[r.godown || "Unassigned"]) + n(r.current_quantity);
      base.total += n(r.current_quantity);
      base.value += n(r.stock_value);
      map.set(key, base);
    });
    return Array.from(map.values()).sort((a, b) => `${a.group} ${a.item_name}`.localeCompare(`${b.group} ${b.item_name}`));
  }, [filteredStock]);

  const groupTotals = useMemo(() => {
    const map = new Map<string, { qty: number; value: number; items: number }>();
    matrixRows.forEach((r) => {
      const cur = map.get(r.group) ?? { qty: 0, value: 0, items: 0 };
      cur.qty += n(r.total); cur.value += n(r.value); cur.items += 1; map.set(r.group, cur);
    });
    return Array.from(map.entries()).map(([name, x]) => ({ name, ...x })).sort((a, b) => a.name.localeCompare(b.name));
  }, [matrixRows]);

  const exportExcel = () => {
    const matrixExport = matrixRows.map((r) => {
      const row: AnyRow = { Group: r.group, SKU: r.sku ?? "", Item: r.item_name ?? "", Grade: r.grade ?? "", Size: r.size ?? "", Unit: r.unit ?? "" };
      godowns.forEach((g) => { row[g] = n(r[g]); });
      row["Total Qty"] = n(r.total); row["Stock Value"] = n(r.value); return row;
    });
    const commercialExport = filteredCommercial.map((r) => ({ Group: steelGroup(r), SKU: r.sku ?? "", Item: r.item_name ?? "", Grade: r.grade ?? "", Size: r.size ?? "", "Purchase Qty": n(r.net_purchase_qty), "Purchase Value": n(r.net_purchase_value), "Weighted Purchase Rate": n(r.avg_purchase_rate), "Sales Qty": n(r.net_sales_qty), "Sales Value": n(r.net_sales_value), "Weighted Sale Rate": n(r.avg_sale_rate), "Rate Spread": n(r.rate_spread), "Margin %": n(r.margin_percent) }));
    const exceptionExport = exceptions.map((r) => ({ Group: steelGroup(r), SKU: r.sku ?? "", Item: r.item_name ?? "", Godown: r.godown ?? "", "Book Qty": n(r.book_quantity), "Current Qty": n(r.current_quantity), Variance: n(r.variance_quantity), Problem: n(r.current_quantity) < 0 ? "Negative Stock" : "Stock Variance" }));
    const historyExport = filteredHistory.map((r) => ({ Group: steelGroup(r), SKU: r.sku ?? "", Item: r.item_name ?? "", Grade: r.grade ?? "", Size: r.size ?? "", Godown: r.godown ?? "", [`Book Qty as of ${asOfDate}`]: n(r.book_quantity), "Last Movement": r.last_movement_at ?? "" }));
    downloadWorkbook([
      { name: "Godown Matrix", rows: matrixExport },
      { name: "Commercial Margin", rows: commercialExport },
      { name: "Exceptions", rows: exceptionExport },
      { name: "Historical Stock", rows: historyExport },
    ], `Steel_Stock_Control_${today()}.xlsx`);
  };

  return (
    <div className="print-report space-y-4 pb-12" data-print-root>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{activeCompany?.company_name || "MetalForge"}</div>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-black text-slate-950"><Scale className="h-5 w-5 text-blue-600" /> Steel Stock Control / اسٹیل اسٹاک کنٹرول</h1>
            <p className="mt-1 text-xs font-semibold text-slate-500">Godown matrix, grouped steel stock, weighted rates, margins, exceptions and historical book stock.</p>
            <div className="mt-2 hidden text-[10px] font-bold text-slate-500 print:block">Period: {fromDate} to {toDate} · Historical stock as of: {asOfDate}</div>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button type="button" onClick={exportExcel} className="btn-secondary"><Download className="h-3.5 w-3.5" /> Excel</button>
            <button type="button" onClick={() => window.print()} className="btn-secondary"><Printer className="h-3.5 w-3.5" /> Print / PDF</button>
            <button type="button" onClick={() => { void load(); void loadPeriod(); }} className="btn-secondary"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <div className="summary-card"><div className="summary-label">Current Stock</div><div className="summary-value">{qty(summary.current)}</div></div>
        <div className="summary-card"><div className="summary-label">Stock Value</div><div className="summary-value">{money(summary.value)}</div></div>
        <div className="summary-card"><div className="summary-label">Variance</div><div className={`summary-value ${Math.abs(summary.variance) > 0.0001 ? "text-rose-700" : "text-emerald-700"}`}>{qty(summary.variance)}</div></div>
        <div className="summary-card"><div className="summary-label">Exceptions</div><div className={`summary-value ${exceptions.length ? "text-rose-700" : "text-emerald-700"}`}>{exceptions.length}</div></div>
        <div className="summary-card"><div className="summary-label">Weighted Purchase</div><div className="summary-value">{money(weightedPurchase)}</div></div>
        <div className="summary-card"><div className="summary-label">Weighted Sale</div><div className="summary-value">{money(weightedSale)}</div></div>
        <div className="summary-card"><div className="summary-label">Rate Spread</div><div className={`summary-value ${weightedSpread < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(weightedSpread)}</div></div>
        <div className="summary-card"><div className="summary-label">Margin %</div><div className={`summary-value ${weightedMarginPct < 0 ? "text-rose-700" : "text-emerald-700"}`}>{pct(weightedMarginPct)}</div></div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 print:hidden">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode("matrix")} className={mode === "matrix" ? "btn-primary" : "btn-secondary"}><Table2 className="h-3.5 w-3.5" /> Godown Matrix</button>
          <button type="button" onClick={() => setMode("commercial")} className={mode === "commercial" ? "btn-primary" : "btn-secondary"}><TrendingUp className="h-3.5 w-3.5" /> Rates & Margin</button>
          <button type="button" onClick={() => setMode("history")} className={mode === "history" ? "btn-primary" : "btn-secondary"}><CalendarDays className="h-3.5 w-3.5" /> Historical Stock</button>
          <button type="button" onClick={() => setMode("exceptions")} className={mode === "exceptions" ? "btn-primary" : "btn-secondary"}><AlertTriangle className="h-3.5 w-3.5" /> Exceptions</button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <input className="input lg:col-span-2" placeholder="Search Sarya, TR, size, grade, SKU..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input" value={group} onChange={(e) => setGroup(e.target.value)}><option value="all">All Steel Groups</option>{groups.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          {(mode === "matrix" || mode === "history" || mode === "exceptions") && <select className="input" value={godown} onChange={(e) => setGodown(e.target.value)}><option value="all">All Godowns</option>{godowns.map((x) => <option key={x} value={x}>{x}</option>)}</select>}
          {mode === "commercial" && <><input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /><input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></>}
          {mode === "history" && <input className="input" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />}
        </div>
      </div>

      {(loading || periodLoading) ? <div className="rounded-xl border bg-white p-10 text-center text-sm font-bold text-slate-500">Loading steel stock report…</div> : mode === "matrix" ? (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{groupTotals.map((g) => <div key={g.name} className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{g.name}</div><div className="mt-1 text-lg font-black text-slate-950">{qty(g.qty)}</div><div className="text-[10px] font-bold text-slate-500">{g.items} items · {money(g.value)}</div></div>)}</div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-50"><tr><th className="p-2 text-left">Group</th><th className="p-2 text-left">Item</th><th className="p-2 text-left">Grade / Size</th>{godowns.map((g) => <th key={g} className="p-2 text-right">{g}</th>)}<th className="p-2 text-right">Total</th><th className="p-2 text-right">Value</th></tr></thead><tbody>{matrixRows.map((r) => <tr key={r.item_id} className="border-t border-slate-100"><td className="p-2 font-black">{r.group}</td><td className="p-2"><div className="font-bold">{r.item_name}</div><div className="text-[10px] text-slate-400">{r.sku}</div></td><td className="p-2">{[r.grade, r.size].filter(Boolean).join(" / ") || "—"}</td>{godowns.map((g) => <td key={g} className={`p-2 text-right ${n(r[g]) < 0 ? "font-black text-rose-700" : ""}`}>{qty(r[g])}</td>)}<td className={`p-2 text-right font-black ${n(r.total) < 0 ? "text-rose-700" : ""}`}>{qty(r.total)}</td><td className="p-2 text-right font-bold">{money(r.value)}</td></tr>)}</tbody></table></div></div>
        </div>
      ) : mode === "commercial" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 p-3 text-xs font-bold text-slate-600">Weighted commercial performance · {fromDate} to {toDate}</div><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-50"><tr><th className="p-2 text-left">Group</th><th className="p-2 text-left">Item</th><th className="p-2 text-left">Grade / Size</th><th className="p-2 text-right">Purchase Qty</th><th className="p-2 text-right">Purchase Avg</th><th className="p-2 text-right">Sale Qty</th><th className="p-2 text-right">Sale Avg</th><th className="p-2 text-right">Spread</th><th className="p-2 text-right">Margin %</th></tr></thead><tbody>{filteredCommercial.map((r) => <tr key={r.item_id} className="border-t border-slate-100"><td className="p-2 font-black">{steelGroup(r)}</td><td className="p-2"><div className="font-bold">{r.item_name}</div><div className="text-[10px] text-slate-400">{r.sku}</div></td><td className="p-2">{[r.grade, r.size].filter(Boolean).join(" / ") || "—"}</td><td className="p-2 text-right">{qty(r.net_purchase_qty)}</td><td className="p-2 text-right">{money(r.avg_purchase_rate)}</td><td className="p-2 text-right">{qty(r.net_sales_qty)}</td><td className="p-2 text-right">{money(r.avg_sale_rate)}</td><td className={`p-2 text-right font-black ${n(r.rate_spread) < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(r.rate_spread)}</td><td className={`p-2 text-right font-black ${n(r.margin_percent) < 0 ? "text-rose-700" : "text-emerald-700"}`}>{pct(r.margin_percent)}</td></tr>)}</tbody></table></div></div>
      ) : mode === "history" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 p-3 text-xs font-bold text-slate-600">Historical book stock as of {asOfDate}</div><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-50"><tr><th className="p-2 text-left">Group</th><th className="p-2 text-left">Item</th><th className="p-2 text-left">Grade / Size</th><th className="p-2 text-left">Godown</th><th className="p-2 text-right">Book Qty</th><th className="p-2 text-left">Last Movement</th></tr></thead><tbody>{filteredHistory.map((r, i) => <tr key={`${r.item_id}-${r.godown_id}-${i}`} className="border-t border-slate-100"><td className="p-2 font-black">{steelGroup(r)}</td><td className="p-2"><div className="font-bold">{r.item_name}</div><div className="text-[10px] text-slate-400">{r.sku}</div></td><td className="p-2">{[r.grade, r.size].filter(Boolean).join(" / ") || "—"}</td><td className="p-2">{r.godown || "Unassigned"}</td><td className={`p-2 text-right font-black ${n(r.book_quantity) < 0 ? "text-rose-700" : ""}`}>{qty(r.book_quantity)}</td><td className="p-2">{r.last_movement_at ? new Date(r.last_movement_at).toLocaleString() : "—"}</td></tr>)}</tbody></table></div></div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-rose-200 bg-white"><div className="border-b border-rose-100 bg-rose-50 p-3 text-xs font-black text-rose-800">Negative stock and reconciliation exceptions</div><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-50"><tr><th className="p-2 text-left">Problem</th><th className="p-2 text-left">Group</th><th className="p-2 text-left">Item</th><th className="p-2 text-left">Godown</th><th className="p-2 text-right">Book</th><th className="p-2 text-right">Current</th><th className="p-2 text-right">Variance</th><th className="p-2 text-left">Last Movement</th></tr></thead><tbody>{exceptions.map((r, i) => <tr key={`${r.item_id}-${r.godown_id}-${i}`} className="border-t border-slate-100"><td className="p-2 font-black text-rose-700"><AlertTriangle className="mr-1 inline h-3 w-3" />{n(r.current_quantity) < 0 ? "Negative Stock" : "Variance"}</td><td className="p-2 font-black">{steelGroup(r)}</td><td className="p-2"><div className="font-bold">{r.item_name}</div><div className="text-[10px] text-slate-400">{r.sku}</div></td><td className="p-2">{r.godown || "Unassigned"}</td><td className="p-2 text-right">{qty(r.book_quantity)}</td><td className={`p-2 text-right font-black ${n(r.current_quantity) < 0 ? "text-rose-700" : ""}`}>{qty(r.current_quantity)}</td><td className="p-2 text-right font-black text-rose-700">{qty(r.variance_quantity)}</td><td className="p-2">{r.last_movement_at ? new Date(r.last_movement_at).toLocaleString() : "—"}</td></tr>)}</tbody></table></div></div>
      )}
    </div>
  );
}
