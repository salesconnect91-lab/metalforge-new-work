import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Banknote, Boxes, Factory, FileBarChart, FilePlus2, PackageSearch, RefreshCw, ShoppingCart, TrendingUp, WalletCards } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/lib/supabase";

type OrderRow={status?:string|null;total?:number|string|null;outstanding_amount?:number|string|null;created_at?:string|null};
type StockRow={quantity?:number|string|null};
type WorkRow={status?:string|null;created_at?:string|null};
type Stats={sales:number;purchases:number;receivables:number;payables:number;inventoryQty:number;pendingWorkOrders:number;stockAlerts:number};
const EMPTY:Stats={sales:0,purchases:0,receivables:0,payables:0,inventoryQty:0,pendingWorkOrders:0,stockAlerts:0};
const COLORS=["#2563eb","#16a34a","#f59e0b"];
const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:0};
const money=(v:number)=>`Rs ${new Intl.NumberFormat("en-PK",{maximumFractionDigits:0}).format(v)}`;
const posted=(v:unknown)=>["posted","closed"].includes(String(v??"").toLowerCase());
const monthKey=(v?:string|null)=>{const d=v?new Date(v):null;return d&&!Number.isNaN(d.getTime())?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`:null};

function Panel({title,action,children,className=""}:{title:string;action?:ReactNode;children:ReactNode;className?:string}){
 return <section className={`min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}><div className="flex min-h-11 items-center justify-between gap-3 border-b border-slate-200 px-4 py-2"><h2 className="text-xs font-black text-slate-900">{title}</h2>{action}</div><div className="p-3">{children}</div></section>
}

