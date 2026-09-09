import SearchableSelect from "@/components/SearchableSelect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Printer, Search, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ErrorBanner, formatCurrency } from "@/components/ui";
import * as XLSX from "xlsx";

type Employee = {
  id: string;
  employee_code: string | null;
  name: string;
  name_urdu: string | null;
  designation: string | null;
  department: string | null;
  is_active: boolean;
};

type OrderRow = {
  id: string;
  order_no: string;
  order_date: string;
  salesperson_id: string | null;
  sales_person: string | null;
  customer_id: string | null;
  total: number | string | null;
  paid_amount: number | string | null;
  invoice_type: string | null;
  payment_mode: string | null;
  customer?: { name: string } | { name: string }[] | null;
};

type ReturnRow = {
  sales_order_id: string | null;
  total: number | string | null;
};

type PartySummary = {
  name: string;
  orders: number;
  grossSales: number;
  returns: number;
  netSales: number;
  received: number;
  debit: number;
  credit: number;
};

type Summary = {
  id?: string;
  code?: string;
  urduName?: string;
  designation?: string;
  department?: string;
  active: boolean;
  name: string;
  orders: number;
  grossSales: number;
  returns: number;
  netSales: number;
  received: number;
  debit: number;
  credit: number;
  parties: PartySummary[];
};

const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const customerName = (value: OrderRow["customer"]) =>
  Array.isArray(value) ? value[0]?.name || "Unassigned" : value?.name || "Unassigned";

