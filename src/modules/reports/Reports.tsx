import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Boxes, Download, Printer, RefreshCw, TrendingUp, Users, Truck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ErrorBanner, formatCurrency } from "@/components/ui";

type Tab = "sales" | "stock" | "receivables" | "charges" | "gatepass";
const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const gatePassStatusLabel: Record<string, string> = {
  issued: "Token Issued / ٹوکن جاری",
  tare_weighed: "1st Kanta Done / پہلا کانٹا مکمل",
  loading: "Loading Done / لوڈنگ مکمل",
  weighed: "2nd Kanta Done / دوسرا کانٹا مکمل",
  finalized: "Final Gate Pass / فائنل گیٹ پاس",
  cancelled: "Cancelled / منسوخ",
};

export default function Reports() {
  const [tab, setTab] = useState<Tab>("sales");
  const [sales, setSales] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [receivables, setReceivables] = useState<any[]>([]);
  const [charges, setCharges] = useState<any[]>([]);
  const [gatePasses, setGatePasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gpFrom, setGpFrom] = useState(monthStart());
  const [gpTo, setGpTo] = useState(today());
  const [gpStatus, setGpStatus] = useState("all");
  const [gpSearch, setGpSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [s, st, r, c, gp] = await Promise.all([
      supabase.from("sales_margin_report").select("*").order("invoice_date", { ascending: false }).limit(5000),
      supabase.from("stock_godown_report").select("*").order("item_name").limit(10000),
      supabase.from("sales_invoice_financials").select("*").gt("outstanding_amount", 0).order("overdue_days", { ascending: false }).limit(10000),
      supabase.from("service_party_balance_report").select("*").order("charges_total", { ascending: false }),
      supabase.from("gate_passes").select("id,pass_no,pass_date,customer_name,vehicle_no,driver_name,loaded_by_name,tare_weight,gross_weight,net_weight,status,token_notes,created_at,finalized_at,gate_pass_lines(item_description,requested_qty,actual_qty,uom,remarks,warehouse:warehouses(name),godown:godowns(name))").order("pass_date", { ascending: false }).limit(10000),
    ]);
    const firstError = [s, st, r, c, gp].find((x) => x.error)?.error;
    if (firstError) setError(firstError.message);
    setSales(s.data ?? []); setStock(st.data ?? []); setReceivables(r.data ?? []); setCharges(c.data ?? []); setGatePasses(gp.data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const salesSummary = useMemo(() => sales.reduce((a, r) => ({ sales: a.sales+n(r.sales_amount), cost:a.cost+n(r.cost_amount), profit:a.profit+n(r.gross_profit) }), {sales:0,cost:0,profit:0}), [sales]);
  const stockSummary = useMemo(() => stock.reduce((a,r)=>({qty:a.qty+n(r.quantity),value:a.value+n(r.stock_value)}),{qty:0,value:0}),[stock]);
  const receivableSummary = useMemo(() => receivables.reduce((a,r)=>({out:a.out+n(r.outstanding_amount),today:a.today+n(r.today_received)}),{out:0,today:0}),[receivables]);

  const filteredGatePasses = useMemo(() => {
    const q = gpSearch.trim().toLowerCase();
    return gatePasses.filter((g) => {
      if (gpFrom && String(g.pass_date || "") < gpFrom) return false;
      if (gpTo && String(g.pass_date || "") > gpTo) return false;
      if (gpStatus !== "all" && g.status !== gpStatus) return false;
      if (!q) return true;
      const lineText = (g.gate_pass_lines || []).map((l:any) => `${l.item_description || ""} ${l.warehouse?.name || ""} ${l.godown?.name || ""}`).join(" ");
      return `${g.pass_no || ""} ${g.customer_name || ""} ${g.vehicle_no || ""} ${g.driver_name || ""} ${g.loaded_by_name || ""} ${lineText}`.toLowerCase().includes(q);
    });
  }, [gatePasses, gpFrom, gpTo, gpStatus, gpSearch]);

  const gatePassSummary = useMemo(() => filteredGatePasses.reduce((a,g) => ({
    total: a.total + 1,
    finalized: a.finalized + (g.status === "finalized" ? 1 : 0),
    loading: a.loading + (["loading","weighed"].includes(g.status) ? 1 : 0),
    net: a.net + n(g.net_weight),
  }), { total:0, finalized:0, loading:0, net:0 }), [filteredGatePasses]);

  const gatePassMaterials = (g:any) => (g.gate_pass_lines || []).map((l:any) => {
    const actual = n(l.actual_qty);
    const qty = actual > 0 ? actual : n(l.requested_qty);
    return `${l.item_description || "—"}${qty ? ` (${qty.toLocaleString()} ${l.uom || ""})` : ""}`;
  }).join("; ");

  const gatePassLocations = (g:any) => Array.from(new Set((g.gate_pass_lines || []).map((l:any) => [l.warehouse?.name, l.godown?.name].filter(Boolean).join(" / ")).filter(Boolean))).join("; ");

  const exportCurrentReport = () => {
    let rows: Record<string, unknown>[] = [];
    let fileName = "report";

    if (tab === "sales") {
      fileName = "Sales_Margin_Report";
      rows = sales.map((r) => ({ Invoice:r.invoice_no ?? "", Customer:r.customer_name ?? "", Salesperson:r.sales_person ?? "", Sales:n(r.sales_amount), Cost:n(r.cost_amount), Profit:n(r.gross_profit), "Margin %":n(r.margin_percent) }));
    } else if (tab === "stock") {
      fileName = "Stock_Godown_Report";
      rows = stock.map((r) => ({ Item:r.item_name ?? "", Grade:r.grade ?? "", Godown:r.godown ?? "", Quantity:n(r.quantity), "Stock Value":n(r.stock_value) }));
    } else if (tab === "receivables") {
      fileName = "Receivables_Aging_Report";
      rows = receivables.map((r) => ({ Invoice:r.invoice_no ?? "", Customer:r.customer_name ?? "", "Invoice Amount":n(r.invoice_amount), Paid:n(r.paid_amount), Outstanding:n(r.outstanding_amount), "Overdue Days":n(r.overdue_days) }));
    } else if (tab === "charges") {
      fileName = "Service_Charges_Report";
      rows = charges.map((r) => ({ Party:r.name ?? "", Type:r.party_type ?? "", Charges:n(r.charges_total) }));
    } else {
      fileName = `Gate_Pass_Report_${gpFrom || "all"}_to_${gpTo || "all"}`;
      rows = filteredGatePasses.map((g) => ({
        "GP No": g.pass_no ?? "",
        Date: g.pass_date ?? "",
        Customer: g.customer_name ?? "",
        Vehicle: g.vehicle_no ?? "",
        Driver: g.driver_name ?? "",
        Loader: g.loaded_by_name ?? "",
        Status: gatePassStatusLabel[g.status] ?? g.status ?? "",
        "Tare Kg": n(g.tare_weight),
        "Gross Kg": n(g.gross_weight),
        "Net Kg": n(g.net_weight),
        Materials: gatePassMaterials(g),
        "Warehouse / Godown": gatePassLocations(g),
        Instructions: g.token_notes ?? "",
      }));
    }

    if (!rows.length) { setError("No report data to export / ایکسپورٹ کرنے کے لیے ڈیٹا موجود نہیں۔"); return; }
    const headers = Object.keys(rows[0]);
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `${fileName}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  const printCurrentReport = () => window.print();

  return <div className="space-y-4 pb-12">
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="flex items-center gap-2 text-xl font-bold text-slate-900"><BarChart3 className="h-5 w-5 text-blue-600"/> Reports / رپورٹس</h1><p className="mt-1 text-xs text-slate-500">Management reports, gate passes, stock and profitability — انتظامی رپورٹس، گیٹ پاس، اسٹاک اور منافع</p></div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button onClick={exportCurrentReport} className="btn-secondary"><Download className="h-3.5 w-3.5"/>Excel / CSV</button>
        <button onClick={printCurrentReport} className="btn-secondary"><Printer className="h-3.5 w-3.5"/>Print / PDF</button>
        <button onClick={() => void load()} className="btn-secondary"><RefreshCw className="h-3.5 w-3.5"/>Refresh / تازہ کریں</button>
      </div>
    </div>
    {error && <ErrorBanner message={error}/>} 
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5 print:hidden">
      <button onClick={()=>setTab("sales")} className={`rounded-lg border p-3 text-left ${tab==="sales"?"border-blue-300 bg-blue-50":"border-slate-200 bg-white"}`}><TrendingUp className="h-4 w-4 text-blue-600"/><div className="mt-2 text-xs font-bold">Sales & Margin / فروخت اور مارجن</div></button>
      <button onClick={()=>setTab("stock")} className={`rounded-lg border p-3 text-left ${tab==="stock"?"border-blue-300 bg-blue-50":"border-slate-200 bg-white"}`}><Boxes className="h-4 w-4 text-emerald-600"/><div className="mt-2 text-xs font-bold">Stock / Godown / اسٹاک اور گودام</div></button>
      <button onClick={()=>setTab("receivables")} className={`rounded-lg border p-3 text-left ${tab==="receivables"?"border-blue-300 bg-blue-50":"border-slate-200 bg-white"}`}><Users className="h-4 w-4 text-amber-600"/><div className="mt-2 text-xs font-bold">Receivables / وصولیاں</div></button>
      <button onClick={()=>setTab("charges")} className={`rounded-lg border p-3 text-left ${tab==="charges"?"border-blue-300 bg-blue-50":"border-slate-200 bg-white"}`}><BarChart3 className="h-4 w-4 text-violet-600"/><div className="mt-2 text-xs font-bold">Service Charges / سروس چارجز</div></button>
      <button onClick={()=>setTab("gatepass")} className={`rounded-lg border p-3 text-left ${tab==="gatepass"?"border-blue-300 bg-blue-50":"border-slate-200 bg-white"}`}><Truck className="h-4 w-4 text-cyan-700"/><div className="mt-2 text-xs font-bold">Gate Pass / گیٹ پاس</div><div className="text-[11px] text-slate-400">Loading & Kanta Report</div></button>
    </div>

    {loading ? <div className="rounded-lg border bg-white p-8 text-center text-xs text-slate-400">Loading reports / رپورٹس لوڈ ہو رہی ہیں…</div> : tab === "gatepass" ? <div className="space-y-3">
      <div className="rounded-lg border bg-white p-3 print:hidden">
        <div className="grid gap-2 md:grid-cols-4">
          <div><label className="mb-1 block text-[11px] font-semibold text-slate-500">From / سے</label><input type="date" className="input w-full" value={gpFrom} onChange={(e)=>setGpFrom(e.target.value)}/></div>
          <div><label className="mb-1 block text-[11px] font-semibold text-slate-500">To / تک</label><input type="date" className="input w-full" value={gpTo} onChange={(e)=>setGpTo(e.target.value)}/></div>
          <div><label className="mb-1 block text-[11px] font-semibold text-slate-500">Status / حالت</label><select className="input w-full" value={gpStatus} onChange={(e)=>setGpStatus(e.target.value)}><option value="all">All Statuses / تمام</option>{Object.entries(gatePassStatusLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="mb-1 block text-[11px] font-semibold text-slate-500">Search / تلاش</label><input className="input w-full" placeholder="GP, customer, vehicle, material..." value={gpSearch} onChange={(e)=>setGpSearch(e.target.value)}/></div>
        </div>
      </div>
      <div className="rounded-lg border bg-white overflow-hidden">
        <div className="border-b p-3"><div className="text-sm font-bold">Gate Pass Report / گیٹ پاس رپورٹ</div><div className="text-[11px] text-slate-500">{gpFrom || "All"} — {gpTo || "All"}</div></div>
        <div className="grid grid-cols-2 gap-2 border-b p-3 md:grid-cols-4">
          <div><span className="text-[11px] text-slate-400">Total GP / کل</span><div className="font-bold">{gatePassSummary.total}</div></div>
          <div><span className="text-[11px] text-slate-400">Finalized / فائنل</span><div className="font-bold text-blue-700">{gatePassSummary.finalized}</div></div>
          <div><span className="text-[11px] text-slate-400">In Process / زیر عمل</span><div className="font-bold text-emerald-700">{gatePassSummary.loading}</div></div>
          <div><span className="text-[11px] text-slate-400">Net Material / خالص مال</span><div className="font-bold">{gatePassSummary.net.toLocaleString()} kg</div></div>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead className="bg-slate-50"><tr><th className="p-2 text-left">GP No.</th><th className="p-2 text-left">Date / تاریخ</th><th className="p-2 text-left">Customer / گاہک</th><th className="p-2 text-left">Vehicle / گاڑی</th><th className="p-2 text-left">Material / مال</th><th className="p-2 text-left">Warehouse / Godown</th><th className="p-2 text-left">Loader / لوڈر</th><th className="p-2 text-right">Tare</th><th className="p-2 text-right">Gross</th><th className="p-2 text-right">Net</th><th className="p-2 text-left">Status / حالت</th></tr></thead><tbody>{filteredGatePasses.map(g=><tr key={g.id} className="border-t align-top"><td className="p-2 font-semibold">{g.pass_no}</td><td className="p-2 whitespace-nowrap">{g.pass_date}</td><td className="p-2">{g.customer_name || "—"}</td><td className="p-2">{g.vehicle_no || "—"}</td><td className="p-2 min-w-[220px]">{gatePassMaterials(g) || "—"}</td><td className="p-2 min-w-[160px]">{gatePassLocations(g) || "—"}</td><td className="p-2">{g.loaded_by_name || "—"}</td><td className="p-2 text-right">{n(g.tare_weight).toLocaleString()}</td><td className="p-2 text-right">{n(g.gross_weight).toLocaleString()}</td><td className="p-2 text-right font-semibold">{n(g.net_weight).toLocaleString()}</td><td className="p-2 min-w-[150px]">{gatePassStatusLabel[g.status] || g.status}</td></tr>)}</tbody></table></div>
        {!filteredGatePasses.length && <div className="p-8 text-center text-xs text-slate-400">No Gate Pass records found / کوئی گیٹ پاس ریکارڈ نہیں ملا۔</div>}
      </div>
    </div> : tab === "sales" ? <div className="rounded-lg border bg-white overflow-hidden"><div className="grid grid-cols-3 gap-2 border-b p-3"><div><span className="text-[12px] text-slate-400">Sales / فروخت</span><div className="font-bold">{formatCurrency(salesSummary.sales)}</div></div><div><span className="text-[12px] text-slate-400">Cost / لاگت</span><div className="font-bold">{formatCurrency(salesSummary.cost)}</div></div><div><span className="text-[12px] text-slate-400">Gross Profit / مجموعی منافع</span><div className="font-bold text-emerald-700">{formatCurrency(salesSummary.profit)}</div></div></div><div className="overflow-x-auto"><table className="w-full text-[12px]"><thead className="bg-slate-50"><tr><th className="p-2 text-left">Invoice / انوائس</th><th className="p-2 text-left">Customer / گاہک</th><th className="p-2 text-left">Salesperson / سیلز پرسن</th><th className="p-2 text-right">Sales / فروخت</th><th className="p-2 text-right">Cost / لاگت</th><th className="p-2 text-right">Profit / نفع</th><th className="p-2 text-right">Margin %</th></tr></thead><tbody>{sales.map(r=><tr key={r.sales_order_id} className="border-t"><td className="p-2 font-semibold">{r.invoice_no}</td><td className="p-2">{r.customer_name||"—"}</td><td className="p-2">{r.sales_person||"—"}</td><td className="p-2 text-right">{formatCurrency(n(r.sales_amount))}</td><td className="p-2 text-right">{formatCurrency(n(r.cost_amount))}</td><td className="p-2 text-right text-emerald-700">{formatCurrency(n(r.gross_profit))}</td><td className="p-2 text-right">{n(r.margin_percent).toFixed(2)}%</td></tr>)}</tbody></table></div></div> : tab === "stock" ? <div className="rounded-lg border bg-white overflow-hidden"><div className="grid grid-cols-2 gap-2 border-b p-3"><div><span className="text-[12px] text-slate-400">Quantity / مقدار</span><div className="font-bold">{stockSummary.qty.toLocaleString()}</div></div><div><span className="text-[12px] text-slate-400">Stock Value / اسٹاک مالیت</span><div className="font-bold">{formatCurrency(stockSummary.value)}</div></div></div><div className="overflow-x-auto"><table className="w-full text-[12px]"><thead className="bg-slate-50"><tr><th className="p-2 text-left">Item / آئٹم</th><th className="p-2 text-left">Grade / گریڈ</th><th className="p-2 text-left">Godown / گودام</th><th className="p-2 text-right">Qty / مقدار</th><th className="p-2 text-right">Value / مالیت</th></tr></thead><tbody>{stock.map((r,i)=><tr key={`${r.item_id}-${r.godown}-${i}`} className="border-t"><td className="p-2">{r.item_name}</td><td className="p-2">{r.grade||"—"}</td><td className="p-2 font-semibold">{r.godown}</td><td className="p-2 text-right">{n(r.quantity).toLocaleString()}</td><td className="p-2 text-right">{formatCurrency(n(r.stock_value))}</td></tr>)}</tbody></table></div></div> : tab === "receivables" ? <div className="rounded-lg border bg-white overflow-hidden"><div className="grid grid-cols-2 gap-2 border-b p-3"><div><span className="text-[12px] text-slate-400">Outstanding / بقایا</span><div className="font-bold text-rose-700">{formatCurrency(receivableSummary.out)}</div></div><div><span className="text-[12px] text-slate-400">Today's Received / آج کی وصولی</span><div className="font-bold text-emerald-700">{formatCurrency(receivableSummary.today)}</div></div></div><div className="overflow-x-auto"><table className="w-full text-[12px]"><thead className="bg-slate-50"><tr><th className="p-2 text-left">Invoice / انوائس</th><th className="p-2 text-left">Customer / گاہک</th><th className="p-2 text-right">Invoice / انوائس</th><th className="p-2 text-right">Paid / ادا شدہ</th><th className="p-2 text-right">Outstanding / بقایا</th><th className="p-2 text-right">Overdue Days / زائد المیعاد دن</th></tr></thead><tbody>{receivables.map(r=><tr key={r.sales_order_id} className="border-t"><td className="p-2 font-semibold">{r.invoice_no}</td><td className="p-2">{r.customer_name}</td><td className="p-2 text-right">{formatCurrency(n(r.invoice_amount))}</td><td className="p-2 text-right text-emerald-700">{formatCurrency(n(r.paid_amount))}</td><td className="p-2 text-right text-rose-700">{formatCurrency(n(r.outstanding_amount))}</td><td className="p-2 text-right">{n(r.overdue_days)}</td></tr>)}</tbody></table></div></div> : <div className="rounded-lg border bg-white overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-[12px]"><thead className="bg-slate-50"><tr><th className="p-2 text-left">Party / پارٹی</th><th className="p-2 text-left">Type / قسم</th><th className="p-2 text-right">Charges / چارجز</th></tr></thead><tbody>{charges.map(r=><tr key={r.service_party_id} className="border-t"><td className="p-2 font-semibold">{r.name}</td><td className="p-2 capitalize">{r.party_type}</td><td className="p-2 text-right">{formatCurrency(n(r.charges_total))}</td></tr>)}</tbody></table></div></div>}
  </div>;
}
