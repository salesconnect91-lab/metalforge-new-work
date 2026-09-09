import SearchableSelect from "@/components/SearchableSelect";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpenCheck, Loader2, Plus, Trash2, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

type Kind = "sales" | "purchase";
type HeaderRow = { id:string; order_no:string; order_type:Kind; party_id:string|null; party_name:string; status:string };
type CommitmentRow = { id:string; order_id:string; item_id:string; item_name:string; uom:string|null; agreed_rate:number|string|null; rate_status:string };
type PickRow = CommitmentRow & { header:HeaderRow; available:number };
type Godown = { id:string; name:string; name_urdu?:string|null };
type BasketRow = { commitment:PickRow; qty:string; godown_id:string };

export default function UnifiedOrderBookInvoicePicker(){
  const {pathname}=useLocation();
  const navigate=useNavigate();
  const salesNew=pathname==="/sales/new";
  const purchaseNew=pathname==="/purchase/new";
  const salesConsolidated=pathname==="/sales/consolidated";
  const purchaseConsolidated=pathname==="/purchase/consolidated";
  const orderBookPage=pathname==="/sales/order-book"||pathname==="/purchase/order-book";
  const active=salesNew||purchaseNew||salesConsolidated||purchaseConsolidated;
  const kind:Kind=(salesNew||salesConsolidated)?"sales":"purchase";
  const consolidated=salesConsolidated||purchaseConsolidated;

  const [enabled,setEnabled]=useState(false);
  const [mount,setMount]=useState<HTMLElement|null>(null);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [rows,setRows]=useState<PickRow[]>([]);
  const [godowns,setGodowns]=useState<Godown[]>([]);
  const [basket,setBasket]=useState<BasketRow[]>([]);
  const [partyId,setPartyId]=useState<string|null>(null);
  const [invoiceType,setInvoiceType]=useState<"without_tax"|"with_tax">("without_tax");

  useEffect(()=>{
    if(!active)return;
    let alive=true;
    void(async()=>{
      const {data}=await supabase.from("company_settings").select("order_book_enabled").maybeSingle();
      if(alive)setEnabled(Boolean(data?.order_book_enabled));
    })();
    return()=>{alive=false};
  },[active]);

  useEffect(()=>{
    if(!orderBookPage)return;
    const removeDirectCreate=()=>{
      document.querySelectorAll("button").forEach((button)=>{
        const text=(button.textContent||"").replace(/\s+/g," ").trim().toLowerCase();
        if(text.includes("create invoice")||text.includes("انوائس بنائیں")) button.style.display="none";
      });
    };
    removeDirectCreate();
    const observer=new MutationObserver(removeDirectCreate);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[orderBookPage]);

  useEffect(()=>{
    if(!active||!enabled)return;
    const attach=()=>{
      const addRow=Array.from(document.querySelectorAll("button")).find(b=>(b.textContent||"").includes("Add Row"));
      if(!addRow?.parentElement){setMount(null);return;}
      let host=document.getElementById("unified-order-book-picker-host");
      if(!host){host=document.createElement("span");host.id="unified-order-book-picker-host";addRow.parentElement.insertBefore(host,addRow);}
      setMount(host);
    };
    attach();
    const observer=new MutationObserver(attach);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>{observer.disconnect();document.getElementById("unified-order-book-picker-host")?.remove();setMount(null);};
  },[active,enabled,pathname]);

  const load=async()=>{
    setOpen(true);setLoading(true);setError(null);setBasket([]);setPartyId(null);
    try{
      const [{data:heads,error:he},{data:commitments,error:ce},{data:g,error:ge}]=await Promise.all([
        supabase.from("order_book_headers").select("id,order_no,order_type,party_id,party_name,status").eq("order_type",kind).in("status",["confirmed","partially_fulfilled","rate_pending"]),
        supabase.from("order_book_commitments").select("id,order_id,item_id,item_name,uom,agreed_rate,rate_status").eq("rate_status","agreed"),
        supabase.from("godowns").select("id,name,name_urdu").order("name")
      ]);
      if(he)throw he;if(ce)throw ce;if(ge)throw ge;
      const hm=new Map((heads||[]).map((h:any)=>[h.id,h as HeaderRow]));
      const result:PickRow[]=[];
      for(const c of (commitments||[]) as CommitmentRow[]){
        const h=hm.get(c.order_id);if(!h)continue;
        const {data:a,error:ae}=await supabase.rpc("order_commitment_available_qty",{p_commitment_id:c.id});
        if(ae)throw ae;
        const available=Number(a)||0;
        if(available>0)result.push({...c,header:h,available});
      }
      setRows(result);setGodowns((g||[]) as Godown[]);
    }catch(e:any){setError(e?.message||"Could not load open Order Book commitments.");}
    finally{setLoading(false);}
  };

  const visibleRows=useMemo(()=>partyId?rows.filter(r=>r.header.party_id===partyId):rows,[rows,partyId]);
  const addToBasket=(row:PickRow)=>{
    if(basket.some(x=>x.commitment.id===row.id))return;
    const nextParty=row.header.party_id||null;
    if(partyId&&nextParty!==partyId){setError("One invoice can only contain Order Book commitments for the same customer/supplier.");return;}
    setPartyId(nextParty);
    setBasket(current=>[...current,{commitment:row,qty:String(row.available),godown_id:godowns[0]?.id||""}]);
    setError(null);
  };
  const removeBasket=(id:string)=>{
    setBasket(current=>{const next=current.filter(x=>x.commitment.id!==id);if(!next.length)setPartyId(null);return next;});
  };
  const updateBasket=(id:string,field:"qty"|"godown_id",value:string)=>setBasket(current=>current.map(x=>x.commitment.id===id?{...x,[field]:value}:x));

  const createInvoice=async()=>{
    if(!basket.length)return setError("Select at least one Order Book commitment.");
    setSaving(true);setError(null);
    try{
      for(const line of basket){
        const q=Number(line.qty);
        if(!q||q<=0||q>line.commitment.available+0.0001)throw new Error(`Qty for ${line.commitment.item_name} must be between 0 and ${line.commitment.available}.`);
        if(!line.godown_id)throw new Error(`Select Godown for ${line.commitment.item_name}.`);
      }
      const first=basket[0];
      let draftId="";let path="";
      if(consolidated){
        const {data,error}=await supabase.rpc("create_consolidated_invoice_from_order_commitment",{p_commitment_id:first.commitment.id,p_qty:Number(first.qty),p_godown_id:first.godown_id,p_invoice_type:invoiceType});
        if(error)throw error;
        draftId=String((data as any)?.invoice_id||(data as any)?.id||"");
        path=String((data as any)?.path||pathname);
      }else{
        const {data,error}=await supabase.rpc("create_invoice_from_order_commitment",{p_commitment_id:first.commitment.id,p_qty:Number(first.qty),p_godown_id:first.godown_id,p_invoice_type:invoiceType});
        if(error)throw error;
        draftId=String((data as any)?.invoice_id||(data as any)?.id||"");
        path=String((data as any)?.path||"");
      }
      if(!draftId){
        const table=consolidated?(kind==="sales"?"consolidated_sales_invoice_lines":"consolidated_purchase_invoice_lines"):(kind==="sales"?"sales_order_lines":"purchase_order_lines");
        const key=consolidated?"invoice_id":"order_id";
        const {data:line,error:le}=await supabase.from(table).select(key).eq("order_book_commitment_id",first.commitment.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
        if(le)throw le;
        draftId=String((line as any)?.[key]||"");
      }
      if(!draftId)throw new Error("Draft was created but its ID could not be resolved.");
      for(const line of basket.slice(1)){
        const p_kind=consolidated?(kind==="sales"?"sales_consolidated":"purchase_consolidated"):(kind==="sales"?"sales_main":"purchase_main");
        const {error}=await supabase.rpc("add_order_commitment_to_existing_draft",{p_document_id:draftId,p_commitment_id:line.commitment.id,p_qty:Number(line.qty),p_godown_id:line.godown_id,p_kind});
        if(error)throw error;
      }
      setOpen(false);
      if(consolidated){
        window.sessionStorage.setItem("navilo:lastOrderBookConsolidatedDraft",draftId);
        window.location.assign(path||pathname);
      }else{
        // Backend owns the canonical draft destination for each document kind.
        // This is especially important for Purchase, whose draft/detail route differs
        // from Sales. Never invent an /edit URL if the RPC returned the correct path.
        navigate(path||(kind==="sales"?`/sales/${draftId}/edit`:`/purchase/${draftId}`));
      }
    }catch(e:any){setError(e?.message||"Could not create invoice from Order Book.");}
    finally{setSaving(false);}
  };

  if(!active||!enabled)return null;
  const button=<button type="button" className="btn btn-secondary" onClick={()=>void load()} title="Add one or more open Order Book commitments to one invoice"><BookOpenCheck className="h-4 w-4"/> Add from Order Book / آرڈر بک سے شامل کریں</button>;

  return <>
    {mount?createPortal(button,mount):<div className="fixed bottom-5 left-5 z-50 print:hidden">{button}</div>}
    {open&&<div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-950/55 p-4 print:hidden"><div className="w-full max-w-6xl rounded-2xl bg-white shadow-2xl">
      <div className="flex items-start justify-between border-b p-5"><div><div className="text-lg font-black">Add from Order Book / آرڈر بک سے شامل کریں</div><div className="mt-1 text-xs text-slate-500">Select one or multiple commitments for the same party. Agreed rate stays locked; Qty and Godown remain selectable.</div></div><button type="button" onClick={()=>setOpen(false)}><X className="h-5 w-5"/></button></div>
      <div className="p-5">{error&&<div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
        {loading?<div className="flex min-h-48 items-center justify-center"><Loader2 className="mr-2 h-5 w-5 animate-spin"/>Loading open commitments…</div>:<div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <div className="max-h-[58vh] overflow-auto rounded-xl border"><table className="table w-full"><thead><tr><th>Order</th><th>Party</th><th>Item</th><th>Available</th><th>Rate</th><th></th></tr></thead><tbody>{visibleRows.length===0?<tr><td colSpan={6} className="py-8 text-center text-slate-500">No open agreed commitment available.</td></tr>:visibleRows.map(r=><tr key={r.id}><td>{r.header.order_no}</td><td>{r.header.party_name}</td><td>{r.item_name}</td><td>{r.available} {r.uom||""}</td><td>Rs {Number(r.agreed_rate||0).toLocaleString()}</td><td><button type="button" className="btn" disabled={basket.some(x=>x.commitment.id===r.id)} onClick={()=>addToBasket(r)}><Plus className="h-4 w-4"/>Add</button></td></tr>)}</tbody></table></div>
          <div className="space-y-3"><div className="font-black">This Invoice / اس انوائس میں</div>{basket.length===0?<div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">Choose an Order Book commitment. After the first selection, only the same party's remaining orders are shown.</div>:basket.map(line=><div key={line.commitment.id} className="rounded-xl border p-3"><div className="flex justify-between gap-3"><div className="text-sm"><b>{line.commitment.header.order_no}</b> — {line.commitment.item_name}<br/><span className="text-xs text-slate-500">Locked Rate Rs {Number(line.commitment.agreed_rate||0).toLocaleString()} | Available {line.commitment.available} {line.commitment.uom||""}</span></div><button type="button" onClick={()=>removeBasket(line.commitment.id)}><Trash2 className="h-4 w-4"/></button></div><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs font-bold">Qty<input className="input mt-1 w-full" type="number" min="0.001" step="0.001" max={line.commitment.available} value={line.qty} onChange={e=>updateBasket(line.commitment.id,"qty",e.target.value)}/></label><label className="text-xs font-bold">Godown<SearchableSelect className="input mt-1 w-full" value={line.godown_id} onChange={e=>updateBasket(line.commitment.id,"godown_id",e.target.value)}><option value="">Select…</option>{godowns.map(g=><option key={g.id} value={g.id}>{g.name}{g.name_urdu?` / ${g.name_urdu}`:""}</option>)}</SearchableSelect></label></div></div>)}
            <label className="block text-xs font-bold">Invoice Type<SearchableSelect className="input mt-1 w-full" value={invoiceType} onChange={e=>setInvoiceType(e.target.value as any)}><option value="without_tax">Without Tax / بغیر ٹیکس</option><option value="with_tax">With Tax / ٹیکس کے ساتھ</option></SearchableSelect></label>
            <button type="button" className="btn btn-primary w-full" disabled={saving||!basket.length} onClick={()=>void createInvoice()}>{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<BookOpenCheck className="h-4 w-4"/>}{consolidated?"Create One Consolidated Draft / ایک کنسالیڈیٹڈ ڈرافٹ بنائیں":"Create One Invoice Draft / ایک انوائس ڈرافٹ بنائیں"}</button>
          </div>
        </div>}
      </div>
    </div></div>}
  </>;
}