export default function SalespersonReport() {
  const [rows, setRows] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("ALL");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "debit" | "credit">("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [showParties, setShowParties] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [employeeRes, orderRes, returnRes] = await Promise.all([
        supabase
          .from("employees")
          .select("id,employee_code,name,name_urdu,designation,department,is_active")
          .order("name"),
        supabase
          .from("sales_orders")
          .select("id,order_no,order_date,salesperson_id,sales_person,customer_id,total,paid_amount,invoice_type,payment_mode,customer:customers(name)")
          .in("status", ["posted", "closed", "approved"])
          .order("order_date"),
        supabase
          .from("return_notes")
          .select("sales_order_id,total")
          .eq("note_type", "sales_credit")
          .eq("status", "posted"),
      ]);

      if (employeeRes.error) throw employeeRes.error;
      if (orderRes.error) throw orderRes.error;
      if (returnRes.error) throw returnRes.error;

      const employees = (employeeRes.data || []) as Employee[];
      const orders = (orderRes.data || []) as unknown as OrderRow[];
      const returns = (returnRes.data || []) as ReturnRow[];

      const returnByOrder = new Map<string, number>();
      returns.forEach((r) => {
        if (r.sales_order_id) {
          returnByOrder.set(
            r.sales_order_id,
            (returnByOrder.get(r.sales_order_id) || 0) + num(r.total)
          );
        }
      });

      const result: Summary[] = employees.map((employee) => {
        const own = orders.filter((o) => o.salesperson_id === employee.id);
        const partyMap = new Map<string, PartySummary>();
        let grossSales = 0;
        let returnTotal = 0;
        let received = 0;

        for (const order of own) {
          const gross = num(order.total);
          const ret = Math.min(returnByOrder.get(order.id) || 0, gross);
          const net = Math.max(gross - ret, 0);
          const mode = String(order.payment_mode || "Credit").toLowerCase();
          const isCash = mode === "cash" || mode === "bank";
          const orderReceived = Math.max(num(order.paid_amount) - (isCash ? ret : 0), 0);

          grossSales += gross;
          returnTotal += ret;
          received += orderReceived;

          const pName = customerName(order.customer);
          const party = partyMap.get(pName) || {
            name: pName,
            orders: 0,
            grossSales: 0,
            returns: 0,
            netSales: 0,
            received: 0,
            debit: 0,
            credit: 0,
          };
          party.orders += 1;
          party.grossSales += gross;
          party.returns += ret;
          party.netSales += net;
          party.received += orderReceived;
          partyMap.set(pName, party);
        }

        const parties = Array.from(partyMap.values())
          .map((p) => {
            const balance = p.netSales - p.received;
            return { ...p, debit: Math.max(balance, 0), credit: Math.max(-balance, 0) };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        const netSales = Math.max(grossSales - returnTotal, 0);
        const balance = netSales - received;

        return {
          id: employee.id,
          code: employee.employee_code || undefined,
          urduName: employee.name_urdu || undefined,
          designation: employee.designation || undefined,
          department: employee.department || undefined,
          active: employee.is_active,
          name: employee.name,
          orders: own.length,
          grossSales,
          returns: returnTotal,
          netSales,
          received,
          debit: Math.max(balance, 0),
          credit: Math.max(-balance, 0),
          parties,
        };
      });

      setRows(result.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e: any) {
      setError(e?.message || "Failed to load salesperson report.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (selected !== "ALL" && r.id !== selected) return false;
    if (statusFilter === "active" && !r.active) return false;
    if (statusFilter === "inactive" && r.active) return false;
    if (balanceFilter === "debit" && r.debit <= 0) return false;
    if (balanceFilter === "credit" && r.credit <= 0) return false;
    const q = search.trim().toLowerCase();
    return !q ||
      r.name.toLowerCase().includes(q) ||
      r.urduName?.includes(search.trim()) ||
      r.code?.toLowerCase().includes(q) ||
      r.designation?.toLowerCase().includes(q) ||
      r.department?.toLowerCase().includes(q) ||
      r.parties.some((p) => p.name.toLowerCase().includes(q));
  }), [rows, selected, statusFilter, balanceFilter, search]);

  const totals = useMemo(() => filtered.reduce((a, r) => ({
    orders: a.orders + r.orders,
    gross: a.gross + r.grossSales,
    returns: a.returns + r.returns,
    sales: a.sales + r.netSales,
    received: a.received + r.received,
    debit: a.debit + r.debit,
    credit: a.credit + r.credit,
  }), { orders: 0, gross: 0, returns: 0, sales: 0, received: 0, debit: 0, credit: 0 }), [filtered]);

  const exportExcel = () => {
    const exportRows = filtered.flatMap((r) => [
      {
        "Employee Code": r.code || "",
        Salesperson: r.name,
        "Urdu Name": r.urduName || "",
        Designation: r.designation || "",
        Department: r.department || "",
        Party: "ALL",
        Invoices: r.orders,
        "Gross Sales": r.grossSales,
        Returns: r.returns,
        "Net Sales": r.netSales,
        Received: r.received,
        "Debit Balance": r.debit,
        "Credit Balance": r.credit,
      },
      ...r.parties.map((p) => ({
        "Employee Code": r.code || "",
        Salesperson: r.name,
        "Urdu Name": r.urduName || "",
        Designation: r.designation || "",
        Department: r.department || "",
        Party: p.name,
        Invoices: p.orders,
        "Gross Sales": p.grossSales,
        Returns: p.returns,
        "Net Sales": p.netSales,
        Received: p.received,
        "Debit Balance": p.debit,
        "Credit Balance": p.credit,
      })),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportRows), "Salesperson Report");
    XLSX.writeFile(wb, "Salesperson_Net_Performance.xlsx");
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sales Analytics</div>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-bold"><Users className="h-5 w-5"/>Salesperson Performance / سیلز پرسن رپورٹ</h1>
        <p className="mt-1 text-xs text-slate-500">Salespersons come from Employees Master. Add or edit employees only in Master Data.</p>
      </div>
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={exportExcel}><Download className="h-4 w-4"/>Excel</button>
        <button className="btn-secondary" onClick={() => window.print()}><Printer className="h-4 w-4"/>Print / PDF</button>
      </div>
    </div>

    {error && <ErrorBanner message={error}/>} 

    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
      {[
        ['Invoices', totals.orders],
        ['Gross Sales', formatCurrency(totals.gross)],
        ['Returns', formatCurrency(totals.returns)],
        ['Net Sales', formatCurrency(totals.sales)],
        ['Received', formatCurrency(totals.received)],
        ['Debit', formatCurrency(totals.debit)],
        ['Credit', formatCurrency(totals.credit)],
      ].map(([label, value]) => <div key={String(label)} className="card p-3"><div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div><div className="mt-1 font-bold text-slate-800">{value}</div></div>)}
    </div>

    <div className="card print:hidden p-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400"/><input className="input pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee, salesperson or party..."/></div>
        <SearchableSelect className="input w-52" value={selected} onChange={(e) => setSelected(e.target.value)}><option value="ALL">All Salespersons</option>{rows.map((r) => <option key={r.id || r.name} value={r.id || r.name}>{r.code ? `${r.code} - ${r.name}` : r.name}</option>)}</SearchableSelect>
        <SearchableSelect className="input w-32" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}><option value="active">Active</option><option value="all">All Status</option><option value="inactive">Inactive</option></SearchableSelect>
        <button className={`btn-secondary ${balanceFilter==='all'?'ring-2 ring-slate-300':''}`} onClick={() => setBalanceFilter('all')}>All</button>
        <button className={`btn-secondary ${balanceFilter==='debit'?'ring-2 ring-blue-300':''}`} onClick={() => setBalanceFilter('debit')}>Show Debit Balance Only</button>
        <button className={`btn-secondary ${balanceFilter==='credit'?'ring-2 ring-rose-300':''}`} onClick={() => setBalanceFilter('credit')}>Show Credit Balance Only</button>
        <button className="btn-secondary" onClick={() => setShowParties((v) => !v)}>{showParties ? 'Hide Parties' : 'Show Parties'}</button>
      </div>
    </div>

    <div className="card overflow-x-auto">
      <table className="w-full min-w-[1050px] text-xs">
        <thead className="bg-slate-50"><tr className="border-b"><th className="p-3 text-left">Salesperson / Party</th><th className="p-2 text-center">Invoices</th><th className="p-2 text-right">Gross Sales</th><th className="p-2 text-right">Returns</th><th className="p-2 text-right">Net Sales</th><th className="p-2 text-right">Received</th><th className="p-2 text-right">Debit</th><th className="p-2 text-right">Credit</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={8} className="p-8 text-center text-slate-400">Loading...</td></tr> : filtered.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-slate-400">No records match current filters.</td></tr> : filtered.flatMap((r) => {
            const head = <tr key={`sp-${r.id || r.name}`} className="border-b bg-white font-semibold"><td className="p-3"><div>{r.name}</div>{r.urduName && <div className="mt-0.5 text-[11px] font-semibold text-slate-500" dir="rtl">{r.urduName}</div>}<div className="text-[10px] font-normal text-slate-400">{r.code || 'Employee'}{r.designation ? ` · ${r.designation}` : ''} · {r.active ? 'Active' : 'Inactive'}</div></td><td className="p-2 text-center">{r.orders}</td><td className="p-2 text-right">{formatCurrency(r.grossSales)}</td><td className="p-2 text-right text-rose-600">{formatCurrency(r.returns)}</td><td className="p-2 text-right">{formatCurrency(r.netSales)}</td><td className="p-2 text-right text-emerald-700">{formatCurrency(r.received)}</td><td className="p-2 text-right text-blue-700">{formatCurrency(r.debit)}</td><td className="p-2 text-right text-rose-700">{formatCurrency(r.credit)}</td></tr>;
            const partyRows = showParties ? r.parties.map((p) => <tr key={`${r.id || r.name}-${p.name}`} className="border-b bg-slate-50/50 text-slate-600"><td className="py-2 pl-8 pr-3">↳ {p.name}</td><td className="p-2 text-center">{p.orders}</td><td className="p-2 text-right">{formatCurrency(p.grossSales)}</td><td className="p-2 text-right text-rose-600">{formatCurrency(p.returns)}</td><td className="p-2 text-right">{formatCurrency(p.netSales)}</td><td className="p-2 text-right text-emerald-700">{formatCurrency(p.received)}</td><td className="p-2 text-right text-blue-700">{formatCurrency(p.debit)}</td><td className="p-2 text-right text-rose-700">{formatCurrency(p.credit)}</td></tr>) : [];
            return [head, ...partyRows];
          })}
        </tbody>
        {!loading && filtered.length > 0 && <tfoot className="border-t-2 bg-slate-100 font-bold"><tr><td className="p-3">GRAND TOTAL<div className="text-[10px] font-normal text-slate-500">Filtered: {filtered.length} salesperson{filtered.length===1?'':'s'}</div></td><td className="p-2 text-center">{totals.orders}</td><td className="p-2 text-right">{formatCurrency(totals.gross)}</td><td className="p-2 text-right text-rose-600">{formatCurrency(totals.returns)}</td><td className="p-2 text-right">{formatCurrency(totals.sales)}</td><td className="p-2 text-right text-emerald-700">{formatCurrency(totals.received)}</td><td className="p-2 text-right text-blue-700">{formatCurrency(totals.debit)}</td><td className="p-2 text-right text-rose-700">{formatCurrency(totals.credit)}</td></tr></tfoot>}
      </table>
    </div>
  </div>;
}
