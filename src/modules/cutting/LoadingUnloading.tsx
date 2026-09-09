import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Modal, PageHeader } from "@/components/ui";
import SearchableSelect from "@/components/SearchableSelect";

type Status = "issued" | "loading" | "weighed" | "finalized" | "cancelled";
type GP = { id:string; pass_no:string; customer_id:string|null; customer_name:string|null; vehicle_no:string|null; driver_name:string|null; token_notes:string|null; loaded_by_name:string|null; tare_weight:number; gross_weight:number; net_weight:number; status:Status; pass_date:string; created_at:string };
type Line = { id?:string; gate_pass_id?:string; item_id:string|null; item_description:string; requested_qty:number; actual_qty:number; uom:string; warehouse_id:string|null; godown_id:string|null; remarks:string|null; warehouse?:{name:string}|null; godown?:{name:string}|null };
type Customer = { id:string; name:string; name_urdu:string|null; phone:string|null };
type Item = { id:string; sku:string; name:string; name_urdu:string|null; grade:string|null; size:string|null; unit:string|null; warehouse_id:string|null };
type Uom = { id:string; name:string; symbol:string };
type Warehouse = { id:string; name:string; name_urdu:string|null };
type Godown = { id:string; name:string; location:string|null; warehouse_id:string|null };

const emptyLine=():Line=>({item_id:null,item_description:"",requested_qty:0,actual_qty:0,uom:"kg",warehouse_id:null,godown_id:null,remarks:null});
const statusLabel:Record<Status,string>={issued:"Token Issued",loading:"Loading",weighed:"Kanta Complete",finalized:"Final Gate Pass",cancelled:"Cancelled"};

