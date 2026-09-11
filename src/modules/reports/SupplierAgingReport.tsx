import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, RefreshCw, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import { ErrorBanner, formatCurrency, formatDate } from "@/components/ui";

type AgingRow = {
  purchase_order_id: string; company_id: string; business_unit_id: string | null; supplier_id: string;
  supplier_name: string | null; invoice_no: string | null; invoice_date: string | null; due_date: string | null;
  invoice_amount: number | null; paid_amount: number | null; outstanding_amount: number | null;
  payment_status: string | null; aging_status: string | null; overdue_days: number | null; aging_bucket: string | null;
};
type Supplier = { id: string; name: string; is_active: boolean };
const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const PAYMENT_STATUSES = ["open", "partial", "overdue", "paid"] as const;
const AGING_BUCKETS = ["Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days", "Paid", "No Due Date"] as const;

export default function SupplierAgingReport() {
  const { activeCompany, activeBusinessUnit } = useAuth();
  const companyId = activeCompany?.company_id;
  const businessUnitId = activeBusinessUnit?.business_unit_id;
  const [data, setData] = useState<AgingRow[]>([]); const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [supplier, setSupplier] = useState(""); const [paymentStatus, setPaymentStatus] = useState(""); const [agingBucket, setAgingBucket] = useState("");

  const load = useCallback(async () => {
    if (!companyId) { setData([]); setSuppliers([]); setLoading(false); return; }
    setLoading(true); setError(null);
    let agingQuery = supabase.from("supplier_invoice_aging").select("*").eq("company_id", companyId).order("invoice_date", { ascending: false }).limit(10000);
    if (businessUnitId) agingQuery = agingQuery.eq("business_unit_id", businessUnitId);
    const supplierQuery = supabase.from("suppliers").select("id,name,is_active").eq("company_id", companyId).eq("is_active", true).order("name");
    const [agingResult, supplierResult] = await Promise.all([agingQuery, supplierQuery]);
    if (agingResult.error || supplierResult.error) setError(agingResult.error?.message || supplierResult.error?.message || "Supplier aging load failed.");
    setData((agingResult.data ?? []) as AgingRow[]); setSuppliers((supplierResult.data ?? []) as Supplier[]); setLoading(false);
  }, [companyId, businessUnitId]);
  useEffect(() => { void load(); }, [load]);

  const supplierNames = useMemo(() => Array.from(new Set(suppliers.map(s => s.name.trim()).filter(Boolean))).sort(), [suppliers]);
  const rows = useMemo(() => data.filter(r => {
    const d = String(r.invoice_date ?? "").slice(0, 10);
    if (from && d < from) return false; if (to && d > to) return false;
    if (supplier && String(r.supplier_name ?? "") !== supplier) return false;
    if (paymentStatus && String(r.aging_status ?? "").toLowerCase() !== paymentStatus) return false;
    if (agingBucket && String(r.aging_bucket ?? "") !== agingBucket) return false;
    const search = q.trim().toLowerCase(); if (!search) return true;
    return [r.invoice_no, r.invoice_date, r.supplier_name, r.payment_status, r.aging_status, r.aging_bucket, r.due_date].some(v => String(v ?? "").toLowerCase().includes(search));
  }), [data, q, from, to, supplier, paymentStatus, agingBucket]);
  const summary = useMemo(() => rows.reduce((a, r) => { a.invoiced += num(r.invoice_amount); a.paid += num(r.paid_amount); a.outstanding += num(r.outstanding_amount); if (num(r.overdue_days) > 0 && num(r.outstanding_amount) > 0) a.overdue += num(r.outstanding_amount); return a; }, { invoiced: 0, paid: 0, outstanding: 0, overdue: 0 }), [rows]);
  const bucketTotals = useMemo(() => Object.fromEntries(AGING_BUCKETS.map(bucket => [bucket, rows.filter(r => r.aging_bucket === bucket).reduce((s, r) => s + num(r.outstanding_amount), 0)])), [rows]);
  const reset = () => { setQ(""); setFrom(""); setTo(""); setSupplier(""); setPaymentStatus(""); setAgingBucket(""); };

  return <div className="space-y-4 pb-12 print-report" data-print-root>
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="flex items-center gap-2 text-xl font-bold"><BarChart3 className="h-5 w-5 text-blue-600"/>Supplier Aging</h1><p className="mt-1 text-xs text-slate-500">Company-wide posted supplier payables, due dates and aging. Supplier, payment status and aging bucket are independent filters.</p></div>
      <button className="btn-secondary no-print" onClick={() => void load()}><RefreshCw className="h-4 w-4"/>Refresh</button>
    </section>
    {error && <ErrorBanner message={error}/>} 
    <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" data-export-summary>
      <div className="summary-card"><div className="summary-label">Total Invoiced</div><div className="summary-value">{formatCurrency(summary.invoiced)}</div></div>
      <div className="summary-card"><div className="summary-label">Total Paid</div><div className="summary-value">{formatCurrency(summary.paid)}</div></div>
      <div className="summary-card"><div className="summary-label">Outstanding</div><div className="summary-value">{formatCurrency(summary.outstanding)}</div></div>
      <div className="summary-card"><div className="summary-label">Overdue Amount</div><div className="summary-value">{formatCurrency(summary.overdue)}</div></div>
    </section>
    <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" data-export-summary data-print-summary>
      {AGING_BUCKETS.map(bucket => <button type="button" key={bucket} className={`rounded-xl border bg-white p-3 text-left ${agingBucket === bucket ? "ring-2 ring-blue-500" : ""}`} onClick={() => setAgingBucket(v => v === bucket ? "" : bucket)}><div className="text-xs font-bold text-slate-500">{bucket}</div><div className="mt-1 text-sm font-black">{formatCurrency(num(bucketTotals[bucket]))}</div></button>)}
    </section>
    <section className="no-print rounded-xl border border-slate-200 bg-white p-3" data-report-filters>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
        <label className="lg:col-span-2"><span className="sr-only">Search</span><input className="input w-full" aria-label="Search" placeholder="Search supplier, invoice, date, status or aging..." value={q} onChange={e => setQ(e.target.value)}/></label>
        <label><span className="sr-only">From Date</span><input type="date" aria-label="From Date" className="input w-full" value={from} onChange={e => setFrom(e.target.value)}/></label>
        <label><span className="sr-only">To Date</span><input type="date" aria-label="To Date" className="input w-full" value={to} onChange={e => setTo(e.target.value)}/></label>
        <label><span className="sr-only">Supplier</span><select aria-label="Supplier" className="input w-full" value={supplier} onChange={e => setSupplier(e.target.value)}><option value="">All Suppliers</option>{supplierNames.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        <label><span className="sr-only">Payment Status</span><select aria-label="Payment Status" className="input w-full" value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}><option value="">All Payment Statuses</option>{PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></label>
        <label><span className="sr-only">Aging Bucket</span><select aria-label="Aging Bucket" className="input w-full" value={agingBucket} onChange={e => setAgingBucket(e.target.value)}><option value="">All Aging Buckets</option>{AGING_BUCKETS.map(bucket => <option key={bucket} value={bucket}>{bucket}</option>)}</select></label>
      </div>
      <button className="btn-secondary mt-2" onClick={reset}><RotateCcw className="h-4 w-4"/>Reset</button>
    </section>
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="table w-full">
      <thead><tr><th>Invoice</th><th>Date</th><th>Supplier</th><th className="text-right">Invoice</th><th className="text-right">Paid</th><th className="text-right">Outstanding</th><th>Due</th><th>Status</th><th className="text-right">Overdue Days</th><th>Bucket</th></tr></thead>
      <tbody>{loading ? <tr><td colSpan={10} className="py-12 text-center text-slate-500">Loading supplier aging…</td></tr> : rows.length ? rows.map((r, i) => <tr key={r.purchase_order_id || `${r.invoice_no}-${i}`}><td>{r.invoice_no || "—"}</td><td>{r.invoice_date ? formatDate(r.invoice_date) : "—"}</td><td>{r.supplier_name || "—"}</td><td className="text-right tabular-nums">{formatCurrency(num(r.invoice_amount))}</td><td className="text-right tabular-nums">{formatCurrency(num(r.paid_amount))}</td><td className="text-right tabular-nums">{formatCurrency(num(r.outstanding_amount))}</td><td>{r.due_date ? formatDate(r.due_date) : "—"}</td><td>{r.aging_status || r.payment_status || "—"}</td><td className="text-right tabular-nums">{num(r.overdue_days).toLocaleString()}</td><td>{r.aging_bucket || "—"}</td></tr>) : <tr><td colSpan={10} className="py-12 text-center text-slate-500">No posted supplier invoices match the current filters.</td></tr>}</tbody>
      <tfoot><tr className="bg-slate-50 font-semibold"><td colSpan={10}>{rows.length.toLocaleString()} record{rows.length === 1 ? "" : "s"}</td></tr></tfoot>
    </table></div>
  </div>;
}
