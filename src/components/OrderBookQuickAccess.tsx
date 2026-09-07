import { useState } from "react";
import { BookOpenCheck, Loader2, Printer, Settings2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";

const esc=(v:unknown)=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]||m));
const num=(v:unknown)=>Number(v)||0;

export default function OrderBookQuickAccess(){
 const {pathname}=useLocation();
 const [printing,setPrinting]=useState(false);
 const sales=pathname==="/sales"||pathname.startsWith("/sales/");
 const purchase=pathname==="/purchase"||pathname.startsWith("/purchase/");
 const orderBook=pathname.includes("order-book");
 if(!sales&&!purchase)return null;

 const printOrderBook=async()=>{
  setPrinting(true);
  try{
   const orderType=sales?"sales":"purchase";
   const [{data:companyId},{data:orders,error}]=await Promise.all([
    supabase.rpc("current_company_id"),
    supabase.from("order_book_headers").select("id,order_no,order_date,party_name,salesperson_name,status,remarks,order_book_commitments(id,item_name,ordered_qty,fulfilled_qty,cancelled_qty,uom,rate_status,agreed_rate,effective_at,source,status,remarks)").eq("order_type",orderType).order("order_date",{ascending:false}).order("created_at",{ascending:false})
   ]);
   if(error)throw error;
   let companyName="NAVILO";
   if(companyId){
    const {data:company}=await supabase.from("companies").select("name").eq("id",String(companyId)).maybeSingle();
    if(company?.name)companyName=company.name;
   }
   const flat=(orders||[]).flatMap((o:any)=>(o.order_book_commitments||[]).map((c:any)=>{
    const ordered=num(c.ordered_qty),fulfilled=num(c.fulfilled_qty),cancelled=num(c.cancelled_qty),balance=Math.max(0,ordered-fulfilled-cancelled);
    const rate=c.rate_status==="agreed"?num(c.agreed_rate):null;
    return {o,c,ordered,fulfilled,cancelled,balance,rate,value:rate==null?0:balance*rate};
   }));
   const totals=flat.reduce((a:any,r:any)=>({ordered:a.ordered+r.ordered,fulfilled:a.fulfilled+r.fulfilled,cancelled:a.cancelled+r.cancelled,balance:a.balance+r.balance,value:a.value+r.value}),{ordered:0,fulfilled:0,cancelled:0,balance:0,value:0});
   const title=sales?"Sales Order Book & Rate Commitments":"Purchase Order Book & Rate Commitments";
   const rows=flat.map((r:any,i:number)=>`<tr><td>${i+1}</td><td>${esc(r.o.order_no)}</td><td>${esc(r.o.order_date)}</td><td>${esc(r.o.party_name)}</td>${sales?`<td>${esc(r.o.salesperson_name||"—")}</td>`:""}<td>${esc(r.c.item_name)}</td><td>${r.ordered.toLocaleString()}</td><td>${esc(r.c.uom||"—")}</td><td>${r.fulfilled.toLocaleString()}</td><td>${r.cancelled.toLocaleString()}</td><td>${r.balance.toLocaleString()}</td><td>${r.rate==null?"Rate Pending":`Rs ${r.rate.toLocaleString()}`}</td><td>${r.rate==null?"—":`Rs ${r.value.toLocaleString()}`}</td><td>${esc(r.c.effective_at?String(r.c.effective_at).slice(0,10):"—")}</td><td>${esc(r.c.source||"order")}</td><td>${esc(r.c.status||r.o.status||"—")}</td><td>${esc(r.c.remarks||r.o.remarks||"—")}</td></tr>`).join("");
   const w=window.open("","_blank","width=1400,height=900");
   if(!w)throw new Error("Print window was blocked by the browser.");
   w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,"Noto Nastaliq Urdu",sans-serif;color:#111827;margin:0;font-size:10px}h1{font-size:18px;margin:0 0 4px}.sub{color:#475569;margin-bottom:12px}.meta{display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:10px}.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:10px}.card{border:1px solid #cbd5e1;padding:7px;border-radius:6px}.card b{display:block;font-size:13px;margin-top:3px}table{width:100%;border-collapse:collapse;font-size:8.5px}th,td{border:1px solid #cbd5e1;padding:4px;vertical-align:top}th{background:#f1f5f9;font-weight:700}tfoot td{font-weight:700;background:#f8fafc}.note{margin-top:10px;color:#64748b;font-size:8px}@media print{button{display:none}}</style></head><body><div class="meta"><div><h1>${esc(companyName)}</h1><div class="sub">${esc(title)} / ${sales?"سیلز آرڈر بک اور ریٹ معاہدے":"پرچیز آرڈر بک اور ریٹ معاہدے"}</div></div><div>Printed: ${esc(new Date().toLocaleString())}</div></div><div class="cards"><div class="card">Ordered Qty<b>${totals.ordered.toLocaleString()}</b></div><div class="card">Fulfilled<b>${totals.fulfilled.toLocaleString()}</b></div><div class="card">Cancelled<b>${totals.cancelled.toLocaleString()}</b></div><div class="card">Balance Qty<b>${totals.balance.toLocaleString()}</b></div><div class="card">Open Committed Value<b>Rs ${totals.value.toLocaleString()}</b></div></div><table><thead><tr><th>#</th><th>Order No</th><th>Date</th><th>${sales?"Customer":"Supplier"}</th>${sales?"<th>Salesperson</th>":""}<th>Item</th><th>Ordered</th><th>UOM</th><th>Fulfilled</th><th>Cancelled</th><th>Balance</th><th>Rate</th><th>Open Value</th><th>Effective Date</th><th>Source</th><th>Status</th><th>Remarks</th></tr></thead><tbody>${rows||`<tr><td colspan="17" style="text-align:center;padding:24px">No order records found.</td></tr>`}</tbody><tfoot><tr><td colspan="${sales?6:5}">GRAND TOTAL</td><td>${totals.ordered.toLocaleString()}</td><td></td><td>${totals.fulfilled.toLocaleString()}</td><td>${totals.cancelled.toLocaleString()}</td><td>${totals.balance.toLocaleString()}</td><td></td><td>Rs ${totals.value.toLocaleString()}</td><td colspan="4"></td></tr></tfoot></table><div class="note">Order Book records do not post GL, VAT or stock until an invoice is posted.</div><script>window.onload=()=>{window.print()}</script></body></html>`);
   w.document.close();
  }catch(e:any){alert(e?.message||"Could not prepare Order Book report.")}
  finally{setPrinting(false)}
 };

 if(orderBook)return <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2 print:hidden"><button type="button" onClick={()=>void printOrderBook()} disabled={printing} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-800 shadow-xl hover:bg-slate-50 disabled:opacity-60">{printing?<Loader2 className="h-4 w-4 animate-spin"/>:<Printer className="h-4 w-4"/>}Print Detailed Report / تفصیلی رپورٹ</button></div>;

 return <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2 print:hidden">
  <Link to="/settings/order-book" title="Order Book Settings" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg hover:bg-slate-50"><Settings2 className="h-4 w-4"/></Link>
  <Link to={sales?"/sales/order-book":"/purchase/order-book"} className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-xl hover:bg-blue-700"><BookOpenCheck className="h-4 w-4"/>{sales?"Sales Order Book / سیلز آرڈر بک":"Purchase Order Book / پرچیز آرڈر بک"}</Link>
 </div>
}