export default function LoadingUnloading(){
 const [rows,setRows]=useState<GP[]>([]);
 const [lines,setLines]=useState<Record<string,Line[]>>({});
 const [customers,setCustomers]=useState<Customer[]>([]);
 const [items,setItems]=useState<Item[]>([]);
 const [uoms,setUoms]=useState<Uom[]>([]);
 const [warehouses,setWarehouses]=useState<Warehouse[]>([]);
 const [godowns,setGodowns]=useState<Godown[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const [createOpen,setCreateOpen]=useState(false);
 const [workOpen,setWorkOpen]=useState(false);
 const [kantaOpen,setKantaOpen]=useState(false);
 const [selected,setSelected]=useState<GP|null>(null);
 const [token,setToken]=useState({customer_id:"",customer_name:"",vehicle_no:"",driver_name:"",token_notes:"",pass_date:new Date().toISOString().slice(0,10)});
 const [tokenLines,setTokenLines]=useState<Line[]>([emptyLine()]);
 const [workLines,setWorkLines]=useState<Line[]>([]);
 const [loadedBy,setLoadedBy]=useState("");
 const [tare,setTare]=useState("");
 const [gross,setGross]=useState("");
 const [weighRef,setWeighRef]=useState("");
 const net=Math.max((Number(gross)||0)-(Number(tare)||0),0);

 const load=useCallback(async()=>{
  setLoading(true);setError(null);
  const [g,l,c,i,u,w,d]=await Promise.all([
   supabase.from("gate_passes").select("id,pass_no,customer_id,customer_name,vehicle_no,driver_name,token_notes,loaded_by_name,tare_weight,gross_weight,net_weight,status,pass_date,created_at").order("created_at",{ascending:false}),
   supabase.from("gate_pass_lines").select("id,gate_pass_id,item_id,item_description,requested_qty,actual_qty,uom,warehouse_id,godown_id,remarks,warehouse:warehouses(name),godown:godowns(name)"),
   supabase.from("customers").select("id,name,name_urdu,phone").order("name"),
   supabase.from("items").select("id,sku,name,name_urdu,grade,size,unit,warehouse_id").order("name"),
   supabase.from("uom").select("id,name,symbol").order("name"),
   supabase.from("warehouses").select("id,name,name_urdu").order("name"),
   supabase.from("godowns").select("id,name,location,warehouse_id").order("name")
  ]);
  const e=g.error||l.error||c.error||i.error||u.error||w.error||d.error;
  if(e)setError(e.message);else{
   setRows((g.data||[]) as GP[]);
   const m:Record<string,Line[]>={};
   for(const x of (l.data||[]) as any[])(m[x.gate_pass_id]??=[]).push(x);
   setLines(m);
   setCustomers((c.data||[]) as Customer[]);
   setItems((i.data||[]) as Item[]);
   setUoms((u.data||[]) as Uom[]);
   setWarehouses((w.data||[]) as Warehouse[]);
   setGodowns((d.data||[]) as Godown[]);
  }
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);

 const nextNo=useMemo(()=>{let n=0;for(const r of rows){const m=r.pass_no?.match(/(\d+)$/);if(m)n=Math.max(n,Number(m[1]))}return `GP-${String(n+1).padStart(4,"0")}`},[rows]);
 const itemLabel=(x:Item)=>[x.sku,x.name,x.size,x.grade].filter(Boolean).join(" · ");

 const chooseCustomer=(id:string)=>{
  const c=customers.find(x=>x.id===id);
  setToken(t=>({...t,customer_id:id,customer_name:c?.name||""}));
 };
 const chooseItem=(rowIndex:number,id:string)=>{
  const item=items.find(x=>x.id===id);
  setTokenLines(v=>v.map((x,i)=>i===rowIndex?{
   ...x,
   item_id:id||null,
   item_description:item?[item.name,item.size,item.grade].filter(Boolean).join(" / "):"",
   uom:item?.unit||uoms.find(y=>y.symbol.toLowerCase()==="kg")?.symbol||uoms[0]?.symbol||"kg",
   warehouse_id:item?.warehouse_id||null,
   godown_id:null
  }:x));
 };
 const chooseWarehouse=(rowIndex:number,id:string)=>{
  setWorkLines(v=>v.map((x,i)=>i===rowIndex?{...x,warehouse_id:id||null,godown_id:null}:x));
 };
 const chooseGodown=(rowIndex:number,id:string)=>{
  const gd=godowns.find(g=>g.id===id);
  setWorkLines(v=>v.map((x,i)=>i===rowIndex?{...x,godown_id:id||null,warehouse_id:gd?.warehouse_id||x.warehouse_id}:x));
 };

 const createToken=async(e:React.FormEvent)=>{
  e.preventDefault();setError(null);
  const valid=tokenLines.filter(x=>x.item_id&&x.item_description.trim()&&x.requested_qty>0);
  if(!token.customer_id||!token.customer_name.trim()){setError("Customer master se customer select karein.");return}
  if(!valid.length){setError("Kam az kam aik Item Master material aur requested quantity required hai.");return}
  const {data,error}=await supabase.from("gate_passes").insert({
   pass_no:"AUTO",type:"loading",customer_id:token.customer_id,customer_name:token.customer_name.trim(),vehicle_no:token.vehicle_no.trim()||null,driver_name:token.driver_name.trim()||null,token_notes:token.token_notes.trim()||null,status:"issued",pass_date:token.pass_date,tare_weight:0,gross_weight:0,net_weight:0,order_book_header_id:null,sales_order_id:null
  }).select("id,pass_no").single();
  if(error){setError(error.message);return}
  const {error:le}=await supabase.from("gate_pass_lines").insert(valid.map(x=>({gate_pass_id:data.id,item_id:x.item_id,item_description:x.item_description.trim(),requested_qty:x.requested_qty,actual_qty:0,uom:x.uom||"kg",remarks:x.remarks||null})));
  if(le){setError(le.message);return}
  setCreateOpen(false);
  setToken({customer_id:"",customer_name:"",vehicle_no:"",driver_name:"",token_notes:"",pass_date:new Date().toISOString().slice(0,10)});
  setTokenLines([emptyLine()]);
  await load();
 };

 const openLoading=(gp:GP)=>{setSelected(gp);setLoadedBy(gp.loaded_by_name||"");setWorkLines((lines[gp.id]||[]).map(x=>({...x})));setWorkOpen(true)};
 const saveLoading=async(e:React.FormEvent)=>{
  e.preventDefault();if(!selected)return;setError(null);
  for(const x of workLines){if(x.actual_qty<=0||!x.warehouse_id||!x.godown_id){setError("Har loaded line par Actual Qty, Warehouse aur Godown required hain.");return}}
  for(const x of workLines){const {error}=await supabase.from("gate_pass_lines").update({actual_qty:x.actual_qty,godown_id:x.godown_id,warehouse_id:x.warehouse_id,remarks:x.remarks}).eq("id",x.id);if(error){setError(error.message);return}}
  const {error}=await supabase.from("gate_passes").update({status:"loading",loaded_by_name:loadedBy.trim()||null,loading_completed_at:new Date().toISOString()}).eq("id",selected.id);
  if(error){setError(error.message);return}setWorkOpen(false);await load();
 };
 const openKanta=(gp:GP)=>{setSelected(gp);setTare(String(gp.tare_weight||""));setGross(String(gp.gross_weight||""));setWeighRef("");setKantaOpen(true)};
 const saveKanta=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;if(Number(tare)<=0||Number(gross)<=Number(tare)){setError("Valid Tare aur Gross Weight required hai; Gross Tare se zyada hona chahiye.");return}const {error}=await supabase.from("gate_passes").update({tare_weight:Number(tare),gross_weight:Number(gross),status:"weighed",weighed_at:new Date().toISOString(),weighbridge_reference:weighRef.trim()||null}).eq("id",selected.id);if(error){setError(error.message);return}setKantaOpen(false);await load()};
 const finalize=async(gp:GP)=>{if(!confirm(`${gp.pass_no} ko Final Gate Pass banana hai?`))return;const {error}=await supabase.from("gate_passes").update({status:"finalized"}).eq("id",gp.id);if(error)setError(error.message);else await load()};
 const printGP=(gp:GP,final=false)=>{const ls=lines[gp.id]||[];const w=window.open("","_blank","width=1000,height=750");if(!w)return;w.document.write(`<html><head><title>${gp.pass_no}</title><style>body{font-family:Arial;padding:28px}h1{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aaa;padding:8px;font-size:12px}</style></head><body><h1>${final?"FINAL GATE PASS":"LOADING TOKEN"}</h1><p><b>${gp.pass_no}</b> · ${gp.pass_date}</p><p><b>Customer:</b> ${gp.customer_name||"—"} &nbsp; <b>Vehicle:</b> ${gp.vehicle_no||"—"}</p><table><tr><th>Material</th><th>Requested</th><th>Actual</th><th>Warehouse / Godown</th></tr>${ls.map(x=>`<tr><td>${x.item_description}</td><td>${x.requested_qty} ${x.uom}</td><td>${final?`${x.actual_qty} ${x.uom}`:""}</td><td>${final?`${x.warehouse?.name||""} / ${x.godown?.name||""}`:""}</td></tr>`).join("")}</table>${final?`<h3>Weighbridge</h3><p>Tare: ${gp.tare_weight} kg &nbsp; Gross: ${gp.gross_weight} kg &nbsp; Net: ${gp.net_weight} kg</p><p>Loaded By: ${gp.loaded_by_name||"—"}</p>`:""}<script>window.onload=()=>window.print()</script></body></html>`);w.document.close()};
 const action=<button className="btn btn-primary" onClick={()=>setCreateOpen(true)}>+ New Loading Token</button>;

 return <div className="space-y-4"><PageHeader title="Gate Pass / Loading / Kanta" subtitle="Manual Token → Loading → Weighbridge → Final Gate Pass" action={action}/>
 {error&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
 <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{(["issued","loading","weighed","finalized"] as Status[]).map(s=><div key={s} className="rounded-xl border bg-white p-3"><div className="text-xs text-slate-500">{statusLabel[s]}</div><div className="text-2xl font-bold">{rows.filter(r=>r.status===s).length}</div></div>)}</div>
 <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-3">Token / GP</th><th>Customer</th><th>Vehicle</th><th>Material</th><th>Status</th><th className="p-3">Action</th></tr></thead><tbody>{loading?<tr><td className="p-5" colSpan={6}>Loading…</td></tr>:rows.map(gp=><tr key={gp.id} className="border-t"><td className="p-3 font-semibold">{gp.pass_no}</td><td>{gp.customer_name||"—"}</td><td>{gp.vehicle_no||"—"}</td><td>{(lines[gp.id]||[]).map(x=>x.item_description).join(", ")||"—"}</td><td>{statusLabel[gp.status]||gp.status}</td><td className="p-3"><div className="flex flex-wrap gap-1"><button className="btn btn-secondary" onClick={()=>printGP(gp,gp.status==="finalized")}>{gp.status==="finalized"?"Print Final GP":"Print Token"}</button>{gp.status==="issued"&&<button className="btn btn-primary" onClick={()=>openLoading(gp)}>Loading</button>}{gp.status==="loading"&&<button className="btn btn-primary" onClick={()=>openKanta(gp)}>Kanta</button>}{gp.status==="weighed"&&<button className="btn btn-primary" onClick={()=>finalize(gp)}>Generate Final GP</button>}</div></td></tr>)}</tbody></table></div>

 <Modal open={createOpen} onClose={()=>setCreateOpen(false)} title="New Loading Token" panelClassName="!max-w-6xl !w-[96vw]"><form onSubmit={createToken} className="space-y-4">
  <div className="grid gap-3 md:grid-cols-4">
   <div><label className="label">Token / GP No.</label><input className="input bg-slate-100" value={`${nextNo} (Auto)`} readOnly/></div>
   <div><label className="label">Customer / Party</label><SearchableSelect className="input" value={token.customer_id} onChange={e=>chooseCustomer(e.target.value)} searchPlaceholder="Search customer..."><option value="">Select Customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.name_urdu?` / ${c.name_urdu}`:""}{c.phone?` · ${c.phone}`:""}</option>)}</SearchableSelect></div>
   <div><label className="label">Vehicle No.</label><input className="input" placeholder="Vehicle No." value={token.vehicle_no} onChange={e=>setToken({...token,vehicle_no:e.target.value})}/></div>
   <div><label className="label">Date</label><input type="date" className="input" value={token.pass_date} onChange={e=>setToken({...token,pass_date:e.target.value})}/></div>
   <div><label className="label">Driver</label><input className="input" placeholder="Driver Name" value={token.driver_name} onChange={e=>setToken({...token,driver_name:e.target.value})}/></div>
   <div className="md:col-span-3"><label className="label">Token Instructions / Notes</label><input className="input" placeholder="Loading instructions / notes" value={token.token_notes} onChange={e=>setToken({...token,token_notes:e.target.value})}/></div>
  </div>
  <div className="space-y-2"><div className="grid grid-cols-12 gap-2 px-1 text-xs font-semibold text-slate-500"><div className="col-span-5">Item / Material</div><div className="col-span-2">Requested Qty</div><div className="col-span-2">UOM</div><div className="col-span-3">Remarks</div></div>
   {tokenLines.map((x,i)=><div key={i} className="grid grid-cols-12 gap-2">
    <div className="col-span-5"><SearchableSelect className="input" value={x.item_id||""} onChange={e=>chooseItem(i,e.target.value)} searchPlaceholder="Search SKU, item, size, grade..."><option value="">Select Item</option>{items.map(item=><option key={item.id} value={item.id}>{itemLabel(item)}</option>)}</SearchableSelect></div>
    <div className="col-span-2"><input className="input" type="number" step="any" min="0" placeholder="Qty" value={x.requested_qty||""} onChange={e=>setTokenLines(v=>v.map((a,j)=>j===i?{...a,requested_qty:Number(e.target.value)}:a))}/></div>
    <div className="col-span-2"><SearchableSelect className="input" value={x.uom} onChange={e=>setTokenLines(v=>v.map((a,j)=>j===i?{...a,uom:e.target.value}:a))}><option value="">Select UOM</option>{uoms.map(u=><option key={u.id} value={u.symbol}>{u.symbol} · {u.name}</option>)}</SearchableSelect></div>
    <div className="col-span-3 flex gap-2"><input className="input" placeholder="Remarks" value={x.remarks||""} onChange={e=>setTokenLines(v=>v.map((a,j)=>j===i?{...a,remarks:e.target.value}:a))}/>{tokenLines.length>1&&<button type="button" className="btn btn-secondary px-3" onClick={()=>setTokenLines(v=>v.filter((_,j)=>j!==i))}>×</button>}</div>
   </div>)}
  </div>
  <div className="flex justify-between"><button type="button" className="btn btn-secondary" onClick={()=>setTokenLines(v=>[...v,emptyLine()])}>+ Add Material</button><button className="btn btn-primary">Issue & Save Token</button></div>
 </form></Modal>

 <Modal open={workOpen} onClose={()=>setWorkOpen(false)} title={`Loading — ${selected?.pass_no||""}`} panelClassName="!max-w-7xl !w-[97vw]"><form onSubmit={saveLoading} className="space-y-4">
  <div><label className="label">Loaded By / Loader Name</label><input className="input max-w-md" placeholder="Loader Name" value={loadedBy} onChange={e=>setLoadedBy(e.target.value)} required/></div>
  <div className="space-y-2"><div className="grid grid-cols-12 gap-2 px-1 text-xs font-semibold text-slate-500"><div className="col-span-3">Material</div><div className="col-span-2">Actual Qty</div><div className="col-span-2">Warehouse</div><div className="col-span-2">Godown</div><div className="col-span-3">Remarks</div></div>
   {workLines.map((x,i)=><div key={x.id||i} className="grid grid-cols-12 gap-2">
    <div className="col-span-3 rounded-md border bg-slate-50 px-3 py-2 text-sm">{x.item_description}<div className="text-xs text-slate-400">Requested: {x.requested_qty} {x.uom}</div></div>
    <div className="col-span-2"><input className="input" type="number" step="any" min="0" placeholder="Actual Qty" value={x.actual_qty||""} onChange={e=>setWorkLines(v=>v.map((a,j)=>j===i?{...a,actual_qty:Number(e.target.value)}:a))}/></div>
    <div className="col-span-2"><SearchableSelect className="input" value={x.warehouse_id||""} onChange={e=>chooseWarehouse(i,e.target.value)}><option value="">Select Warehouse</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}{w.name_urdu?` / ${w.name_urdu}`:""}</option>)}</SearchableSelect></div>
    <div className="col-span-2"><SearchableSelect className="input" value={x.godown_id||""} onChange={e=>chooseGodown(i,e.target.value)} disabled={!x.warehouse_id}><option value="">Select Godown</option>{godowns.filter(g=>g.warehouse_id===x.warehouse_id).map(g=><option key={g.id} value={g.id}>{g.name}{g.location?` · ${g.location}`:""}</option>)}</SearchableSelect></div>
    <div className="col-span-3"><input className="input" placeholder="Remarks" value={x.remarks||""} onChange={e=>setWorkLines(v=>v.map((a,j)=>j===i?{...a,remarks:e.target.value}:a))}/></div>
   </div>)}
  </div>
  <div className="flex justify-end"><button className="btn btn-primary">Save Loading & Send to Kanta</button></div>
 </form></Modal>

 <Modal open={kantaOpen} onClose={()=>setKantaOpen(false)} title={`Kanta / Weighbridge — ${selected?.pass_no||""}`} panelClassName="!max-w-3xl !w-[94vw]"><form onSubmit={saveKanta} className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><input className="input" type="number" step="any" placeholder="Tare Weight kg" value={tare} onChange={e=>setTare(e.target.value)}/><input className="input" type="number" step="any" placeholder="Gross Weight kg" value={gross} onChange={e=>setGross(e.target.value)}/><input className="input bg-slate-100 font-bold" value={`${net.toLocaleString()} kg Net`} readOnly/></div><input className="input" placeholder="Kanta Slip / Reference" value={weighRef} onChange={e=>setWeighRef(e.target.value)}/><div className="flex justify-end"><button className="btn btn-primary">Save Kanta</button></div></form></Modal>
 </div>;
}
