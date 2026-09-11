import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, Factory, FileText, Package, Search, ShoppingCart, Truck, Users, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { canViewModule, type ModuleKey } from "@/auth/permissions";
import { supabase } from "@/lib/supabase";

type SearchResult = { id: string; type: string; title: string; subtitle: string; route: string; icon: typeof Search };
const text = (v: unknown) => String(v ?? "").trim();
const emptyResult = Promise.resolve({ data: [] as any[], error: null });

export default function DashboardGlobalSearch() {
  const navigate = useNavigate();
  const { isPlatformOwner, activeCompany, activeBusinessUnit } = useAuth();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [partialError, setPartialError] = useState(false);
  const q = useMemo(() => query.trim(), [query]);

  const canView = (module: ModuleKey) => {
    const role = activeBusinessUnit?.membership_role ?? activeCompany?.membership_role;
    const roleAllowed = canViewModule(role, module, isPlatformOwner);
    const companyAllowed = !activeCompany?.enabled_modules || activeCompany.enabled_modules.includes(module);
    const unitAllowed = !activeBusinessUnit || activeBusinessUnit.enabled_modules.includes(module);
    return roleAllowed && companyAllowed && unitAllowed;
  };

  useEffect(() => {
    const close = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    const shortcut = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); setOpen(true); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", shortcut);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", shortcut); };
  }, []);

  useEffect(() => {
    if (q.length < 2) { setResults([]); setLoading(false); setActiveIndex(-1); setPartialError(false); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setPartialError(false);
      const clean = q.replace(/[%_,()]/g, "").trim();
      if (!clean) { setLoading(false); return; }
      const like = `%${clean}%`;
      const master = canView("master");
      const salesAllowed = canView("sales");
      const purchaseAllowed = canView("purchase");
      const accountingAllowed = canView("accounting");
      const inventoryAllowed = canView("inventory");
      const productionAllowed = canView("production");

      const responses = await Promise.all([
        master ? supabase.from("items").select("id,sku,name,grade,size").or(`sku.ilike.${like},name.ilike.${like},grade.ilike.${like},size.ilike.${like}`).limit(6) : emptyResult,
        master ? supabase.from("customers").select("id,name,email,phone").or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(5) : emptyResult,
        master ? supabase.from("suppliers").select("id,name,email,phone").or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(5) : emptyResult,
        salesAllowed ? supabase.from("sales_orders").select("id,order_no,status,total,fbr_invoice_no").or(`order_no.ilike.${like},status.ilike.${like},fbr_invoice_no.ilike.${like}`).limit(6) : emptyResult,
        purchaseAllowed ? supabase.from("purchase_orders").select("id,order_no,status,total,supplier_invoice_no").or(`order_no.ilike.${like},status.ilike.${like},supplier_invoice_no.ilike.${like}`).limit(6) : emptyResult,
        accountingAllowed ? supabase.from("journal_entries").select("id,entry_no,description,status,party_name,trans_type,payment_mode").or(`entry_no.ilike.${like},description.ilike.${like},status.ilike.${like},party_name.ilike.${like},trans_type.ilike.${like},payment_mode.ilike.${like}`).limit(6) : emptyResult,
        productionAllowed ? supabase.from("work_orders").select("id,order_no,status").or(`order_no.ilike.${like},status.ilike.${like}`).limit(5) : emptyResult,
        productionAllowed ? supabase.from("cutting_orders").select("id,order_no,status").or(`order_no.ilike.${like},status.ilike.${like}`).limit(5) : emptyResult,
        productionAllowed ? supabase.from("gate_passes").select("id,pass_no,status,customer_name,vehicle_no,driver_name").or(`pass_no.ilike.${like},status.ilike.${like},customer_name.ilike.${like},vehicle_no.ilike.${like},driver_name.ilike.${like}`).limit(5) : emptyResult,
        accountingAllowed ? supabase.from("return_notes").select("id,note_no,note_type,party_name,status,total").or(`note_no.ilike.${like},note_type.ilike.${like},party_name.ilike.${like},status.ilike.${like}`).limit(5) : emptyResult,
        inventoryAllowed ? supabase.from("stock_movements").select("id,type,reference,transfer_no,reason,godown").or(`type.ilike.${like},reference.ilike.${like},transfer_no.ilike.${like},reason.ilike.${like},godown.ilike.${like}`).limit(5) : emptyResult,
        accountingAllowed ? supabase.from("invoice_payment_allocations").select("id,sales_order_id,reference,notes,amount,allocation_date").or(`reference.ilike.${like},notes.ilike.${like}`).limit(5) : emptyResult,
        accountingAllowed ? supabase.from("purchase_payment_allocations").select("id,purchase_order_id,order_no,supplier_name,reference,notes,amount,allocation_date").or(`order_no.ilike.${like},supplier_name.ilike.${like},reference.ilike.${like},notes.ilike.${like}`).limit(5) : emptyResult,
      ] as const);
      if (cancelled) return;
      setPartialError(responses.some((response: any) => Boolean(response.error)));

      const [items, customers, suppliers, sales, purchases, journals, workOrders, cuttingOrders, gatePasses, returns, movements, customerPayments, supplierPayments] = responses as any;
      const next: SearchResult[] = [];
      (items.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Item",title:text(r.name)||text(r.sku),subtitle:[r.sku,r.grade,r.size].filter(Boolean).join(" · "),route:`/master-data/items/${r.id}`,icon:Package }));
      (customers.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Customer",title:text(r.name),subtitle:[r.phone,r.email].filter(Boolean).join(" · "),route:`/master-data/customers/${r.id}`,icon:Users }));
      (suppliers.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Supplier",title:text(r.name),subtitle:[r.phone,r.email].filter(Boolean).join(" · "),route:`/master-data/suppliers/${r.id}`,icon:Truck }));
      (sales.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Sales Invoice",title:text(r.order_no)||text(r.fbr_invoice_no)||"Sales Invoice",subtitle:[r.status,r.fbr_invoice_no,r.total!=null?Number(r.total).toLocaleString():null].filter(Boolean).join(" · "),route:`/sales/${r.id}`,icon:ShoppingCart }));
      (purchases.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Purchase",title:text(r.order_no)||text(r.supplier_invoice_no)||"Purchase",subtitle:[r.status,r.supplier_invoice_no,r.total!=null?Number(r.total).toLocaleString():null].filter(Boolean).join(" · "),route:`/purchase/${r.id}`,icon:FileText }));
      (journals.data ?? []).forEach((r: any) => next.push({ id:r.id,type:text(r.trans_type)||"Journal",title:text(r.entry_no)||"Journal Entry",subtitle:[r.party_name,r.payment_mode,r.description,r.status].filter(Boolean).join(" · "),route:`/accounting/${r.id}`,icon:BookOpen }));
      (workOrders.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Work Order",title:text(r.order_no)||"Work Order",subtitle:text(r.status),route:`/production/${r.id}`,icon:Factory }));
      (cuttingOrders.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Cutting Order",title:text(r.order_no)||"Cutting Order",subtitle:text(r.status),route:`/cutting/${r.id}`,icon:Factory }));
      (gatePasses.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Gate Pass",title:text(r.pass_no)||"Gate Pass",subtitle:[r.customer_name,r.vehicle_no,r.driver_name,r.status].filter(Boolean).join(" · "),route:"/cutting/gate-pass",icon:Truck }));
      (returns.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Return Note",title:text(r.note_no)||"Return Note",subtitle:[r.note_type,r.party_name,r.status,r.total!=null?Number(r.total).toLocaleString():null].filter(Boolean).join(" · "),route:"/accounting/returns",icon:FileText }));
      (movements.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Stock Movement",title:text(r.reference)||text(r.transfer_no)||text(r.type)||"Stock Movement",subtitle:[r.type,r.transfer_no,r.godown,r.reason].filter(Boolean).join(" · "),route:"/godown/movements",icon:Package }));
      (customerPayments.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Customer Receipt",title:text(r.reference)||"Customer Receipt",subtitle:[r.allocation_date,r.amount!=null?Number(r.amount).toLocaleString():null].filter(Boolean).join(" · "),route:r.sales_order_id?`/sales/${r.sales_order_id}`:"/accounting/cash-counter",icon:BookOpen }));
      (supplierPayments.data ?? []).forEach((r: any) => next.push({ id:r.id,type:"Supplier Payment",title:text(r.reference)||text(r.order_no)||"Supplier Payment",subtitle:[r.supplier_name,r.allocation_date,r.amount!=null?Number(r.amount).toLocaleString():null].filter(Boolean).join(" · "),route:r.purchase_order_id?`/purchase/${r.purchase_order_id}`:"/accounting/cash-counter",icon:BookOpen }));

      const deduped = Array.from(new Map(next.map((result) => [`${result.type}:${result.id}`, result])).values());
      setResults(deduped.slice(0,30));
      setActiveIndex(-1);
      setLoading(false);
      setOpen(true);
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [q, activeCompany, activeBusinessUnit, isPlatformOwner]);

  const openResult = (result: SearchResult) => { setOpen(false); setQuery(""); setResults([]); setActiveIndex(-1); navigate(result.route); };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const target = results[activeIndex >= 0 ? activeIndex : 0]; if (target) openResult(target); }
    else if (e.key === "Escape") setOpen(false);
  };

  return <div ref={boxRef} className="relative mx-auto w-full max-w-4xl px-4 pt-4 lg:px-5">
    <div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"/><input ref={inputRef} value={query} onKeyDown={onKeyDown} onChange={(e)=>{setQuery(e.target.value);setOpen(true)}} onFocus={()=>q.length>=2&&setOpen(true)} placeholder="Search invoice, party, item, payment, journal, work order, gate pass..." className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-12 text-[14px] font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 sm:pr-24"/><span className="pointer-events-none absolute right-12 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-black text-slate-400 sm:block">Ctrl K</span>{query&&<button type="button" onClick={()=>{setQuery("");setResults([]);setActiveIndex(-1);setPartialError(false)}} className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><X className="h-4 w-4"/></button>}</div>
    {open&&q.length>=2&&<div className="absolute left-4 right-4 top-[68px] z-[80] max-h-[480px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl lg:left-5 lg:right-5">{loading?<div className="px-4 py-8 text-center text-sm font-semibold text-slate-500">Searching NAVILO…</div>:results.length?<><div className="flex items-center justify-between px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-400"><span>Search results · {results.length}</span><span className="hidden sm:inline">↑↓ Select · Enter Open</span></div>{partialError&&<div className="mx-2 mb-1 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] font-semibold text-amber-800">Some searchable modules could not be loaded.</div>}{results.map((r,index)=>{const Icon=r.icon;return <button key={`${r.type}-${r.id}`} type="button" onMouseEnter={()=>setActiveIndex(index)} onClick={()=>openResult(r)} className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${activeIndex===index?"bg-blue-50":"hover:bg-blue-50"}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700"><Icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-black text-slate-900">{r.title}</span><span className="block truncate text-[11px] font-semibold text-slate-500">{r.type}{r.subtitle?` · ${r.subtitle}`:""}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-blue-600"/></button>})}</>:<div className="px-4 py-8 text-center"><div className="text-sm font-black text-slate-700">No result found</div><div className="mt-1 text-xs text-slate-500">Try document number, party, SKU, payment reference, gate pass, return or work order.</div>{partialError&&<div className="mt-2 text-[10px] font-semibold text-amber-700">Some searchable modules could not be loaded.</div>}</div>}</div>}
  </div>;
}
