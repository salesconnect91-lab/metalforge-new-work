import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
function sourceButtons(){return [...document.querySelectorAll("button")].filter((b):b is HTMLButtonElement=>b instanceof HTMLButtonElement&&defs.some(d=>(b.textContent||"").includes(d.match)))}
export default function OrderBookActionHub(){
 const {pathname}=useLocation(); const active=pathname==="/sales/order-book"||pathname==="/purchase/order-book";
 const [version,setVersion]=useState(0);
 useEffect(()=>{if(!active)return;const sync=()=>{sourceButtons().forEach(b=>b.classList.add("navilo-orderbook-action-source"));setVersion(v=>v+1)};sync();const mo=new MutationObserver(sync);mo.observe(document.body,{childList:true,subtree:true});return()=>{mo.disconnect();sourceButtons().forEach(b=>b.classList.remove("navilo-orderbook-action-source"))}},[active]);
 const available=useMemo(()=>{void version;return defs.filter(d=>[...document.querySelectorAll("button")].some(b=>(b.textContent||"").includes(d.match)))},[version]);
 if(!active||!available.length)return null; const slot=document.getElementById("order-book-action-slot"); if(!slot)return null;
 const run=(a:ActionDef)=>{const source=[...document.querySelectorAll("button")].find(b=>(b.textContent||"").includes(a.match)) as HTMLButtonElement|undefined;source?.click()};
 return createPortal(<><div className="flex flex-wrap items-center gap-1.5">{available.map(a=><button key={a.key} type="button" onClick={()=>run(a)} className={`btn ${a.danger?"border-red-200 text-red-700 hover:bg-red-50":""}`}>{a.icon}<span>{a.label}</span></button>)}</div><style>{`.navilo-orderbook-action-source{display:none!important}`}</style></>,slot)
}
