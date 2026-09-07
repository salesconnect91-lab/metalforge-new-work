import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpenCheck, Loader2, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";

type HeaderRow = { id:string; order_no:string; party_id:string|null; party_name:string; status:string };
type CommitmentRow = { id:string; order_id:string; item_name:string; uom:string|null; agreed_rate:number|string|null; rate_status:string };
type PickRow = CommitmentRow & { header:HeaderRow; available:number };
type Godown = { id:string; name:string; name_urdu?:string|null };

export default function SalesOrderBookDraftBridge(){
  const { pathname } = useLocation();
  const match = pathname.match(/^\/sales\/([0-9a-f-]{36})\/edit$/i);
  const invoiceId = match?.[1] ?? null;
  const [enabled,setEnabled]=useState(false);
  const [draft,setDraft]=useState(false);
  const [customerId,setCustomerId]=useState<string|null>(null);
  const [mount,setMount]=useState<HTMLElement|null>(null);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [rows,setRows]=useState<PickRow[]>([]);
  const [godowns,setGodowns]=useState<Godown[]>([]);
  const [selected,setSelected]=useState<PickRow|null>(null);
  const [qty,setQty]=useState("");
  const [godownId,setGodownId]=useState("");

  useEffect(()=>{ if(!invoiceId)return; let alive=true; void(async()=>{
    const [{data:settings},{data:invoice}] = await Promise.all([
      supabase.from("company_settings").select("order_book_enabled").maybeSingle(),
      supabase.from("sales_orders").select("customer_id,status").eq("id",invoiceId).maybeSingle(),
    ]);
    if(!alive)return;
    setEnabled(Boolean(settings?.order_book_enabled));
    setDraft(invoice?.status==="draft");
    setCustomerId(invoice?.customer_id ?? null);
  })(); return()=>{alive=false}; },[invoiceId]);

  useEffect(()=>{
    if(!invoiceId||!enabled||!draft)return;
    const attach=()=>{
      const buttons=Array.from(document.querySelectorAll("button"));
      const addRow=buttons.find(b=>(b.textContent||"").includes("Add Row"));
      if(!addRow?.parentElement)return;
      let host=document.getElementById("sales-order-book-add-host");
      if(!host){ host=document.createElement("span"); host.id="sales-order-book-add-host"; addRow.parentElement.insertBefore(host,addRow); }
      setMount(host);
    };
    attach();
    const observer=new MutationObserver(attach); observer.observe(document.body,{childList:true,subtree:true});
    return()=>{observer.disconnect(); const host=document.getElementById("sales-order-book-add-host"); host?.remove(); setMount(null);};
  },[invoiceId,enabled,draft]);

  const load=async()=>{
    if(!customerId)return;
    setOpen(true); setLoading(true); setError(null); setSelected(null);
    try{
      const [{data:heads,error:he},{data:commitments,error:ce},{data:g,error:ge}] = await Promise.all([
        supabase.from("order_book_headers").select("id,order_no,party_id,party_name,status").eq("order_type","sales").eq("party_id",customerId),
        supabase.from("order_book_commitments").select("id,order_id,item_name,uom,agreed_rate,rate_status").eq("rate_status","agreed"),
        supabase.from("godowns").select("id,name,name_urdu").order("name"),
      ]);
      if(he)throw he; if(ce)throw ce; if(ge)throw ge;
      const hm=new Map((heads||[]).map((h:any)=>[h.id,h as HeaderRow]));
      const result:PickRow[]=[];
      for(const c of (commitments||[]) as CommitmentRow[]){
        const h=hm.get(c.order_id); if(!h)continue;
        const {data:a,error:ae}=await supabase.rpc("order_commitment_available_qty",{p_commitment_id:c.id}); if(ae)throw ae;
        const available=Number(a)||0; if(available>0)result.push({...c,header:h,available});
      }
      setRows(result); setGodowns((g||[]) as Godown[]); setGodownId(String(g?.[0]?.id||""));
    }catch(e:any){setError(e?.message||"Could not load this customer's open Order Book commitments.");}
    finally{setLoading(false);}
  };

  const choose=(r:PickRow)=>{setSelected(r); setQty(String(r.available)); if(!godownId&&godowns[0])setGodownId(godowns[0].id);};
  const add=async()=>{
    if(!invoiceId||!selected)return; setSaving(true); setError(null);
    try{
      const q=Number(qty); if(!q||q<=0)throw new Error("Enter quantity.");
      if(q>selected.available+0.0001)throw new Error(`Quantity cannot exceed ${selected.available} ${selected.uom||""}.`);
      if(!godownId)throw new Error("Select Godown.");
      const {error}=await supabase.rpc("add_order_commitment_to_existing_draft",{p_document_id:invoiceId,p_commitment_id:selected.id,p_qty:q,p_godown_id:godownId,p_kind:"sales_main"});
      if(error)throw error;
      setOpen(false); window.location.reload();
    }catch(e:any){setError(e?.message||"Could not add Order Book line to this invoice.");}
    finally{setSaving(false);}
  };

  const button=useMemo(()=><button type="button" className="btn" onClick={()=>void load()} title="Add another open commitment for this customer to the same invoice"><BookOpenCheck className="h-4 w-4"/> Add from Order Book / آرڈر بک سے شامل کریں</button>,[customerId]);
  if(!invoiceId||!enabled||!draft)return null;

  return <>
    {mount?createPortal(button,mount):<div className="fixed bottom-20 left-5 z-50 print:hidden">{button}</div>}
    {open&&<div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/55 p-4 print:hidden"><div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl">
      <div className="flex items-start justify-between border-b p-5"><div><div className="text-lg font-black">Add from Order Book / آرڈر بک سے شامل کریں</div><div className="mt-1 text-xs text-slate-500">Only this customer's open commitments are shown. Item and agreed rate stay locked; choose Qty and Godown.</div></div><button type="button" onClick={()=>setOpen(false)}><X className="h-5 w-5"/></button></div>
      <div className="p-5">{error&&<div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
      {loading?<div className="flex min-h-40 items-center justify-center"><Loader2 className="mr-2 h-5 w-5 animate-spin"/>Loading open commitments…</div>:selected?<div className="space-y-4">
        <div className="rounded-xl border bg-slate-50 p-4 text-sm"><b>{selected.header.order_no}</b> — {selected.header.party_name}<br/>{selected.item_name} | Available {selected.available} {selected.uom||""} | Locked Rate Rs {Number(selected.agreed_rate||0).toLocaleString()}</div>
        <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-bold">Invoice Qty / مقدار<input className="input mt-1 w-full" type="number" min="0.001" step="0.001" max={selected.available} value={qty} onChange={e=>setQty(e.target.value)}/></label><label className="text-sm font-bold">Godown / گودام<select className="input mt-1 w-full" value={godownId} onChange={e=>setGodownId(e.target.value)}><option value="">Select / منتخب کریں</option>{godowns.map(g=><option key={g.id} value={g.id}>{g.name}{g.name_urdu?` / ${g.name_urdu}`:""}</option>)}</select></label></div>
        <div className="flex justify-between border-t pt-4"><button type="button" className="btn" onClick={()=>setSelected(null)}>Back</button><button type="button" className="btn btn-primary" disabled={saving} onClick={()=>void add()}>{saving?<Loader2 className="h-4 w-4 animate-spin"/>:null}Add to Same Invoice / اسی انوائس میں شامل کریں</button></div>
      </div>:<div className="max-h-[60vh] overflow-auto rounded-xl border"><table className="table w-full"><thead><tr><th>Order</th><th>Item</th><th>Available</th><th>Agreed Rate</th><th></th></tr></thead><tbody>{rows.length===0?<tr><td colSpan={5} className="py-8 text-center text-slate-500">No open agreed commitment remains for this customer.</td></tr>:rows.map(r=><tr key={r.id}><td>{r.header.order_no}</td><td>{r.item_name}</td><td>{r.available} {r.uom||""}</td><td>Rs {Number(r.agreed_rate||0).toLocaleString()}</td><td><button type="button" className="btn btn-primary" onClick={()=>choose(r)}>Select</button></td></tr>)}</tbody></table></div>}
      </div>
    </div></div>}
  </>;
}
