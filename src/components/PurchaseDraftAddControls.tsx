import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpenCheck, Loader2, Plus, ReceiptText, Trash2, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { calculateConfiguredChargeAmount, chargeQuantityForUnit, type ConfiguredChargeUnit } from "@/lib/chargeCalculation";

type PurchaseDraft = {
  id: string;
  supplier_id: string | null;
  status: string;
  invoice_type: "Purchase Invoice" | "Tax Invoice";
  tax_percent: number | string | null;
};
type HeaderRow = { id:string; order_no:string; party_id:string|null; party_name:string; status:string };
type CommitmentRow = { id:string; order_id:string; item_id:string; item_name:string; uom:string|null; agreed_rate:number|string|null; rate_status:string };
type PickRow = CommitmentRow & { header:HeaderRow; available:number };
type Godown = { id:string; name:string; name_urdu?:string|null };
type BasketRow = { commitment:PickRow; qty:string; godown_id:string };
type Charge = {
  charge_key:string;
  charge_name:string;
  charge_name_urdu?:string|null;
  default_rate:number|string;
  unit:ConfiguredChargeUnit;
  is_fixed:boolean;
  tax_applicable:boolean;
  purchase_treatment?:"landed_cost"|"expense"|null;
  cost_account_id?:string|null;
};
type ExistingCharge = { charge_key:string; amount:number|string; quantity:number|string|null; rate:number|string|null };
type LineRow = { item_id:string; qty:number|string; unit_cost:number|string; line_total:number|string };
type Item = { id:string; unit?:string|null };

