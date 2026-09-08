import { useEffect, useMemo, useState } from "react";
import { FileText, Filter, ListChecks, SlidersHorizontal, XCircle } from "lucide-react";
import { useLocation } from "react-router-dom";

type ActionDef={key:string;label:string;match:string;icon:React.ReactNode;danger?:boolean};
const defs:ActionDef[]=[
 {key:"filters",label:"Filters / فلٹرز",match:"Filters /",icon:<Filter size={14}/>},
 {key:"adjust",label:"Adjust Qty / مقدار تبدیل کریں",match:"Adjust Qty",icon:<SlidersHorizontal size={14}/>},
 {key:"cancel",label:"Cancel Order / آرڈر منسوخ کریں",match:"Cancel Order",icon:<XCircle size={14}/>,danger:true},
 {key:"customer",label:"Customer Report / کسٹمر رپورٹ",match:"Customer Order Report",icon:<FileText size={14}/>},
 {key:"detail",label:"Detailed Report / تفصیلی رپورٹ",match:"Print Detailed Report",icon:<ListChecks size={14}/>},
];

function realButtons(){
 return [...document.querySelectorAll("button")].filter((b):b is HTMLButtonElement=>b instanceof HTMLButtonElement&&!b.dataset.naviloOrderProxy&&defs.some(d=>(b.textContent||"").includes(d.match)));
}

export default function OrderBookActionHub(){
 const {pathname}=useLocation();
 const active=pathname==="/sales/order-book"||pathname==="/purchase/order-book";
 const [version,setVersion]=useState(0);
 useEffect(()=>{
  if(!active)return;
  const sync=()=>{realButtons().forEach(b=>b.classList.add("navilo-orderbook-action-source"));setVersion(v=>v+1)};
  sync();
  const mo=new MutationObserver(()=>sync());
  mo.observe(document.body,{childList:true,subtree:true});
  return()=>{mo.disconnect();realButtons().forEach(b=>b.classList.remove("navilo-orderbook-action-source"))};
 },[active]);
 const available=useMemo(()=>{void version;const buttons=realButtons();return defs.filter(d=>buttons.some(b=>(b.textContent||"").includes(d.match)))},[version]);
 if(!active||!available.length)return null;
 const run=(a:ActionDef)=>{const source=realButtons().find(b=>(b.textContent||"").includes(a.match));source?.click()};
 return <div className="fixed bottom-5 right-5 z-[120] max-w-[calc(100vw-2.5rem)] print:hidden">
  <div className="flex flex-wrap items-center justify-end gap-1.5 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-xl backdrop-blur">
   {available.map(a=><button key={a.key} data-navilo-order-proxy="true" type="button" onClick={()=>run(a)} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition ${a.danger?"text-red-700 hover:bg-red-50":"text-slate-700 hover:bg-slate-100"}`}>{a.icon}<span>{a.label}</span></button>)}
  </div>
  <style>{`.navilo-orderbook-action-source{display:none!important}`}</style>
 </div>
}
