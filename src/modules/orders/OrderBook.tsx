import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus, RefreshCw, Save, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ErrorBanner, PageHeader } from "@/components/ui";

type OrderType = "sales" | "purchase";
type Party = { id: string; name: string; name_urdu?: string | null };
type Item = { id: string; name: string; name_urdu?: string | null };
type Salesperson = { id: string; employee_code: string | null; name: string };
type Commitment = { id:string; order_id:string; item_id:string; item_name:string; ordered_qty:number|string; fulfilled_qty:number|string; cancelled_qty:number|string; uom:string|null; rate_status:"agreed"|"pending"; agreed_rate:number|string|null; effective_at:string|null; source:"order"|"spot"|"rate_revision"; status:string; remarks:string|null };
type Header = { id:string; order_no:string; order_date:string; party_id:string; party_name:string; salesperson_id:string|null; salesperson_name:string|null; status:string; remarks:string|null; order_book_commitments?:Commitment[] };
type DraftLine = { item_id:string; qty:string; uom:string; rate_status:"agreed"|"pending"; rate:string; effective_date:string; remarks:string };

const today=()=>new Date().toISOString().slice(0,10);
const emptyLine=():DraftLine=>({item_id:"",qty:"",uom:"KG",rate_status:"pending",rate:"",effective_date:today(),remarks:""});
const n=(v:unknown)=>Number(v)||0;