export default function Dashboard(){
 const navigate=useNavigate();
 const [stats,setStats]=useState<Stats>(EMPTY);
 const [salesRows,setSalesRows]=useState<OrderRow[]>([]);
 const [purchaseRows,setPurchaseRows]=useState<OrderRow[]>([]);
 const [workRows,setWorkRows]=useState<WorkRow[]>([]);
 const [loading,setLoading]=useState(true);
 const [updatedAt,setUpdatedAt]=useState<Date|null>(null);

 const load=useCallback(async()=>{setLoading(true);try{
  const [sr,pr,st,wr]=await Promise.all([
   supabase.from("sales_orders").select("status,total,outstanding_amount,created_at"),
   supabase.from("purchase_orders").select("status,total,outstanding_amount,created_at"),
   supabase.from("warehouse_stock").select("quantity"),
   supabase.from("work_orders").select("status,created_at")]);
  const sales=((sr.data??[]) as OrderRow[]).filter(r=>posted(r.status));
  const purchases=((pr.data??[]) as OrderRow[]).filter(r=>posted(r.status));
  const stock=(st.data??[]) as StockRow[],work=(wr.data??[]) as WorkRow[];
  setSalesRows(sales);setPurchaseRows(purchases);setWorkRows(work);
  setStats({sales:sales.reduce((a,r)=>a+n(r.total),0),purchases:purchases.reduce((a,r)=>a+n(r.total),0),receivables:sales.reduce((a,r)=>a+n(r.outstanding_amount),0),payables:purchases.reduce((a,r)=>a+n(r.outstanding_amount),0),inventoryQty:stock.reduce((a,r)=>a+n(r.quantity),0),pendingWorkOrders:work.filter(r=>!["completed","closed"].includes(String(r.status??"").toLowerCase())).length,stockAlerts:stock.filter(r=>n(r.quantity)<=0).length});
  setUpdatedAt(new Date());
 }finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);

 const trend=useMemo(()=>{const today=new Date();const rows=Array.from({length:6},(_,i)=>{const d=new Date(today.getFullYear(),today.getMonth()-(5-i),1);return{key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`,month:d.toLocaleDateString("en",{month:"short"}),sales:0,purchase:0}});const map=new Map(rows.map(r=>[r.key,r]));salesRows.forEach(r=>{const x=map.get(monthKey(r.created_at)??"");if(x)x.sales+=n(r.total)});purchaseRows.forEach(r=>{const x=map.get(monthKey(r.created_at)??"");if(x)x.purchase+=n(r.total)});return rows},[salesRows,purchaseRows]);
 const profitTrend=trend.map(r=>({...r,gross:r.sales-r.purchase,net:(r.sales-r.purchase)*.86}));
 const grossProfit=stats.sales-stats.purchases;
 const kpis:Array<{label:string;urdu:string;value:string;icon:ComponentType<{className?:string}>;color:string;to:string}>=[
  {label:"Sales Revenue",urdu:"فروخت",value:money(stats.sales),icon:ShoppingCart,color:"bg-blue-600",to:"/sales"},
  {label:"Receivables",urdu:"قابل وصول",value:money(stats.receivables),icon:WalletCards,color:"bg-emerald-600",to:"/accounting/customer-invoice-statement"},
  {label:"Purchases",urdu:"خریداری",value:money(stats.purchases),icon:Banknote,color:"bg-amber-500",to:"/purchase"},
  {label:"Payables",urdu:"قابل ادائیگی",value:money(stats.payables),icon:FileBarChart,color:"bg-violet-600",to:"/purchase"},
  {label:"Stock Quantity",urdu:"موجودہ اسٹاک",value:stats.inventoryQty.toLocaleString(),icon:Boxes,color:"bg-cyan-600",to:"/godown"},
  {label:"Gross Margin",urdu:"مجموعی منافع",value:money(grossProfit),icon:TrendingUp,color:"bg-rose-600",to:"/accounting/profit-loss"}];
 const stockMix=[{name:"Stock Qty",value:Math.max(stats.inventoryQty,0)},{name:"Alerts",value:stats.stockAlerts},{name:"Pending W/O",value:stats.pendingWorkOrders}].filter(x=>x.value>0);
 const linkClass="inline-flex h-8 items-center rounded-md border border-blue-200 bg-blue-50 px-3 text-[10px] font-black text-blue-700 hover:bg-blue-100";

 return <div className="mx-auto max-w-[1600px] space-y-3 p-3 lg:p-4">
  <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-lg font-black text-slate-950">Business Overview / کاروباری خلاصہ</h1><p className="mt-0.5 text-[11px] font-semibold text-slate-500">Live financial, inventory and operational intelligence in one place.</p></div><div className="flex items-center gap-2"><span className="hidden text-[10px] font-bold text-emerald-700 sm:inline">● Live data{updatedAt?` · ${updatedAt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`:""}</span><button onClick={()=>void load()} disabled={loading} className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-[10px] font-black text-slate-700 shadow-sm"><RefreshCw className={`h-3.5 w-3.5 ${loading?"animate-spin":""}`}/>Refresh / تازہ کریں</button></div></div>

  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">{kpis.map(c=>{const Icon=c.icon;return <button key={c.label} onClick={()=>navigate(c.to)} className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"><div className="flex items-center gap-2"><span className={`flex h-8 w-8 items-center justify-center rounded-lg text-white ${c.color}`}><Icon className="h-4 w-4"/></span><div><div className="text-[10px] font-black uppercase tracking-wide text-slate-600">{c.label}</div><div className="text-[9px] font-semibold text-slate-400">{c.urdu}</div></div></div><div className="mt-3 truncate text-lg font-black tabular-nums text-slate-950">{loading?"…":c.value}</div><div className="mt-1 text-[9px] font-semibold text-slate-400">Click to view details</div></button>})}</div>

  <div className="grid gap-3 xl:grid-cols-[1fr_1fr_.78fr]">
   <Panel title="Sales vs Purchase (6 Months) / فروخت بمقابلہ خریداری"><div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={trend} margin={{top:8,right:8,left:-18,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:9}} tickFormatter={v=>`${Math.round(v/1000)}k`}/><Tooltip formatter={v=>money(n(v))}/><Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="sales" name="Sales" fill="#2563eb" radius={[3,3,0,0]}/><Bar dataKey="purchase" name="Purchase" fill="#10b981" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div></Panel>
   <Panel title="Profit & Loss Trend / منافع اور نقصان"><div className="h-56"><ResponsiveContainer width="100%" height="100%"><AreaChart data={profitTrend} margin={{top:8,right:8,left:-18,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:9}} tickFormatter={v=>`${Math.round(v/1000)}k`}/><Tooltip formatter={v=>money(n(v))}/><Legend wrapperStyle={{fontSize:10}}/><Area type="monotone" dataKey="gross" name="Gross" stroke="#7c3aed" fill="#ede9fe"/><Area type="monotone" dataKey="net" name="Net estimate" stroke="#16a34a" fill="#dcfce7"/></AreaChart></ResponsiveContainer></div></Panel>
   <Panel title="Daily Updates / روزانہ اپڈیٹس" action={<span className="text-[9px] font-bold text-slate-400">LIVE</span>}><div className="grid min-h-56 gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3"><button onClick={()=>navigate("/godown")} className="rounded-lg bg-amber-50 p-3 text-left text-[10px] font-bold text-amber-950"><AlertTriangle className="mb-2 h-4 w-4 text-amber-600"/>{stats.stockAlerts} stock item(s) need attention.</button><button onClick={()=>navigate("/production")} className="rounded-lg bg-blue-50 p-3 text-left text-[10px] font-bold text-blue-950"><Factory className="mb-2 h-4 w-4 text-blue-600"/>{stats.pendingWorkOrders} work order(s) currently pending.</button><button onClick={()=>navigate("/accounting/customer-invoice-statement")} className="rounded-lg bg-emerald-50 p-3 text-left text-[10px] font-bold text-emerald-950"><WalletCards className="mb-2 h-4 w-4 text-emerald-600"/>{money(stats.receivables)} customer receivables.</button></div></Panel>
  </div>

  <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
   <Panel title="Sales Summary / فروخت کا خلاصہ" action={<button onClick={()=>navigate("/sales")} className="text-[9px] font-black text-blue-700">Full Report →</button>}><div className="space-y-2 text-[10px]"><div className="flex justify-between border-b pb-2"><span>Posted documents</span><b>{salesRows.length}</b></div><div className="flex justify-between border-b pb-2"><span>Total sales</span><b>{money(stats.sales)}</b></div><div className="flex justify-between"><span>Outstanding</span><b className="text-amber-700">{money(stats.receivables)}</b></div></div></Panel>
   <Panel title="Purchase Summary / خریداری کا خلاصہ" action={<button onClick={()=>navigate("/purchase")} className="text-[9px] font-black text-blue-700">Full Report →</button>}><div className="space-y-2 text-[10px]"><div className="flex justify-between border-b pb-2"><span>Posted documents</span><b>{purchaseRows.length}</b></div><div className="flex justify-between border-b pb-2"><span>Total purchases</span><b>{money(stats.purchases)}</b></div><div className="flex justify-between"><span>Outstanding</span><b className="text-amber-700">{money(stats.payables)}</b></div></div></Panel>
   <Panel title="Stock Summary / اسٹاک خلاصہ"><div className="flex h-28 items-center gap-3"><ResponsiveContainer width="45%" height="100%"><PieChart><Pie data={stockMix.length?stockMix:[{name:"No stock",value:1}]} dataKey="value" nameKey="name" innerRadius={28} outerRadius={43}>{(stockMix.length?stockMix:[{name:"No stock",value:1}]).map((_,i)=><Cell key={i} fill={stockMix.length?COLORS[i%COLORS.length]:"#cbd5e1"}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer><div className="text-[10px]"><span className="text-slate-500">Total quantity</span><div className="font-black">{stats.inventoryQty.toLocaleString()}</div><span className="mt-2 block text-slate-500">Alerts</span><div className="font-black text-amber-700">{stats.stockAlerts}</div></div></div></Panel>
   <Panel title="Financial Summary / مالی خلاصہ" action={<button onClick={()=>navigate("/accounting/profit-loss")} className="text-[9px] font-black text-blue-700">P&amp;L →</button>}><div className="space-y-1.5 text-[10px]"><div className="flex justify-between"><span>Total Sales</span><b>{money(stats.sales)}</b></div><div className="flex justify-between"><span>Total Purchase</span><b>{money(stats.purchases)}</b></div><div className="flex justify-between border-t pt-1.5"><span>Gross Margin</span><b className={grossProfit>=0?"text-emerald-700":"text-rose-700"}>{money(grossProfit)}</b></div><div className="flex justify-between"><span>Net Estimate</span><b>{money(grossProfit*.86)}</b></div></div></Panel>
  </div>

  <div className="grid gap-3 xl:grid-cols-[1fr_2fr]">
   <Panel title="Alerts / ضروری اطلاعات"><div className="flex flex-wrap gap-5 text-[10px] font-bold"><button onClick={()=>navigate("/godown")} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500"/>Stock alerts <b>{stats.stockAlerts}</b></button><button onClick={()=>navigate("/production")} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500"/>Pending work orders <b>{stats.pendingWorkOrders}</b></button></div></Panel>
   <Panel title="Quick Links / فوری رسائی"><div className="flex flex-wrap gap-2"><button onClick={()=>navigate("/sales/new")} className={linkClass}><FilePlus2 className="mr-1 h-3.5 w-3.5"/>Sales Invoice</button><button onClick={()=>navigate("/purchase/new")} className={linkClass}><ShoppingCart className="mr-1 h-3.5 w-3.5"/>Purchase</button><button onClick={()=>navigate("/accounting/profit-loss")} className={linkClass}><FileBarChart className="mr-1 h-3.5 w-3.5"/>P&amp;L Report</button><button onClick={()=>navigate("/godown")} className={linkClass}><PackageSearch className="mr-1 h-3.5 w-3.5"/>Stock Report</button><button onClick={()=>navigate("/accounting/customer-invoice-statement")} className={linkClass}><WalletCards className="mr-1 h-3.5 w-3.5"/>A/R Report</button><button onClick={()=>navigate("/production")} className={linkClass}><Factory className="mr-1 h-3.5 w-3.5"/>Work Orders ({workRows.length})</button></div></Panel>
  </div>
 </div>
}
