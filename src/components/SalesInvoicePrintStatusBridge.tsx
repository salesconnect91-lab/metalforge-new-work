import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function SalesInvoicePrintStatusBridge(){
 const {pathname}=useLocation();
 const [status,setStatus]=useState("");
 useEffect(()=>{
  const match=pathname.match(/^\/sales\/([0-9a-f-]{36})$/i);
  if(!match){setStatus("");return;}
  let active=true;
  void supabase.from("sales_orders").select("status").eq("id",match[1]).maybeSingle().then(({data})=>{if(active)setStatus(String(data?.status||""));});
  return()=>{active=false};
 },[pathname]);
 useEffect(()=>{
  if(!status)return;
  const label=status.toUpperCase();
  const apply=()=>{
   document.querySelectorAll<HTMLElement>(".print-document").forEach(doc=>{
    if(!doc.querySelector("[data-navilo-sales-status]")){
      const meta=doc.querySelector<HTMLElement>(".print-meta-col");
      if(meta){const row=document.createElement("div");row.dataset.naviloSalesStatus="1";row.className="print-meta-row";row.innerHTML=`<span class="print-meta-label">Status / حیثیت:</span><span class="print-meta-value" style="font-weight:800;text-transform:uppercase">${label}</span>`;meta.appendChild(row);}
    }
    const title=doc.querySelector<HTMLElement>(".print-voucher-title-box");
    if(title&&!title.querySelector("[data-navilo-sales-status-badge]")){const badge=document.createElement("div");badge.dataset.naviloSalesStatusBadge="1";badge.textContent=label;badge.style.cssText="margin-top:5px;text-align:right;font-size:10px;font-weight:800;letter-spacing:.08em;color:#475569";title.appendChild(badge);}
   });
  };
  apply();const observer=new MutationObserver(apply);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect();
 },[status]);
 return null;
}