export default function OrderBook({type}:{type:OrderType}){
  const nav=useNavigate();
  const sales=type==="sales";
  const [enabled,setEnabled]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [parties,setParties]=useState<Party[]>([]);
  const [items,setItems]=useState<Item[]>([]);
  const [salespersons,setSalespersons]=useState<Salesperson[]>([]);
  const [orders,setOrders]=useState<Header[]>([]);
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState<"all"|"open"|"rate_pending"|"completed">("all");
  const [createOpen,setCreateOpen]=useState(false);
  const [partyId,setPartyId]=useState("");
  const [orderDate,setOrderDate]=useState(today());
  const [salespersonId,setSalespersonId]=useState("");
  const [remarks,setRemarks]=useState("");
  const [lines,setLines]=useState<DraftLine[]>([emptyLine()]);
  const [rateTarget,setRateTarget]=useState<Commitment|null>(null);
  const [newRate,setNewRate]=useState("");
  const [rateDate,setRateDate]=useState(today());
  const [rateReason,setRateReason]=useState("");
  const [spotOrder,setSpotOrder]=useState<Header|null>(null);
  const [spotLine,setSpotLine]=useState<DraftLine>({...emptyLine(),rate_status:"agreed"});
  const [screenMode,setScreenMode]=useState("bilingual");
  const [primary,setPrimary]=useState("en");
  const bi=(en:string,ur:string)=>screenMode==="single"?(primary==="ur"?ur:en):`${en} / ${ur}`;

  const load=useCallback(async()=>{
    setLoading(true); setError(null);
    try{
      const partyTable=sales?"customers":"suppliers";
      const settingsQ=supabase.from("company_settings").select("order_book_enabled,screen_language_mode,screen_primary_language").maybeSingle();
      const partyQ=supabase.from(partyTable).select("id,name,name_urdu").order("name");
      const itemQ=supabase.from("items").select("id,name,name_urdu").order("name");
      const orderQ=supabase.from("order_book_headers").select("*,order_book_commitments(*)").eq("order_type",type).order("order_date",{ascending:false}).order("created_at",{ascending:false});
      const salespersonQ=sales
        ? supabase.from("employees").select("id,employee_code,name").eq("is_active",true).order("name")
        : Promise.resolve({data:[] as Salesperson[],error:null});
      const [settingsRes,partyRes,itemRes,orderRes,salespersonRes]=await Promise.all([settingsQ,partyQ,itemQ,orderQ,salespersonQ]);
      const first=settingsRes.error||partyRes.error||itemRes.error||orderRes.error||salespersonRes.error;
      if(first) throw first;
      setEnabled(Boolean(settingsRes.data?.order_book_enabled));
      setScreenMode(settingsRes.data?.screen_language_mode||"bilingual");
      setPrimary(settingsRes.data?.screen_primary_language||"en");
      setParties((partyRes.data||[]) as Party[]);
      setItems((itemRes.data||[]) as Item[]);
      setOrders((orderRes.data||[]) as Header[]);
      setSalespersons((salespersonRes.data||[]) as Salesperson[]);
    }catch(e:any){setError(e?.message||"Failed to load order book.")}
    finally{setLoading(false)}
  },[sales,type]);
  useEffect(()=>{void load()},[load]);

  const rows=useMemo(()=>orders.filter(o=>{
    const q=search.toLowerCase().trim();
    const cs=o.order_book_commitments||[];
    const text=[o.order_no,o.party_name,o.salesperson_name,...cs.map(c=>c.item_name)].filter(Boolean).join(" ").toLowerCase();
    if(q&&!text.includes(q)) return false;
    if(filter==="all") return true;
    if(filter==="completed") return o.status==="completed";
    if(filter==="rate_pending") return cs.some(c=>c.rate_status==="pending"&&c.status!=="cancelled"&&c.status!=="completed");
    return cs.some(c=>Math.max(0,n(c.ordered_qty)-n(c.fulfilled_qty)-n(c.cancelled_qty))>0&&c.status!=="cancelled");
  }),[orders,search,filter]);

  const totals=useMemo(()=>rows.reduce((a,o)=>{
    for(const c of o.order_book_commitments||[]){
      const ordered=n(c.ordered_qty),done=n(c.fulfilled_qty),cancel=n(c.cancelled_qty),bal=Math.max(0,ordered-done-cancel);
      a.ordered+=ordered; a.fulfilled+=done; a.balance+=bal;
      if(c.rate_status==="pending") a.pending+=bal; else a.value+=bal*n(c.agreed_rate);
    }
    return a;
  },{ordered:0,fulfilled:0,balance:0,pending:0,value:0}),[rows]);

  const partyName=(id:string)=>parties.find(p=>p.id===id)?.name||"";
  const itemName=(id:string)=>items.find(i=>i.id===id)?.name||"";
  const salespersonName=(id:string)=>salespersons.find(s=>s.id===id)?.name||"";
  const makeOrderNo=()=>`${sales?"SO":"POB"}-${today().replaceAll("-","")}-${Date.now().toString().slice(-6)}`;

  const createOrder=async()=>{
    setError(null);
    if(!partyId) return setError(bi("Select customer/supplier.","گاہک/سپلائر منتخب کریں۔"));
    if(sales&&!salespersonId) return setError(bi("Select salesperson.","سیلز پرسن منتخب کریں۔"));
    const valid=lines.filter(l=>l.item_id&&n(l.qty)>0);
    if(!valid.length) return setError(bi("Add at least one valid item line.","کم از کم ایک درست آئٹم لائن شامل کریں۔"));
    setSaving(true);
    try{
      const pending=valid.some(l=>l.rate_status==="pending");
      const {data:h,error:he}=await supabase.from("order_book_headers").insert({
        order_type:type,order_no:makeOrderNo(),order_date:orderDate,
        party_id:partyId,party_name:partyName(partyId),
        salesperson_id:sales?salespersonId:null,
        salesperson_name:sales?salespersonName(salespersonId):null,
        status:pending?"rate_pending":"confirmed",remarks:remarks.trim()||null
      }).select("id").single();
      if(he) throw he;
      const payload=valid.map(l=>({
        order_id:h.id,item_id:l.item_id,item_name:itemName(l.item_id),ordered_qty:n(l.qty),uom:l.uom.trim()||"KG",
        rate_status:l.rate_status,agreed_rate:l.rate_status==="agreed"?n(l.rate):null,
        effective_at:l.rate_status==="agreed"?new Date(`${l.effective_date}T00:00:00`).toISOString():null,
        source:"order",remarks:l.remarks.trim()||null
      }));
      const{error:le}=await supabase.from("order_book_commitments").insert(payload); if(le) throw le;
      setCreateOpen(false); setPartyId(""); setSalespersonId(""); setRemarks(""); setLines([emptyLine()]); await load();
    }catch(e:any){setError(e?.message||"Could not create order.")}
    finally{setSaving(false)}
  };

  const activateRate=async()=>{
    if(!rateTarget||!newRate||!rateReason.trim()) return setError(bi("Rate and reason are required.","ریٹ اور وجہ ضروری ہیں۔"));
    setSaving(true); setError(null);
    try{
      const {error:hist}=await supabase.from("order_book_rate_history").insert({commitment_id:rateTarget.id,old_rate:rateTarget.agreed_rate==null?null:n(rateTarget.agreed_rate),new_rate:n(newRate),old_rate_status:rateTarget.rate_status,new_rate_status:"agreed",effective_at:new Date(`${rateDate}T00:00:00`).toISOString(),reason:rateReason.trim()});
      if(hist) throw hist;
      const {error:up}=await supabase.from("order_book_commitments").update({rate_status:"agreed",agreed_rate:n(newRate),effective_at:new Date(`${rateDate}T00:00:00`).toISOString(),updated_at:new Date().toISOString()}).eq("id",rateTarget.id);
      if(up) throw up;
      setRateTarget(null); setNewRate(""); setRateReason(""); await load();
    }catch(e:any){setError(e?.message||"Rate update failed.")}
    finally{setSaving(false)}
  };

  const addSpot=async()=>{
    if(!spotOrder||!spotLine.item_id||n(spotLine.qty)<=0) return;
    setSaving(true); setError(null);
    try{
      const {error}=await supabase.from("order_book_commitments").insert({order_id:spotOrder.id,item_id:spotLine.item_id,item_name:itemName(spotLine.item_id),ordered_qty:n(spotLine.qty),uom:spotLine.uom||"KG",rate_status:spotLine.rate_status,agreed_rate:spotLine.rate_status==="agreed"?n(spotLine.rate):null,effective_at:spotLine.rate_status==="agreed"?new Date(`${spotLine.effective_date}T00:00:00`).toISOString():null,source:"spot",remarks:spotLine.remarks.trim()||null});
      if(error) throw error; setSpotOrder(null); setSpotLine({...emptyLine(),rate_status:"agreed"}); await load();
    }catch(e:any){setError(e?.message||"Spot quantity failed.")}
    finally{setSaving(false)}
  };

  if(loading) return <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="mr-2 h-5 w-5 animate-spin"/>{bi("Loading Order Book...","آرڈر بک لوڈ ہو رہی ہے...")}</div>;

  return <div className="space-y-4">
    <PageHeader title={sales?bi("Sales Order Book & Rate Commitments","سیلز آرڈر بک اور ریٹ معاہدے"):bi("Purchase Order Book & Rate Commitments","پرچیز آرڈر بک اور ریٹ معاہدے")} subtitle={bi("Quantity, agreed/pending rates, fulfillment and complete history without accounting impact until invoice posting.","مقدار، طے شدہ/زیر التوا ریٹس، تکمیل اور مکمل تاریخ؛ اکاؤنٹنگ اثر صرف انوائس پوسٹنگ پر۔")}/>
    {error&&<ErrorBanner message={error}/>} {!enabled&&<div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><b>{bi("Order Book service is inactive for this company.","اس کمپنی کے لیے آرڈر بک سروس غیر فعال ہے۔")}</b><br/><Link to="/settings/order-book" className="btn btn-primary mt-3">{bi("Open Order Book Settings","آرڈر بک سیٹنگز کھولیں")}</Link></div>}
    <div className="grid gap-3 sm:grid-cols-5"><Kpi label={bi("Ordered Qty","آرڈر مقدار")} value={totals.ordered}/><Kpi label={bi("Fulfilled","مکمل شدہ")} value={totals.fulfilled}/><Kpi label={bi("Balance Qty","بقایا مقدار")} value={totals.balance}/><Kpi label={bi("Rate Pending Qty","زیر التوا ریٹ مقدار")} value={totals.pending}/><Kpi label={bi("Open Committed Value","اوپن کمٹڈ ویلیو")} value={totals.value} money/></div>
    <div className="flex gap-2 rounded-xl border bg-white p-3"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4"/><input className="input w-full pl-9" value={search} onChange={e=>setSearch(e.target.value)} placeholder={bi("Search order, party, item...","آرڈر، پارٹی، آئٹم تلاش کریں...")}/></div>{(["all","open","rate_pending","completed"] as const).map(f=><button className={`btn ${filter===f?"btn-primary":""}`} onClick={()=>setFilter(f)} key={f}>{f}</button>)}<button className="btn" onClick={()=>void load()}><RefreshCw size={15}/></button>{enabled&&<button className="btn btn-primary" onClick={()=>setCreateOpen(true)}><Plus size={16}/>{sales?bi("New Sales Order","نیا سیلز آرڈر"):bi("New Purchase Order","نیا پرچیز آرڈر")}</button>}</div>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="table w-full"><thead><tr><th>{bi("Order / Date","آرڈر / تاریخ")}</th><th>{sales?bi("Customer / Salesperson","گاہک / سیلز پرسن"):bi("Supplier","سپلائر")}</th><th>{bi("Item","آئٹم")}</th><th>{bi("Ordered","آرڈر")}</th><th>{bi("Fulfilled","مکمل")}</th><th>{bi("Balance","بقایا")}</th><th>{bi("Rate","ریٹ")}</th><th>{bi("Action","عمل")}</th></tr></thead><tbody>{rows.length===0?<tr><td colSpan={8} className="py-10 text-center">{bi("No order records found.","کوئی آرڈر ریکارڈ نہیں ملا۔")}</td></tr>:rows.flatMap(o=>(o.order_book_commitments||[]).map(c=>{const bal=Math.max(0,n(c.ordered_qty)-n(c.fulfilled_qty)-n(c.cancelled_qty));return <tr key={c.id}><td>{o.order_no}<br/>{o.order_date}</td><td>{o.party_name}{sales&&<><br/>{o.salesperson_name||"—"}</>}</td><td>{c.item_name}</td><td>{n(c.ordered_qty)}</td><td>{n(c.fulfilled_qty)}</td><td>{bal}</td><td>{c.rate_status==="agreed"?`Rs ${n(c.agreed_rate)}`:bi("Pending","زیر التوا")}</td><td className="space-x-1">{c.rate_status==="pending"&&<button className="btn" onClick={()=>setRateTarget(c)}>{bi("Set Rate","ریٹ لگائیں")}</button>}{c.rate_status==="agreed"&&bal>0&&<button className="btn btn-primary" onClick={()=>nav(`${sales?"/sales/new":"/purchase/new"}?orderCommitment=${c.id}`)}>{bi("Create Invoice","انوائس بنائیں")}</button>}<button className="btn" onClick={()=>setSpotOrder(o)}>{bi("Spot Qty","فوری مقدار")}</button></td></tr>}))}</tbody></table></div>
    {createOpen&&<Modal title={sales?bi("New Sales Order","نیا سیلز آرڈر"):bi("New Purchase Order","نیا پرچیز آرڈر")} close={()=>setCreateOpen(false)}><div className="grid gap-3 sm:grid-cols-3"><label>{bi(sales?"Customer":"Supplier",sales?"گاہک":"سپلائر")}<select className="input w-full" value={partyId} onChange={e=>setPartyId(e.target.value)}><option value="">Select...</option>{parties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>{bi("Order Date","آرڈر تاریخ")}<input type="date" className="input w-full" value={orderDate} onChange={e=>setOrderDate(e.target.value)}/></label>{sales&&<label>{bi("Salesperson","سیلز پرسن")}<select className="input w-full" value={salespersonId} onChange={e=>setSalespersonId(e.target.value)}><option value="">{bi("Select salesperson...","سیلز پرسن منتخب کریں...")}</option>{salespersons.map(s=><option key={s.id} value={s.id}>{s.employee_code?`${s.employee_code} - ${s.name}`:s.name}</option>)}</select></label>}</div>{sales&&salespersons.length===0&&<div className="mt-2 text-sm font-semibold text-amber-700">{bi("No active employee found. Add/activate an employee in Employees Master first.","کوئی فعال ملازم نہیں ملا۔ پہلے ایمپلائیز ماسٹر میں ملازم شامل یا فعال کریں۔")}</div>}{lines.map((l,i)=><div className="mt-3 grid gap-2 sm:grid-cols-6" key={i}><select className="input" value={l.item_id} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,item_id:e.target.value}:x))}><option value="">Item...</option>{items.map(it=><option key={it.id} value={it.id}>{it.name}</option>)}</select><input className="input" placeholder="Qty" value={l.qty} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,qty:e.target.value}:x))}/><input className="input" value={l.uom} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,uom:e.target.value}:x))}/><select className="input" value={l.rate_status} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,rate_status:e.target.value as "pending"|"agreed"}:x))}><option value="pending">{bi("Rate Pending","ریٹ زیر التوا")}</option><option value="agreed">{bi("Agreed","طے شدہ")}</option></select><input className="input" placeholder={bi("Rate","ریٹ")} disabled={l.rate_status==="pending"} value={l.rate} onChange={e=>setLines(v=>v.map((x,j)=>j===i?{...x,rate:e.target.value}:x))}/><button className="btn" onClick={()=>setLines(v=>v.filter((_,j)=>j!==i))}><X/></button></div>)}<button className="btn mt-3" onClick={()=>setLines(v=>[...v,emptyLine()])}><Plus/>Add Line</button><button className="btn btn-primary mt-3 ml-2" disabled={saving} onClick={()=>void createOrder()}><Save/>Save Order</button></Modal>}
    {rateTarget&&<Modal title={bi("Set / Revise Rate","ریٹ مقرر / تبدیل کریں")} close={()=>setRateTarget(null)}><input className="input" placeholder="New Rate" value={newRate} onChange={e=>setNewRate(e.target.value)}/><input type="date" className="input ml-2" value={rateDate} onChange={e=>setRateDate(e.target.value)}/><input className="input ml-2" placeholder="Reason" value={rateReason} onChange={e=>setRateReason(e.target.value)}/><button className="btn btn-primary ml-2" onClick={()=>void activateRate()}>Save</button></Modal>}
    {spotOrder&&<Modal title={bi("Add Spot / Extra Quantity","فوری / اضافی مقدار شامل کریں")} close={()=>setSpotOrder(null)}><select className="input" value={spotLine.item_id} onChange={e=>setSpotLine(v=>({...v,item_id:e.target.value}))}><option value="">Item...</option>{items.map(it=><option key={it.id} value={it.id}>{it.name}</option>)}</select><input className="input ml-2" placeholder="Qty" value={spotLine.qty} onChange={e=>setSpotLine(v=>({...v,qty:e.target.value}))}/><input className="input ml-2" placeholder="Rate" value={spotLine.rate} onChange={e=>setSpotLine(v=>({...v,rate:e.target.value}))}/><button className="btn btn-primary ml-2" onClick={()=>void addSpot()}>Save</button></Modal>}
  </div>
}

function Kpi({label,value,money=false}:{label:string;value:number;money?:boolean}){return <div className="rounded-xl border bg-white p-3"><div className="text-xs font-bold text-slate-500">{label}</div><div className="mt-1 font-black">{money?`Rs ${value.toLocaleString()}`:value.toLocaleString()}</div></div>}
function Modal({title,children,close}:{title:string;children:ReactNode;close:()=>void}){return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-5xl rounded-2xl bg-white p-5"><div className="mb-4 flex justify-between"><h2 className="text-lg font-black">{title}</h2><button onClick={close}><X/></button></div>{children}</div></div>}