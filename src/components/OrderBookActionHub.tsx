import { useEffect, useMemo, useState } from "react";
import { ChevronDown, FileText, Filter, ListChecks, SlidersHorizontal, XCircle } from "lucide-react";
import { useLocation } from "react-router-dom";

type ActionDef={key:string;label:string;match:string;icon:React.ReactNode};
const defs:ActionDef[]=[
 {key:"filters",label:"Filters / فلٹرز",match:"Filters /",icon:<Filter size={15}/>},
 {key:"adjust",label:"Adjust Quantity / مقدار تبدیل کریں",match:"Adjust Qty",icon:<SlidersHorizontal size={15}/>},
 {key:"cancel",label:"Cancel Order / آرڈر منسوخ کریں",match:"Cancel Order",icon:<XCircle size={15}/>},
 {key:"customer",label:"Customer Order Report / کسٹمر آرڈر رپورٹ",match:"Customer Order Report",icon:<FileText size={15}/>},
 {key:"detail",label:"Detailed Report / تفصیلی رپورٹ",match:"Print Detailed Report",icon:<ListChecks size={15}/>},
];

function sourceButtons(){return [...document.querySelectorAll("button")].filter((b):b is HTMLButtonElement=>b instanceof HTMLButtonElement&&defs.some(d=>(b.textContent||"").includes(d.match)))}

export default function OrderBookActionHub(){
 const {pathname}=useLocation();
 const active=pathname==="/sales/order-book"||pathname==="/purchase/order-book";
 const [open,setOpen]=useState(false),[version,setVersion]=useState(0);
 useEffect(()=>{if(!active)return;const sync=()=>{sourceButtons().forEach(b=>b.classList.add("navilo-orderbook-action-source"));setVersion(v=>v+1)};sync();const mo=new MutationObserver(sync);mo.observe(document.body,{childList:true,subtree:true});return()=>{mo.disconnect();sourceButtons().forEach(b=>b.classList.remove("navilo-orderbook-action-source"))}},[active]);
 const available=useMemo(()=>{void version;return defs.filter(d=>[...document.querySelectorAll("button")].some(b=>(b.textContent||"").includes(d.match)))},[version]);
 if(!active||!available.length)return null;
 const run=(a:ActionDef)=>{const source=[...document.querySelectorAll("button")].find(b=>(b.textContent||"").includes(a.match)) as HTMLButtonElement|undefined;setOpen(false);source?.click()};
 return <div className="fixed bottom-5 right-5 z-[120] print:hidden"><div className="relative">{open&&<div className="absolute bottom-12 right-0 mb-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">{available.map(a=><button key={a.key} type="button" onClick={()=>run(a)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100">{a.icon}<span>{a.label}</span></button>)}</div>}<button type="button" onClick={()=>setOpen(v=>!v)} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white shadow-lg hover:bg-slate-800"><ListChecks size={16}/> Order Actions / آرڈر ایکشنز <ChevronDown size={15} className={open?"rotate-180":""}/></button></div><style>{`.navilo-orderbook-action-source{display:none!important}`}</style></div>
}