const money=(value:unknown)=>`Rs ${(Number(value)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const unitLabel=(unit:ConfiguredChargeUnit)=>({fixed:"Fixed",percent:"%",per_kg:"per kg",per_ton:"per ton",per_piece:"per piece"}[unit]||unit);

export default function PurchaseDraftAddControls(){
  const { pathname }=useLocation();
  const match=pathname.match(/^\/purchase\/([0-9a-f-]{36})(?:\/edit)?\/?$/i);
  const orderId=match?.[1]??null;
  const [draft,setDraft]=useState<PurchaseDraft|null>(null);
  const [mount,setMount]=useState<HTMLElement|null>(null);
  const [checking,setChecking]=useState(false);

  const [poOpen,setPoOpen]=useState(false);
  const [poLoading,setPoLoading]=useState(false);
  const [poSaving,setPoSaving]=useState(false);
  const [poError,setPoError]=useState<string|null>(null);
  const [poRows,setPoRows]=useState<PickRow[]>([]);
  const [godowns,setGodowns]=useState<Godown[]>([]);
  const [basket,setBasket]=useState<BasketRow[]>([]);

  const [chargeOpen,setChargeOpen]=useState(false);
  const [chargeLoading,setChargeLoading]=useState(false);
  const [chargeSaving,setChargeSaving]=useState(false);
  const [chargeError,setChargeError]=useState<string|null>(null);
  const [charges,setCharges]=useState<Charge[]>([]);
  const [selectedKeys,setSelectedKeys]=useState<string[]>([]);
  const [amounts,setAmounts]=useState<Record<string,string>>({});
  const [chargeToAdd,setChargeToAdd]=useState("");
  const [lines,setLines]=useState<LineRow[]>([]);
  const [items,setItems]=useState<Item[]>([]);

  useEffect(()=>{
    setDraft(null);
    if(!orderId)return;
    let alive=true;
    setChecking(true);
    void(async()=>{
      const {data,error}=await supabase.from("purchase_orders").select("id,supplier_id,status,invoice_type,tax_percent").eq("id",orderId).maybeSingle();
      if(!alive)return;
      setChecking(false);
      if(!error&&data)setDraft(data as PurchaseDraft);
    })();
    return()=>{alive=false};
  },[orderId]);

  const isDraft=Boolean(orderId&&draft?.status==="draft");

  useEffect(()=>{
    if(!isDraft)return;
    const attach=()=>{
      const buttons=Array.from(document.querySelectorAll("button"));
      const addLine=buttons.find((button)=>{
        const text=(button.textContent||"").replace(/\s+/g," ").trim().toLowerCase();
        return text.includes("add line")||text.includes("add row");
      });
      const parent=addLine?.parentElement;
      if(!parent){setMount(null);return;}
      let host=document.getElementById("purchase-draft-add-controls-host");
      if(!host){
        host=document.createElement("span");
        host.id="purchase-draft-add-controls-host";
        host.className="inline-flex flex-wrap gap-2";
        parent.insertBefore(host,addLine||null);
      }
      setMount(host);
    };
    attach();
    const observer=new MutationObserver(attach);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>{
      observer.disconnect();
      document.getElementById("purchase-draft-add-controls-host")?.remove();
      setMount(null);
    };
  },[isDraft,pathname]);

  const loadPO=async()=>{
    if(!draft?.supplier_id)return;
    setPoOpen(true);setPoLoading(true);setPoError(null);setBasket([]);
    try{
      const [{data:heads,error:he},{data:commitments,error:ce},{data:g,error:ge}]=await Promise.all([
        supabase.from("order_book_headers").select("id,order_no,party_id,party_name,status").eq("order_type","purchase").eq("party_id",draft.supplier_id).in("status",["confirmed","partially_fulfilled","rate_pending"]),
        supabase.from("order_book_commitments").select("id,order_id,item_id,item_name,uom,agreed_rate,rate_status").eq("rate_status","agreed"),
        supabase.from("godowns").select("id,name,name_urdu").order("name")
      ]);
      if(he)throw he;if(ce)throw ce;if(ge)throw ge;
      const headerMap=new Map((heads||[]).map((h:any)=>[h.id,h as HeaderRow]));
      const result:PickRow[]=[];
      for(const commitment of (commitments||[]) as CommitmentRow[]){
        const header=headerMap.get(commitment.order_id);if(!header)continue;
        const {data:available,error:ae}=await supabase.rpc("order_commitment_available_qty",{p_commitment_id:commitment.id});
        if(ae)throw ae;
        const qty=Number(available)||0;
        if(qty>0)result.push({...commitment,header,available:qty});
      }
      setPoRows(result);setGodowns((g||[]) as Godown[]);
    }catch(e:any){setPoError(e?.message||"Could not load Purchase Order commitments.");}
    finally{setPoLoading(false);}
  };

  const addBasket=(row:PickRow)=>{
    if(basket.some((entry)=>entry.commitment.id===row.id))return;
    setBasket((current)=>[...current,{commitment:row,qty:String(row.available),godown_id:godowns[0]?.id||""}]);
  };
  const updateBasket=(id:string,field:"qty"|"godown_id",value:string)=>setBasket((current)=>current.map((entry)=>entry.commitment.id===id?{...entry,[field]:value}:entry));

  const attachPO=async()=>{
    if(!orderId||!basket.length)return;
    setPoSaving(true);setPoError(null);
    try{
      const payload=basket.map((entry)=>{
        const qty=Number(entry.qty);
        if(!qty||qty<=0||qty>entry.commitment.available+0.0001)throw new Error(`Qty for ${entry.commitment.item_name} must be between 0 and ${entry.commitment.available}.`);
        if(!entry.godown_id)throw new Error(`Select Godown for ${entry.commitment.item_name}.`);
        return {commitment_id:entry.commitment.id,qty,godown_id:entry.godown_id};
      });
      const {error}=await supabase.rpc("add_order_commitments_to_purchase_draft_batch",{p_order_id:orderId,p_lines:payload});
      if(error)throw error;
      setPoOpen(false);
      window.location.reload();
    }catch(e:any){setPoError(e?.message||"Could not add Purchase Order lines.");}
    finally{setPoSaving(false);}
  };

  const loadCharges=async()=>{
    if(!orderId)return;
    setChargeOpen(true);setChargeLoading(true);setChargeError(null);setChargeToAdd("");
    try{
      const [{data:master,error:me},{data:existing,error:ee},{data:lineData,error:le},{data:itemData,error:ie}]=await Promise.all([
        supabase.from("charge_master").select("charge_key,charge_name,charge_name_urdu,default_rate,unit,is_fixed,tax_applicable,purchase_treatment,cost_account_id").eq("is_active",true).in("applies_to",["purchase","both"]).order("charge_name"),
        supabase.from("purchase_order_charges").select("charge_key,amount,quantity,rate").eq("order_id",orderId).order("created_at"),
        supabase.from("purchase_order_lines").select("item_id,qty,unit_cost,line_total").eq("order_id",orderId).is("source_consolidated_purchase_invoice_id",null),
        supabase.from("items").select("id,unit")
      ]);
      if(me)throw me;if(ee)throw ee;if(le)throw le;if(ie)throw ie;
      const loaded=(master||[]) as Charge[];
      const old=(existing||[]) as ExistingCharge[];
      const loadedLines=(lineData||[]) as LineRow[];
      const loadedItems=(itemData||[]) as Item[];
      setCharges(loaded);setLines(loadedLines);setItems(loadedItems);
      setSelectedKeys(old.map((row)=>row.charge_key));
      setAmounts(Object.fromEntries(old.map((row)=>[row.charge_key,String(Number(row.amount)||0)])));
    }catch(e:any){setChargeError(e?.message||"Could not load Purchase Charges.");}
    finally{setChargeLoading(false);}
  };

  const directSubtotal=useMemo(()=>lines.reduce((sum,row)=>sum+(Number(row.line_total)||((Number(row.qty)||0)*(Number(row.unit_cost)||0))),0),[lines]);
  const selectedCharges=useMemo(()=>charges.filter((charge)=>selectedKeys.includes(charge.charge_key)),[charges,selectedKeys]);
  const availableCharges=useMemo(()=>charges.filter((charge)=>!selectedKeys.includes(charge.charge_key)),[charges,selectedKeys]);
  const chargeTotal=selectedCharges.reduce((sum,charge)=>sum+(Number(amounts[charge.charge_key])||0),0);
  const chargeTax=draft?.invoice_type==="Tax Invoice"?selectedCharges.reduce((sum,charge)=>charge.tax_applicable?sum+(Number(amounts[charge.charge_key])||0)*(Number(draft.tax_percent)||0)/100:sum,0):0;

  const addCharge=()=>{
    const charge=charges.find((candidate)=>candidate.charge_key===chargeToAdd);if(!charge)return;
    const amount=calculateConfiguredChargeAmount({unit:charge.unit,rate:Number(charge.default_rate)||0,rows:lines,items,baseAmount:directSubtotal});
    setSelectedKeys((current)=>current.includes(charge.charge_key)?current:[...current,charge.charge_key]);
    setAmounts((current)=>({...current,[charge.charge_key]:String(amount)}));
    setChargeToAdd("");
  };

  const saveCharges=async()=>{
    if(!orderId)return;
    setChargeSaving(true);setChargeError(null);
    try{
      const payload=selectedCharges.map((charge)=>{
        const amount=Math.max(0,Number(amounts[charge.charge_key])||0);
        const quantity=chargeQuantityForUnit(charge.unit,lines,items,directSubtotal);
        return {charge_key:charge.charge_key,amount,quantity,rate:Number(charge.default_rate)||0};
      }).filter((row)=>row.amount>0);
      const {error}=await supabase.rpc("replace_purchase_order_charges",{p_order_id:orderId,p_charges:payload});
      if(error)throw error;
      setChargeOpen(false);
      window.location.reload();
    }catch(e:any){setChargeError(e?.message||"Could not save Purchase Charges.");}
    finally{setChargeSaving(false);}
  };

  if(!orderId||checking||!isDraft)return null;

  const controls=<>
    <button type="button" className="btn btn-secondary" onClick={()=>void loadPO()} title="Add open purchase commitments to this draft invoice"><BookOpenCheck className="h-4 w-4"/> Add from PO / آرڈر بک سے شامل کریں</button>
    <button type="button" className="btn btn-secondary" onClick={()=>void loadCharges()} title="Add Purchase/Both charges configured in Charge Master"><ReceiptText className="h-4 w-4"/> Add Charge / چارج شامل کریں</button>
  </>;

  return <>
    {mount?createPortal(controls,mount):<div className="fixed bottom-5 left-5 z-50 flex flex-wrap gap-2 print:hidden">{controls}</div>}

    {poOpen&&<div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/55 p-4 print:hidden">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b p-5"><div><div className="text-lg font-black">Add from PO / Purchase Order Book</div><div className="mt-1 text-xs text-slate-500">Only this supplier's open agreed commitments are shown. Rate remains locked; Qty and Godown can be selected.</div></div><button type="button" onClick={()=>setPoOpen(false)}><X className="h-5 w-5"/></button></div>
        <div className="overflow-auto p-5">{poError&&<div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{poError}</div>}
          {poLoading?<div className="flex min-h-48 items-center justify-center"><Loader2 className="mr-2 h-5 w-5 animate-spin"/>Loading PO commitments…</div>:<div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
            <div className="max-h-[58vh] overflow-auto rounded-xl border"><table className="table w-full"><thead><tr><th>PO</th><th>Item</th><th>Available</th><th>Agreed Rate</th><th></th></tr></thead><tbody>{poRows.length===0?<tr><td colSpan={5} className="py-8 text-center text-slate-500">No open agreed Purchase Order commitment for this supplier.</td></tr>:poRows.map((row)=><tr key={row.id}><td>{row.header.order_no}</td><td>{row.item_name}</td><td>{row.available} {row.uom||""}</td><td>{money(row.agreed_rate)}</td><td><button type="button" className="btn" disabled={basket.some((entry)=>entry.commitment.id===row.id)} onClick={()=>addBasket(row)}><Plus className="h-4 w-4"/>Add</button></td></tr>)}</tbody></table></div>
            <div className="space-y-3"><div className="font-black">Add to this Draft / اس ڈرافٹ میں شامل کریں</div>{basket.length===0?<div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">Select one or more PO lines.</div>:basket.map((entry)=><div key={entry.commitment.id} className="rounded-xl border p-3"><div className="flex justify-between gap-3"><div className="text-sm"><b>{entry.commitment.header.order_no}</b> — {entry.commitment.item_name}<br/><span className="text-xs text-slate-500">Locked Rate {money(entry.commitment.agreed_rate)} · Available {entry.commitment.available} {entry.commitment.uom||""}</span></div><button type="button" onClick={()=>setBasket((current)=>current.filter((row)=>row.commitment.id!==entry.commitment.id))}><Trash2 className="h-4 w-4"/></button></div><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs font-bold">Qty<input className="input mt-1 w-full" type="number" min="0.001" step="0.001" max={entry.commitment.available} value={entry.qty} onChange={(e)=>updateBasket(entry.commitment.id,"qty",e.target.value)}/></label><label className="text-xs font-bold">Godown<select className="input mt-1 w-full" value={entry.godown_id} onChange={(e)=>updateBasket(entry.commitment.id,"godown_id",e.target.value)}><option value="">Select…</option>{godowns.map((godown)=><option key={godown.id} value={godown.id}>{godown.name}{godown.name_urdu?` / ${godown.name_urdu}`:""}</option>)}</select></label></div></div>)}<button type="button" className="btn btn-primary w-full" disabled={poSaving||!basket.length} onClick={()=>void attachPO()}>{poSaving?<Loader2 className="h-4 w-4 animate-spin"/>:<BookOpenCheck className="h-4 w-4"/>}Add Selected to Draft / ڈرافٹ میں شامل کریں</button></div>
          </div>}
        </div>
      </div>
    </div>}

    {chargeOpen&&<div className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/55 p-4 print:hidden">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b p-5"><div><div className="text-lg font-black">Purchase Charges / خریداری چارجز</div><div className="mt-1 text-xs text-slate-500">Charges come only from Charge Master (Purchase/Both). Saving here keeps the invoice Draft; no stock or accounting is posted.</div></div><button type="button" onClick={()=>setChargeOpen(false)}><X className="h-5 w-5"/></button></div>
        <div className="overflow-auto p-5">{chargeError&&<div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{chargeError}</div>}
          {chargeLoading?<div className="flex min-h-40 items-center justify-center"><Loader2 className="mr-2 h-5 w-5 animate-spin"/>Loading Purchase Charges…</div>:<div className="space-y-4">
            <div className="flex flex-wrap gap-2"><select className="input min-w-[280px] flex-1" value={chargeToAdd} onChange={(e)=>setChargeToAdd(e.target.value)}><option value="">— Select Purchase Charge —</option>{availableCharges.map((charge)=><option key={charge.charge_key} value={charge.charge_key}>{charge.charge_name}{charge.charge_name_urdu?` / ${charge.charge_name_urdu}`:""} · {Number(charge.default_rate)||0} {unitLabel(charge.unit)}</option>)}</select><button type="button" className="btn btn-secondary" disabled={!chargeToAdd} onClick={addCharge}><Plus className="h-4 w-4"/>Add Charge</button></div>
            {charges.length===0&&<div className="rounded-xl border border-dashed p-5 text-sm text-slate-500">No active Purchase/Both charge is configured. Add it in Charge Master first.</div>}
            {selectedCharges.length===0&&charges.length>0?<div className="rounded-xl border border-dashed p-5 text-sm text-slate-500">No Purchase Charge added to this draft.</div>:<div className="space-y-2">{selectedCharges.map((charge)=><div key={charge.charge_key} className="grid items-center gap-3 rounded-xl border p-3 md:grid-cols-[1fr_150px_120px_auto]"><div><div className="font-semibold">{charge.charge_name}{charge.charge_name_urdu?` / ${charge.charge_name_urdu}`:""}</div><div className="text-xs text-slate-500">{Number(charge.default_rate)||0} {unitLabel(charge.unit)} · {charge.purchase_treatment==="expense"?"Expense":"Landed Cost / Inventory"}{charge.tax_applicable&&draft?.invoice_type==="Tax Invoice"?` · ${Number(draft.tax_percent)||0}% VAT`:""}</div></div><input className="input text-right" type="number" min="0" step="0.01" disabled={charge.is_fixed} value={amounts[charge.charge_key]??"0"} onChange={(e)=>setAmounts((current)=>({...current,[charge.charge_key]:e.target.value}))}/><div className="text-right font-bold">{money(amounts[charge.charge_key])}</div><button type="button" className="text-sm font-bold text-red-600" onClick={()=>{setSelectedKeys((current)=>current.filter((key)=>key!==charge.charge_key));setAmounts((current)=>({...current,[charge.charge_key]:"0"}))}}>Remove</button></div>)}</div>}
            <div className="ml-auto w-full max-w-sm rounded-xl bg-slate-50 p-4 text-sm"><div className="flex justify-between py-1"><span>Charges</span><b>{money(chargeTotal)}</b></div>{draft?.invoice_type==="Tax Invoice"&&<div className="flex justify-between py-1"><span>Charges VAT</span><b>{money(chargeTax)}</b></div>}<div className="mt-2 flex justify-between border-t pt-2 text-base"><span>Charges Total</span><b>{money(chargeTotal+chargeTax)}</b></div></div>
            <div className="flex justify-end gap-2 border-t pt-4"><button type="button" className="btn" onClick={()=>setChargeOpen(false)}>Cancel</button><button type="button" className="btn btn-primary" disabled={chargeSaving} onClick={()=>void saveCharges()}>{chargeSaving?<Loader2 className="h-4 w-4 animate-spin"/>:<ReceiptText className="h-4 w-4"/>}Save Charges to Draft</button></div>
          </div>}
        </div>
      </div>
    </div>}
  </>;
}
