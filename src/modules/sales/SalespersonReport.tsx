import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Plus, Printer, Search, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ErrorBanner, Modal, formatCurrency } from "@/components/ui";
import * as XLSX from "xlsx";

type SalespersonAccount = { id: string; code: string; name: string; is_active: boolean };
type OrderRow = {
  id: string;
  order_no: string;
  order_date: string;
  sales_person: string | null;
  customer_id: string | null;
  total: number | string | null;
  paid_amount: number | string | null;
  invoice_type: string | null;
  payment_mode: string | null;
  customer?: { name: string } | { name: string }[] | null;
};
type ReturnRow = { sales_order_id: string | null; total: number | string | null; status: string; note_type: string };
type PartySummary = { name: string; orders: number; grossSales: number; returns: number; netSales: number; received: number; debit: number; credit: number };
type Summary = {
  id?: string;
  code?: string;
  active: boolean;
  name: string;
  orders: number;
  grossSales: number;
  returns: number;
  netSales: number;
  received: number;
  cashSales: number;
  creditSales: number;
  taxSales: number;
  debit: number;
  credit: number;
  parties: PartySummary[];
};

const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const customerName = (value: OrderRow["customer"]) => Array.isArray(value) ? value[0]?.name || "Unassigned" : value?.name || "Unassigned";
const makeCode = () => `SP-${Date.now().toString().slice(-8)}`;

