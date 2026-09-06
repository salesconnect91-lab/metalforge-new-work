import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { calculateConfiguredChargeAmount, type ConfiguredChargeUnit } from "@/lib/chargeCalculation";

type DiscountMode="fixed"|"percent";
type DiscountContext={type:"sales_main"|"sales_consolidated"|"purchase_main"|"purchase_consolidated";label:string;urdu:string};
type ChargeMasterRow={charge_key:string;charge_name:string;default_rate:number|string;unit:ConfiguredChargeUnit;is_fixed:boolean;applies_to:string;is_active:boolean};
type ItemRow={id:string;unit?:string|null};

const money=(value:number)=>`Rs ${Number(value||0).toLocaleString("en-PK",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const parseMoney=(text:string)=>{const m=text.match(/Rs\s*([\d,]+(?:\.\d+)?)/i);return m?Number(m[1].replace(/,/g,""))||0:0};

function contextFor(pathname:string):DiscountContext|null{
 if(pathname==="/sales/new"||/^\/sales\/[^/]+\/edit$/.test(pathname))return{type:"sales_main",label:"Discount Allowed",urdu:"رعایت دی گئی"};
 if(pathname==="/sales/consolidated")return{type:"sales_consolidated",label:"Discount Allowed",urdu:"رعایت دی گئی"};
 if(pathname==="/purchase/new")return{type:"purchase_main",label:"Discount Received",urdu:"رعایت موصول"};
 if(pathname==="/purchase/consolidated")return{type:"purchase_consolidated",label:"Discount Received",urdu:"رعایت موصول"};
 return null;
}

function findVisibleForm(ctx:DiscountContext):HTMLFormElement|null{
 const forms=Array.from(document.querySelectorAll("form")) as HTMLFormElement[];
 const visible=forms.filter(f=>f.offsetParent!==null);
 if(ctx.type==="sales_main")return visible.find(f=>f.textContent?.includes("Invoice Items"))??visible[0]??null;
 if(ctx.type==="sales_consolidated")return visible.find(f=>f.textContent?.includes("Applicable Charges"))??visible[0]??null;
 if(ctx.type==="purchase_main")return visible.find(f=>f.textContent?.includes("Direct Main Invoice Items"))??visible[0]??null;
 return visible.find(f=>f.textContent?.includes("Consolidated Purchase Invoice"))??visible[0]??null;
}

function findDocumentNo(form:HTMLFormElement|null):string{
 if(!form)return"";
 const labels=Array.from(form.querySelectorAll("label"));
 for(const label of labels){
  const text=(label.textContent||"").trim().toLowerCase();
  if(!text.includes("invoice no"))continue;
  const host=label.parentElement;
  const input=host?.querySelector("input") as HTMLInputElement|null;
  if(input?.value?.trim())return input.value.trim();
 }
 const candidates=Array.from(form.querySelectorAll("input[readonly],input:disabled")) as HTMLInputElement[];
 return candidates.map(i=>i.value.trim()).find(v=>/^(CSH|TAX|INV|HWL|CP|PUR|PI)-/i.test(v))||"";
}

function findGrossTotal(form:HTMLFormElement|null):number{
 if(!form)return 0;
 const nodes=Array.from(form.querySelectorAll("div,span,p")) as HTMLElement[];
 const priority=["grand total","net total","invoice total"];
 for(const needle of priority){
  for(const node of nodes){
   if(node.closest("[data-navilo-discount-panel]"))continue;
   const own=(node.childNodes.length===1?node.textContent||"":node.firstChild?.textContent||"").trim().toLowerCase();
   if(!own.includes(needle))continue;
   let el:HTMLElement|null=node;
   for(let depth=0;depth<3&&el;depth++,el=el.parentElement){const amount=parseMoney(el.textContent||"");if(amount>0)return amount;}
  }
 }
 const moneyNodes=nodes.filter(n=>!n.closest("[data-navilo-discount-panel]")&&/^\s*Rs\s*[\d,]+/i.test(n.textContent||""));
 const values=moneyNodes.map(n=>parseMoney(n.textContent||"")).filter(v=>v>0);
 return values.length?values[values.length-1]:0;
}

function ensureSlot(form:HTMLFormElement,ctx:DiscountContext):HTMLElement{
 let slot=form.querySelector("[data-navilo-commercial-slot]") as HTMLElement|null;
 if(slot)return slot;
 slot=document.createElement("div");slot.setAttribute("data-navilo-commercial-slot",ctx.type);
 const chargeTitle=Array.from(form.querySelectorAll("div")).find(el=>(el.textContent||"").trim().startsWith("Applicable Charges"));
 const chargeSection=chargeTitle?.closest("section");
 if(chargeSection?.parentElement)chargeSection.insertAdjacentElement("afterend",slot);else form.appendChild(slot);
 return slot;
}

function setReactInput(input:HTMLInputElement,value:string){
 if(input.value===value)return;
 const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
 setter?.call(input,value);
 input.dispatchEvent(new Event("input",{bubbles:true}));
 input.dispatchEvent(new Event("change",{bubbles:true}));
}

export default function InvoiceCommercialControls(){
 const{pathname}=useLocation();const ctx=useMemo(()=>contextFor(pathname),[pathname]);
 const[slot,setSlot]=useState<HTMLElement|null>(null),[documentNo,setDocumentNo]=useState(""),[gross,setGross]=useState(0),[mode,setMode]=useState<DiscountMode>("fixed"),[value,setValue]=useState("0"),[storedAmount,setStoredAmount]=useState(0),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
 const loadedKey=useRef("");

 useEffect(()=>{if(ctx)return;const pending=sessionStorage.getItem("navilo-pending-sales-main-discount");if(!pending||!/^\/sales\/[^/]+$/.test(pathname))return;const id=pathname.split("/")[2];void(async()=>{try{const parsed=JSON.parse(pending);const{data,error}=await supabase.from("sales_orders").select("order_no,status").eq("id",id).maybeSingle();if(error||!data?.order_no||data.status!=="draft")return;const{error:rpcError}=await supabase.rpc("upsert_commercial_invoice_discount",{p_document_type:"sales_main",p_document_no:data.order_no,p_mode:parsed.mode,p_value:Number(parsed.value)||0,p_amount:Number(parsed.amount)||0});if(!rpcError)sessionStorage.removeItem("navilo-pending-sales-main-discount")}catch{}})()},[ctx,pathname]);

 useEffect(()=>{setSlot(null);setDocumentNo("");setGross(0);setMessage("");loadedKey.current="";if(!ctx)return;let attempts=0;const timer=window.setInterval(()=>{attempts++;const form=findVisibleForm(ctx);if(form){setSlot(ensureSlot(form,ctx));setDocumentNo(findDocumentNo(form));setGross(findGrossTotal(form))}if(attempts>120)window.clearInterval(timer)},350);return()=>{window.clearInterval(timer);document.querySelectorAll(`[data-navilo-commercial-slot="${ctx.type}"]`).forEach(n=>n.remove())}},[ctx]);

 useEffect(()=>{if(!ctx||!slot)return;const timer=window.setInterval(()=>{const form=slot.closest("form") as HTMLFormElement|null;if(!form)return;setDocumentNo(findDocumentNo(form));setGross(findGrossTotal(form))},700);return()=>window.clearInterval(timer)},[ctx,slot]);

 useEffect(()=>{if(!ctx||!documentNo||documentNo.endsWith("-AUTO"))return;const key=`${ctx.type}:${documentNo}`;if(loadedKey.current===key)return;loadedKey.current=key;void(async()=>{const{data}=await supabase.from("commercial_invoice_discounts").select("discount_mode,discount_value,discount_amount").eq("document_type",ctx.type).eq("document_no",documentNo).maybeSingle();if(data){setMode(data.discount_mode as DiscountMode);setValue(String(Number(data.discount_value)||0));setStoredAmount(Number(data.discount_amount)||0)}else{setMode("fixed");setValue("0");setStoredAmount(0)}setDirty(false)})()},[ctx,documentNo]);

 const numericValue=Math.max(0,Number(value)||0);const calculated=mode==="percent"?(gross>0?Math.min(gross,gross*Math.min(numericValue,100)/100):storedAmount):(gross>0?Math.min(gross,numericValue):numericValue);const net=Math.max(0,gross-calculated);

 useEffect(()=>{if(!ctx||!dirty)return;const t=window.setTimeout(()=>{const amount=Number(calculated.toFixed(2));if(ctx.type==="sales_main"&&documentNo.endsWith("-AUTO")){sessionStorage.setItem("navilo-pending-sales-main-discount",JSON.stringify({mode,value:numericValue,amount}));setStoredAmount(amount);setDirty(false);setMessage("Discount ready; it will attach to the generated invoice number on Save.");return}if(!documentNo)return;setSaving(true);void supabase.rpc("upsert_commercial_invoice_discount",{p_document_type:ctx.type,p_document_no:documentNo,p_mode:mode,p_value:numericValue,p_amount:amount}).then(({error})=>{setSaving(false);if(error){setMessage(error.message);return}setStoredAmount(amount);setDirty(false);setMessage(amount>0?"Discount saved with accounting control.":"Discount removed.")})},500);return()=>window.clearTimeout(t)},[ctx,dirty,documentNo,mode,numericValue,calculated]);

 // Consolidated Sales: fixed/configured Charge Master calculations now follow the same engine as Main Sales Invoice.
 useEffect(()=>{if(pathname!=="/sales/consolidated")return;let active=true;let masters:ChargeMasterRow[]=[];let items:ItemRow[]=[];void Promise.all([
  supabase.from("charge_master").select("charge_key,charge_name,default_rate,unit,is_fixed,applies_to,is_active").eq("is_active",true).in("applies_to",["sales","both"]),
  supabase.from("items").select("id,unit")
 ]).then(([m,i])=>{if(!active)return;masters=(m.data??[]) as ChargeMasterRow[];items=(i.data??[]) as ItemRow[]});
 const timer=window.setInterval(()=>{if(!active||!masters.length)return;const form=Array.from(document.querySelectorAll("form")).find(f=>f.offsetParent!==null&&(f.textContent||"").includes("Applicable Charges")) as HTMLFormElement|undefined;if(!form)return;const itemIds=new Set(items.map(i=>i.id));const invoiceRows:Array<{item_id:string;qty:string}> = [];let base=0;
  form.querySelectorAll("tr").forEach(tr=>{const selects=Array.from(tr.querySelectorAll("select")) as HTMLSelectElement[];const itemSelect=selects.find(s=>itemIds.has(s.value));if(!itemSelect)return;const nums=Array.from(tr.querySelectorAll('input[type="number"]')) as HTMLInputElement[];if(nums.length<2)return;const qty=Number(nums[0].value)||0,rate=Number(nums[1].value)||0;invoiceRows.push({item_id:itemSelect.value,qty:String(qty)});base+=qty*rate});
  masters.filter(m=>m.is_fixed).forEach(master=>{const nameNodes=Array.from(form.querySelectorAll("div,span,strong")).filter(el=>(el.textContent||"").trim()===master.charge_name) as HTMLElement[];for(const nameNode of nameNodes){let card:HTMLElement|null=nameNode.parentElement;for(let d=0;d<5&&card&&!card.querySelector('input[type="number"]');d++)card=card.parentElement;if(!card)continue;const inputs=Array.from(card.querySelectorAll('input[type="number"]')) as HTMLInputElement[];if(!inputs.length)continue;const amount=calculateConfiguredChargeAmount({unit:master.unit,rate:Number(master.default_rate)||0,rows:invoiceRows,items,baseAmount:base});setReactInput(inputs[0],String(amount));card.setAttribute("title",`Auto calculated from Charge Master: ${master.default_rate} ${master.unit}`);break}}
  })
 },800);return()=>{active=false;window.clearInterval(timer)}},[pathname]);

 if(!ctx||!slot)return null;
 return createPortal(<section data-navilo-discount-panel className="rounded-lg border border-emerald-200 bg-white shadow-sm"><div className="border-b border-emerald-100 bg-emerald-50 px-3 py-2.5"><div className="text-[12px] font-bold text-emerald-900">{ctx.label} / {ctx.urdu}</div><div className="mt-0.5 text-[12px] text-emerald-700">Controlled invoice-level commercial discount. Tax remains as invoiced; accounting posts a separate auditable discount entry.</div></div><div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-4"><div><label className="label">Discount Type / قسم</label><select className="input" value={mode} onChange={e=>{setMode(e.target.value as DiscountMode);setDirty(true);setMessage("")}}><option value="fixed">Fixed Amount / مقررہ رقم</option><option value="percent">Percentage / فیصد</option></select></div><div><label className="label">{mode==="percent"?"Discount % / رعایت فیصد":"Discount Amount / رعایت رقم"}</label><input className="input text-right" type="number" min="0" max={mode==="percent"?100:undefined} step="0.01" value={value} onChange={e=>{setValue(e.target.value);setDirty(true);setMessage("")}}/></div><div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] uppercase text-slate-400">Gross Total / مجموعی</div><div className="mt-1 font-bold text-slate-800">{money(gross)}</div><div className="mt-1 text-xs text-rose-600">− {money(calculated)}</div></div><div className="rounded-lg bg-emerald-50 px-3 py-2"><div className="text-[11px] uppercase text-emerald-600">Net Total / خالص کل</div><div className="mt-1 text-lg font-bold text-emerald-800">{money(net)}</div><div className="mt-1 text-[11px] text-emerald-600">{saving?"Saving…":message||"Saved in audit trail"}</div></div></div></section>,slot)
}
