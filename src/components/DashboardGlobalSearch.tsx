import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Package, Users, Truck, FileText, ShoppingCart, BookOpen, Factory, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

type SearchResult = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  route: string;
  icon: typeof Search;
};

const text = (v: unknown) => String(v ?? "").trim();

export default function DashboardGlobalSearch() {
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const q = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const like = `%${q.replace(/[%_]/g, "")}%`;

      const [items, customers, suppliers, sales, purchases, journals, workOrders] = await Promise.all([
        supabase.from("items").select("id,sku,name,grade,size").or(`sku.ilike.${like},name.ilike.${like},grade.ilike.${like},size.ilike.${like}`).limit(6),
        supabase.from("customers").select("id,name,email,phone").or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(5),
        supabase.from("suppliers").select("id,name,email,phone").or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).limit(5),
        supabase.from("sales_orders").select("id,invoice_no,order_no,status,total").or(`invoice_no.ilike.${like},order_no.ilike.${like},status.ilike.${like}`).limit(6),
        supabase.from("purchase_orders").select("id,invoice_no,order_no,status,total").or(`invoice_no.ilike.${like},order_no.ilike.${like},status.ilike.${like}`).limit(6),
        supabase.from("journal_entries").select("id,entry_no,description,status").or(`entry_no.ilike.${like},description.ilike.${like},status.ilike.${like}`).limit(5),
        supabase.from("work_orders").select("id,work_order_no,status").or(`work_order_no.ilike.${like},status.ilike.${like}`).limit(5),
      ]);

      if (cancelled) return;
      const next: SearchResult[] = [];

      (items.data ?? []).forEach((r: any) => next.push({ id: r.id, type: "Item", title: text(r.name) || text(r.sku), subtitle: [r.sku, r.grade, r.size].filter(Boolean).join(" · "), route: `/master-data?item=${r.id}`, icon: Package }));
      (customers.data ?? []).forEach((r: any) => next.push({ id: r.id, type: "Customer", title: text(r.name), subtitle: [r.phone, r.email].filter(Boolean).join(" · "), route: `/master-data/customers?customer=${r.id}`, icon: Users }));
      (suppliers.data ?? []).forEach((r: any) => next.push({ id: r.id, type: "Supplier", title: text(r.name), subtitle: [r.phone, r.email].filter(Boolean).join(" · "), route: `/master-data/suppliers?supplier=${r.id}`, icon: Truck }));
      (sales.data ?? []).forEach((r: any) => next.push({ id: r.id, type: "Sales Invoice", title: text(r.invoice_no) || text(r.order_no) || "Sales Invoice", subtitle: `${text(r.status)}${r.total != null ? ` · ${Number(r.total).toLocaleString()}` : ""}`, route: `/sales/${r.id}`, icon: ShoppingCart }));
      (purchases.data ?? []).forEach((r: any) => next.push({ id: r.id, type: "Purchase", title: text(r.invoice_no) || text(r.order_no) || "Purchase", subtitle: `${text(r.status)}${r.total != null ? ` · ${Number(r.total).toLocaleString()}` : ""}`, route: `/purchase/${r.id}`, icon: FileText }));
      (journals.data ?? []).forEach((r: any) => next.push({ id: r.id, type: "Journal", title: text(r.entry_no) || "Journal Entry", subtitle: text(r.description) || text(r.status), route: `/accounting/${r.id}`, icon: BookOpen }));
      (workOrders.data ?? []).forEach((r: any) => next.push({ id: r.id, type: "Work Order", title: text(r.work_order_no) || "Work Order", subtitle: text(r.status), route: `/production/${r.id}`, icon: Factory }));

      setResults(next.slice(0, 20));
      setLoading(false);
      setOpen(true);
    }, 250);

    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [q]);

  const openResult = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    navigate(result.route);
  };

  return (
    <div ref={boxRef} className="relative mx-auto w-full max-w-4xl px-4 pt-4 lg:px-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => q.length >= 2 && setOpen(true)}
          placeholder="Search anything — invoice, customer, supplier, item, journal, work order..."
          className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-12 text-[14px] font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
        {query && <button type="button" onClick={() => { setQuery(""); setResults([]); }} className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>}
      </div>

      {open && q.length >= 2 && (
        <div className="absolute left-4 right-4 top-[68px] z-[80] max-h-[480px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl lg:left-5 lg:right-5">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm font-semibold text-slate-500">Searching MetalForge…</div>
          ) : results.length ? (
            <>
              <div className="px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-400">Search results · {results.length}</div>
              {results.map((r) => {
                const Icon = r.icon;
                return <button key={`${r.type}-${r.id}`} type="button" onClick={() => openResult(r)} className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-blue-50">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-black text-slate-900">{r.title}</span><span className="block truncate text-[11px] font-semibold text-slate-500">{r.type}{r.subtitle ? ` · ${r.subtitle}` : ""}</span></span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-blue-600" />
                </button>;
              })}
            </>
          ) : (
            <div className="px-4 py-8 text-center"><div className="text-sm font-black text-slate-700">No result found</div><div className="mt-1 text-xs text-slate-500">Try invoice number, party name, SKU, journal number or work order.</div></div>
          )}
        </div>
      )}
    </div>
  );
}
