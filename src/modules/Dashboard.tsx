import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Banknote, Boxes, Factory, FilePlus2, RefreshCw, ShoppingCart, WalletCards } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Stats = { sales:number; purchases:number; receivables:number; payables:number; inventoryQty:number; pendingWorkOrders:number; stockAlerts:number };
const EMPTY:Stats={sales:0,purchases:0,receivables:0,payables:0,inventoryQty:0,pendingWorkOrders:0,stockAlerts:0};
const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:0};
const money=(v:number)=>`Rs ${new Intl.NumberFormat("en-PK",{maximumFractionDigits:0}).format(v)}`;

export default function Dashboard(){
 const navigate=useNavigate(); const [stats,setStats]=useState<Stats>(EMPTY); const [loading,setLoading]=useState(true); const [updatedAt,setUpdatedAt]=useState<Date|null>(null);
 const load=useCallback(async()=>{setLoading(true);try{
  const [sr,pr,st,wr]=await Promise.all([
   supabase.from("sales_orders").select("status,total,outstanding_amount"),
   supabase.from("purchase_orders").select("status,total,outstanding_amount"),
   supabase.from("warehouse_stock").select("quantity"),
   supabase.from("work_orders").select("status")]);
  const sales=(sr.data??[]) as any[], purchases=(pr.data??[]) as any[], stock=(st.data??[]) as any[], work=(wr.data??[]) as any[];
  const posted=(s:unknown)=>["posted","closed"].includes(String(s??"").toLowerCase());
  setStats({sales:sales.filter(r=>posted(r.status)).reduce((a,r)=>a+n(r.total),0),purchases:purchases.filter(r=>posted(r.status)).reduce((a,r)=>a+n(r.total),0),receivables:sales.filter(r=>posted(r.status)).reduce((a,r)=>a+n(r.outstanding_amount),0),payables:purchases.filter(r=>posted(r.status)).reduce((a,r)=>a+n(r.outstanding_amount),0),inventoryQty:stock.reduce((a,r)=>a+n(r.quantity),0),pendingWorkOrders:work.filter(r=>!["completed","closed"].includes(String(r.status??"").toLowerCase())).length,stockAlerts:stock.filter(r=>n(r.quantity)<=0).length}); setUpdatedAt(new Date());
 }finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);
 const cards=[
  {label:"Sales / سیلز",value:money(stats.sales),icon:ShoppingCart,to:"/sales"},
  {label:"Receivables / وصولیاں",value:money(stats.receivables),icon:WalletCards,to:"/accounting/customer-invoice-statement"},
  {label:"Payables / واجبات",value:money(stats.payables),icon:Banknote,to:"/purchase"},
  {label:"Stock Qty / موجودہ اسٹاک",value:new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(stats.inventoryQty),icon:Boxes,to:"/godown"}];
 return <div className="mx-auto max-w-[1500px] space-y-4 p-4 lg:p-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-black text-slate-950">Business Overview / کاروباری خلاصہ</h1><p className="mt-0.5 text-xs font-semibold text-slate-500">Essential information only. Use the search above to find and open records quickly.</p></div><button type="button" onClick={()=>void load()} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/> Refresh</button></div>
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(c=>{const Icon=c.icon;return <button key={c.label} type="button" onClick={()=>navigate(c.to)} className="group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"><div className="flex items-center justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Icon className="h-4 w-4"/></span><ArrowRight className="h-4 w-4 text-slate-300"/></div><div className="mt-4 text-[11px] font-black uppercase tracking-wide text-slate-500">{c.label}</div><div className="mt-1 truncate text-xl font-black tabular-nums text-slate-950">{loading?"…":c.value}</div></button>})}</div>
  <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
   <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-sm font-black text-slate-900">Quick Actions / فوری کام</h2><p className="text-xs font-semibold text-slate-500">Most-used ERP actions.</p></div>{updatedAt&&<span className="text-[10px] font-semibold text-slate-400">Updated {updatedAt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}</div><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
    <button type="button" onClick={()=>navigate("/sales/new")} className="flex min-h-16 items-center gap-3 rounded-lg border border-slate-200 px-3 text-left hover:bg-blue-50"><FilePlus2 className="h-5 w-5 text-blue-600"/><span className="text-xs font-black">New Sales Invoice</span></button>
    <button type="button" onClick={()=>navigate("/purchase/new")} className="flex min-h-16 items-center gap-3 rounded-lg border border-slate-200 px-3 text-left hover:bg-blue-50"><ShoppingCart className="h-5 w-5 text-blue-600"/><span className="text-xs font-black">New Purchase</span></button>
    <button type="button" onClick={()=>navigate("/accounting")} className="flex min-h-16 items-center gap-3 rounded-lg border border-slate-200 px-3 text-left hover:bg-blue-50"><Banknote className="h-5 w-5 text-blue-600"/><span className="text-xs font-black">Accounting</span></button>
    <button type="button" onClick={()=>navigate("/production")} className="flex min-h-16 items-center gap-3 rounded-lg border border-slate-200 px-3 text-left hover:bg-blue-50"><Factory className="h-5 w-5 text-blue-600"/><span className="text-xs font-black">Work Orders</span></button>
   </div></section>
   <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-sm font-black text-slate-900">Attention / توجہ</h2><div className="mt-3 space-y-2">
    <button type="button" onClick={()=>navigate("/godown")} className="flex w-full items-center justify-between rounded-lg bg-amber-50 px-3 py-3 text-left"><span className="flex items-center gap-2 text-xs font-black text-amber-900"><AlertTriangle className="h-4 w-4"/> Zero / Negative Stock</span><span className="rounded-md bg-white px-2 py-1 text-xs font-black text-amber-900">{loading?"…":stats.stockAlerts}</span></button>
    <button type="button" onClick={()=>navigate("/production")} className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-3 text-left"><span className="flex items-center gap-2 text-xs font-black text-slate-800"><Factory className="h-4 w-4"/> Pending Work Orders</span><span className="rounded-md bg-white px-2 py-1 text-xs font-black">{loading?"…":stats.pendingWorkOrders}</span></button>
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-3"><span className="text-xs font-black">Purchases / خریداری</span><span className="text-xs font-black tabular-nums">{loading?"…":money(stats.purchases)}</span></div>
   </div></section>
  </div>
 </div>
}