export default function SalespersonReport() {
  const [rows, setRows] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("ALL");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "debit" | "credit">("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [showParties, setShowParties] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<SalespersonAccount | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [spRes, orderRes, returnRes] = await Promise.all([
        supabase.from("chart_of_accounts").select("id,code,name,is_active").eq("account_role", "sales_person").order("name"),
        supabase.from("sales_orders").select("id,order_no,order_date,sales_person,customer_id,total,paid_amount,invoice_type,payment_mode,customer:customers(name)").in("status", ["posted", "closed", "approved"]).order("order_date"),
        supabase.from("return_notes").select("sales_order_id,total,status,note_type").eq("note_type", "sales_credit").eq("status", "posted"),
      ]);
      if (spRes.error) throw spRes.error;
      if (orderRes.error) throw orderRes.error;
      if (returnRes.error) throw returnRes.error;

      const accounts = (spRes.data || []) as SalespersonAccount[];
      const orders = (orderRes.data || []) as unknown as OrderRow[];
      const returns = (returnRes.data || []) as ReturnRow[];
      const returnByOrder = new Map<string, number>();
      returns.forEach((r) => { if (r.sales_order_id) returnByOrder.set(r.sales_order_id, (returnByOrder.get(r.sales_order_id) || 0) + num(r.total)); });
      const accountByName = new Map(accounts.map((a) => [a.name.trim().toLowerCase(), a]));
      const names = new Set(accounts.map((a) => a.name.trim()).filter(Boolean));
      orders.forEach((o) => { if (o.sales_person?.trim()) names.add(o.sales_person.trim()); });

      const result: Summary[] = [];
      for (const spName of names) {
        const account = accountByName.get(spName.toLowerCase());
        const own = orders.filter((o) => o.sales_person?.trim() === spName);
        const partyMap = new Map<string, PartySummary>();
        let grossSales = 0, returnTotal = 0, received = 0, cashSales = 0, creditSales = 0, taxSales = 0;
        for (const order of own) {
          const gross = num(order.total);
          const ret = Math.min(returnByOrder.get(order.id) || 0, gross);
          const net = Math.max(gross - ret, 0);
          const mode = String(order.payment_mode || "Credit").toLowerCase();
          const isCash = mode === "cash" || mode === "bank";
          const orderReceived = Math.max(num(order.paid_amount) - (isCash ? ret : 0), 0);
          grossSales += gross; returnTotal += ret; received += orderReceived;
          if (isCash) cashSales += net; else creditSales += net;
          if (order.invoice_type === "Tax Invoice") taxSales += net;
          const pName = customerName(order.customer);
          const p = partyMap.get(pName) || { name: pName, orders: 0, grossSales: 0, returns: 0, netSales: 0, received: 0, debit: 0, credit: 0 };
          p.orders += 1; p.grossSales += gross; p.returns += ret; p.netSales += net; p.received += orderReceived;
          partyMap.set(pName, p);
        }
        const parties = Array.from(partyMap.values()).map((p) => {
          const balance = p.netSales - p.received;
          return { ...p, debit: Math.max(balance, 0), credit: Math.max(-balance, 0) };
        }).sort((a, b) => a.name.localeCompare(b.name));
        const netSales = Math.max(grossSales - returnTotal, 0);
        const balance = netSales - received;
        result.push({
          id: account?.id, code: account?.code, active: account?.is_active ?? true, name: spName,
          orders: own.length, grossSales, returns: returnTotal, netSales, received, cashSales, creditSales, taxSales,
          debit: Math.max(balance, 0), credit: Math.max(-balance, 0), parties,
        });
      }
      setRows(result.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e: any) {
      setError(e?.message || "Failed to load salesperson report."); setRows([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (selected !== "ALL" && r.name !== selected) return false;
    if (statusFilter === "active" && !r.active) return false;
    if (statusFilter === "inactive" && r.active) return false;
    if (balanceFilter === "debit" && r.debit <= 0) return false;
    if (balanceFilter === "credit" && r.credit <= 0) return false;
    const q = search.trim().toLowerCase();
    return !q || r.name.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q) || r.parties.some((p) => p.name.toLowerCase().includes(q));
  }), [rows, selected, statusFilter, balanceFilter, search]);

  const totals = useMemo(() => filtered.reduce((a, r) => ({
    orders: a.orders + r.orders, gross: a.gross + r.grossSales, returns: a.returns + r.returns,
    sales: a.sales + r.netSales, received: a.received + r.received, debit: a.debit + r.debit, credit: a.credit + r.credit,
  }), { orders: 0, gross: 0, returns: 0, sales: 0, received: 0, debit: 0, credit: 0 }), [filtered]);

  const saveSalesperson = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim()) return; setSaving(true); setError(null);
    try {
      if (editing) {
        const { error: updateError } = await supabase.from("chart_of_accounts").update({ name: name.trim(), updated_at: new Date().toISOString() }).eq("id", editing.id).eq("account_role", "sales_person");
        if (updateError) throw updateError;
      } else {
        const { data: auth, error: authError } = await supabase.auth.getUser(); if (authError) throw authError; if (!auth.user) throw new Error("Login session not found.");
        const { error: insertError } = await supabase.from("chart_of_accounts").insert({ user_id: auth.user.id, code: makeCode(), name: name.trim(), type: "expense", account_role: "sales_person", is_group: false, normal_balance: "debit", allow_manual_entries: false, is_system_account: false, is_active: true, description: "Salesperson master record - non posting" });
        if (insertError) throw insertError;
      }
      setModal(false); setName(""); setEditing(null); await load();
    } catch (e: any) { setError(e?.message || "Failed to save salesperson."); } finally { setSaving(false); }
  };

  const toggleActive = async (r: Summary) => {
    if (!r.id) return setError("Historical salesperson must be registered before activation changes.");
    const { error: e } = await supabase.from("chart_of_accounts").update({ is_active: !r.active, updated_at: new Date().toISOString() }).eq("id", r.id).eq("account_role", "sales_person");
    if (e) setError(e.message); else await load();
  };

  const exportExcel = () => {
    const exportRows = filtered.flatMap((r) => [
      { Salesperson: r.name, Party: "ALL", Invoices: r.orders, "Gross Sales": r.grossSales, Returns: r.returns, "Net Sales": r.netSales, Received: r.received, "Debit Balance": r.debit, "Credit Balance": r.credit },
      ...r.parties.map((p) => ({ Salesperson: r.name, Party: p.name, Invoices: p.orders, "Gross Sales": p.grossSales, Returns: p.returns, "Net Sales": p.netSales, Received: p.received, "Debit Balance": p.debit, "Credit Balance": p.credit })),
    ]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportRows), "Salesperson Report"); XLSX.writeFile(wb, "Salesperson_Net_Performance.xlsx");
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <div><div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sales Analytics</div><h1 className="mt-1 flex items-center gap-2 text-xl font-bold"><Users className="h-5 w-5"/>Salesperson Performance / سیلز پرسن رپورٹ</h1><p className="mt-1 text-xs text-slate-500">Net sales after posted returns, collections, party balances and market outstanding.</p></div>
      <div className="flex gap-2"><button className="btn-secondary" onClick={exportExcel}><Download className="h-4 w-4"/>Excel</button><button className="btn-secondary" onClick={() => window.print()}><Printer className="h-4 w-4"/>Print / PDF</button><button className="btn-primary" onClick={() => { setEditing(null); setName(""); setModal(true); }}><Plus className="h-4 w-4"/>New Salesperson</button></div>
    </div>
    {error && <ErrorBanner message={error}/>} 
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
      {[['Invoices', totals.orders], ['Gross Sales', formatCurrency(totals.gross)], ['Returns', formatCurrency(totals.returns)], ['Net Sales', formatCurrency(totals.sales)], ['Received', formatCurrency(totals.received)], ['Debit', formatCurrency(totals.debit)], ['Credit', formatCurrency(totals.credit)]].map(([label, value]) => <div key={String(label)} className="card p-3"><div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div><div className="mt-1 font-bold text-slate-800">{value}</div></div>)}
    </div>
    <div className="card print:hidden p-3">
      <div className="flex flex-wrap gap-2"><div className="relative min-w-[240px] flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400"/><input className="input pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search salesperson or party..."/></div><select className="input w-44" value={selected} onChange={(e) => setSelected(e.target.value)}><option value="ALL">All Salespersons</option>{rows.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}</select><select className="input w-32" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}><option value="active">Active</option><option value="all">All Status</option><option value="inactive">Inactive</option></select><button className={`btn-secondary ${balanceFilter==='all'?'ring-2 ring-slate-300':''}`} onClick={() => setBalanceFilter('all')}>All</button><button className={`btn-secondary ${balanceFilter==='debit'?'ring-2 ring-blue-300':''}`} onClick={() => setBalanceFilter('debit')}>Show Debit Balance Only</button><button className={`btn-secondary ${balanceFilter==='credit'?'ring-2 ring-rose-300':''}`} onClick={() => setBalanceFilter('credit')}>Show Credit Balance Only</button><button className="btn-secondary" onClick={() => setShowParties((v) => !v)}>{showParties ? 'Hide Parties' : 'Show Parties'}</button></div>
    </div>
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[1100px] text-xs"><thead className="bg-slate-50"><tr className="border-b"><th className="p-3 text-left">Salesperson / Party</th><th className="p-2 text-center">Invoices</th><th className="p-2 text-right">Gross Sales</th><th className="p-2 text-right">Returns</th><th className="p-2 text-right">Net Sales</th><th className="p-2 text-right">Received</th><th className="p-2 text-right">Debit</th><th className="p-2 text-right">Credit</th><th className="p-2 text-right print:hidden">Actions</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={9} className="p-8 text-center text-slate-400">Loading...</td></tr> : filtered.length === 0 ? <tr><td colSpan={9} className="p-8 text-center text-slate-400">No records match current filters.</td></tr> : filtered.flatMap((r) => {
          const head = <tr key={`sp-${r.name}`} className="border-b bg-white font-semibold"><td className="p-3"><div>{r.name}</div><div className="text-[10px] font-normal text-slate-400">{r.code || 'Historical'} · {r.active ? 'Active' : 'Inactive'}</div></td><td className="p-2 text-center">{r.orders}</td><td className="p-2 text-right">{formatCurrency(r.grossSales)}</td><td className="p-2 text-right text-rose-600">{formatCurrency(r.returns)}</td><td className="p-2 text-right">{formatCurrency(r.netSales)}</td><td className="p-2 text-right text-emerald-700">{formatCurrency(r.received)}</td><td className="p-2 text-right text-blue-700">{formatCurrency(r.debit)}</td><td className="p-2 text-right text-rose-700">{formatCurrency(r.credit)}</td><td className="p-2 text-right print:hidden"><div className="flex justify-end gap-1"><button className="btn-secondary text-[10px]" disabled={!r.id} onClick={() => { setEditing(r.id ? { id:r.id, code:r.code||'', name:r.name, is_active:r.active } : null); setName(r.name); setModal(true); }}>Edit</button><button className="btn-secondary text-[10px]" disabled={!r.id} onClick={() => void toggleActive(r)}>{r.active ? 'Deactivate' : 'Activate'}</button></div></td></tr>;
          const partyRows = showParties ? r.parties.map((p) => <tr key={`${r.name}-${p.name}`} className="border-b bg-slate-50/50 text-slate-600"><td className="py-2 pl-8 pr-3">↳ {p.name}</td><td className="p-2 text-center">{p.orders}</td><td className="p-2 text-right">{formatCurrency(p.grossSales)}</td><td className="p-2 text-right text-rose-600">{formatCurrency(p.returns)}</td><td className="p-2 text-right">{formatCurrency(p.netSales)}</td><td className="p-2 text-right text-emerald-700">{formatCurrency(p.received)}</td><td className="p-2 text-right text-blue-700">{formatCurrency(p.debit)}</td><td className="p-2 text-right text-rose-700">{formatCurrency(p.credit)}</td><td className="print:hidden"/></tr>) : [];
          return [head, ...partyRows];
        })}
      </tbody>{!loading && filtered.length > 0 && <tfoot className="border-t-2 bg-slate-100 font-bold"><tr><td className="p-3">GRAND TOTAL<div className="text-[10px] font-normal text-slate-500">Filtered: {filtered.length} salesperson{filtered.length===1?'':'s'}</div></td><td className="p-2 text-center">{totals.orders}</td><td className="p-2 text-right">{formatCurrency(totals.gross)}</td><td className="p-2 text-right text-rose-600">{formatCurrency(totals.returns)}</td><td className="p-2 text-right">{formatCurrency(totals.sales)}</td><td className="p-2 text-right text-emerald-700">{formatCurrency(totals.received)}</td><td className="p-2 text-right text-blue-700">{formatCurrency(totals.debit)}</td><td className="p-2 text-right text-rose-700">{formatCurrency(totals.credit)}</td><td className="print:hidden"/></tr></tfoot>}</table>
    </div>
    <Modal open={modal} title={editing ? 'Edit Salesperson' : 'New Salesperson'} onClose={() => !saving && setModal(false)}><form onSubmit={saveSalesperson} className="space-y-3"><div><label className="label">Salesperson Name</label><input className="input" autoFocus required value={name} onChange={(e) => setName(e.target.value)}/></div><div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></div></form></Modal>
  </div>;
}
