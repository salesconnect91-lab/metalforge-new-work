import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Package, Users, Truck, FileText, ShoppingCart, BookOpen, Factory, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

type SearchResult = { id: string; type: string; title: string; subtitle: string; route: string; icon: typeof Search };
const text = (v: unknown) => String(v ?? "").trim();

export default function DashboardGlobalSearch() {
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const q = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    const shortcut = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); setOpen(true); } };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", shortcut);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", shortcut); };
  }, []);

  useEffect(() => {
    if (q.length < 2) { setResults([]); setLoading(false); setActiveIndex(-1); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const clean = q.replace(/[%_,()]/g, "");
      const like = `%${clean}%`;
      const [items, customers, suppliers, sales, purchases, journals, workOrders] = await Promise.all([
        supabase.from("items").select("id,sku,name,grade,size").or(`sku.ilike.${like},name.ilike.${like},grade.ilike.${like},size.ilike.${like}`).limit(6),
        supabase.from("customers").select("id,name,email,phone").or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(5),
        supabase.from("suppliers").select("id,name,email,phone").or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(5),
        supabase.from("sales_orders").select("id,order_no,status,total").or(`order_no.ilike.${like},status.ilike.${like}`).limit(6),
        supabase.from("purchase_orders").select("id,order_no,status,total").or(`order_no.ilike.${like},status.ilike.${like}`).limit(6),
        supabase.from("journal_entries").select("id,entry_no,description,status").or(`entry_no.ilike.${like},description.ilike.${like},status.ilike.${like}`).limit(5),
        supabase.from("work_orders").select("id,order_no,status").or(`order_no.ilike.${like},status.ilike.${like}`).limit(5),
      ]);
      if (cancelled) return;
      const next: SearchResult[] = [];
      (items.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Item",title:text(r.name)||text(r.sku),subtitle:[r.sku,r.grade,r.size].filter(Boolean).join(" · "),route:`/master-data/items/${r.id}`,icon:Package }));
      (customers.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Customer",title:text(r.name),subtitle:[r.phone,r.email].filter(Boolean).join(" · "),route:`/master-data/customers/${r.id}`,icon:Users }));
      (suppliers.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Supplier",title:text(r.name),subtitle:[r.phone,r.email].filter(Boolean).join(" · "),route:`/master-data/suppliers/${r.id}`,icon:Truck }));
      (sales.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Sales Invoice",title:text(r.order_no)||"Sales Invoice",subtitle:`${text(r.status)}${r.total!=null?` · ${Number(r.total).toLocaleString()}`:""}`,route:`/sales/${r.id}`,icon:ShoppingCart }));
      (purchases.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Purchase",title:text(r.order_no)||"Purchase",subtitle:`${text(r.status)}${r.total!=null?` · ${Number(r.total).toLocaleString()}`:""}`,route:`/purchase/${r.id}`,icon:FileText }));
      (journals.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Journal",title:text(r.entry_no)||"Journal Entry",subtitle:text(r.description)||text(r.status),route:`/accounting/${r.id}`,icon:BookOpen }));
      (workOrders.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Work Order",title:text(r.order_no)||"Work Order",subtitle:text(r.status),route:`/production/${r.id}`,icon:Factory }));
      setResults(next.slice(0,20)); setActiveIndex(-1); setLoading(false); setOpen(true);
    },220);
    return () => { cancelled=true; window.clearTimeout(timer); };
  },[q]);

  const openResult=(result:SearchResult)=>{setOpen(false);setQuery("");setResults([]);setActiveIndex(-1);navigate(result.route)};
  const onKeyDown=(e:React.KeyboardEvent<HTMLInputElement>)=>{if(!open||!results.length)return;if(e.key==="ArrowDown"){e.preventDefault();setActiveIndex(i=>Math.min(i+1,results.length-1))}else if(e.key==="ArrowUp"){e.preventDefault();setActiveIndex(i=>Math.max(i-1,0))}else if(e.key==="Enter"){e.preventDefault();const target=results[activeIndex>=0?activeIndex:0];if(target)openResult(target)}else if(e.key==="Escape"){setOpen(false)}};

  return <div ref={boxRef} className="relative mx-auto w-full max-w-4xl px-4 pt-4 lg:px-5">
    <div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"/><input ref={inputRef} value={query} onKeyDown={onKeyDown} onChange={(e)=>{setQuery(e.target.value);setOpen(true)}} onFocus={()=>q.length>=2&&setOpen(true)} placeholder="Search invoice, customer, supplier, item, journal, work order..." className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-24 text-[14px] font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"/><span className="pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-black text-slate-400">Ctrl K</span>{query&&<button type="button" onClick={()=>{setQuery("");setResults([]);setActiveIndex(-1)}} className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><X className="h-4 w-4"/></button>}</div>
    {open&&q.length>=2&&<div className="absolute left-4 right-4 top-[68px] z-[80] max-h-[480px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl lg:left-5 lg:right-5">{loading?<div className="px-4 py-8 text-center text-sm font-semibold text-slate-500">Searching MetalForge…</div>:results.length?<><div className="flex items-center justify-between px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-400"><span>Search results · {results.length}</span><span>↑↓ Select · Enter Open</span></div>{results.map((r,index)=>{const Icon=r.icon;return <button key={`${r.type}-${r.id}`} type="button" onMouseEnter={()=>setActiveIndex(index)} onClick={()=>openResult(r)} className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${activeIndex===index?"bg-blue-50":"hover:bg-blue-50"}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700"><Icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-black text-slate-900">{r.title}</span><span className="block truncate text-[11px] font-semibold text-slate-500">{r.type}{r.subtitle?` · ${r.subtitle}`:""}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-blue-600"/></button>})}</>:<div className="px-4 py-8 text-center"><div className="text-sm font-black text-slate-700">No result found</div><div className="mt-1 text-xs text-slate-500">Try document number, party name, SKU, journal number or work order.</div></div>}</div>}
  </div>;
}
