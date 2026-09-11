import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import SearchableSelect from "@/components/SearchableSelect";
import { ErrorBanner, formatCurrency, formatDate } from "@/components/ui";

type CustomerRow = { id: string; name: string; phone?: string | null; email?: string | null };
type AgingInvoice = {
  sales_order_id: string;
  customer_id: string;
  customer_name: string | null;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  invoice_amount: number | string;
  paid_amount: number | string;
  outstanding_amount: number | string;
  payment_status: string;
  days_outstanding: number;
  overdue_days: number;
  aging_status: string;
  aging_bucket: string;
  company_id?: string | null;
  business_unit_id?: string | null;
  invoice_type?: string | null;
  payment_mode?: string | null;
  sales_person?: string | null;
};
type PaymentAllocation = {
  id: string;
  sales_order_id: string;
  journal_entry_id: string;
  allocation_date: string;
  amount: number | string;
  reference: string | null;
  notes: string | null;
};

const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const normalizedDocType = (raw?: string | null) => {
  const value = (raw || "").trim().toLowerCase();
  if (value === "tax invoice" || value === "with tax") return "With Tax";
  if (value === "cash bill" || value === "without tax" || value === "sale invoice" || !value) return "Without Tax";
  return raw || "Without Tax";
};
const statusBadge = (status: string) => {
  const s = (status || "").toLowerCase();
  const cls = s === "paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : s === "partial" ? "bg-amber-50 text-amber-700 border-amber-200" : s === "overdue" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-slate-50 text-slate-700 border-slate-200";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${cls}`}>{s || "—"}</span>;
};

export default function CustomerInvoiceStatement() {
  const { activeCompany, activeBusinessUnit } = useAuth();
  const companyId = activeCompany?.company_id ?? null;
  const businessUnitId = activeBusinessUnit?.business_unit_id ?? null;

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [invoices, setInvoices] = useState<AgingInvoice[]>([]);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [agingFilter, setAgingFilter] = useState("all");
  const [documentFilter, setDocumentFilter] = useState("all");
  const [paymentModeFilter, setPaymentModeFilter] = useState("all");
  const [showColumns, setShowColumns] = useState(false);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState({ type: true, mode: true, salesperson: true, dueDate: true, age: true, overdue: true, aging: true });

  const loadReport = useCallback(async () => {
    if (!companyId) {
      setCustomers([]); setInvoices([]); setAllocations([]); setLoading(false); return;
    }
    setLoading(true); setError(null);

    let customerQuery = supabase.from("customers").select("id,name,phone,email").eq("company_id", companyId).order("name");
    let invoiceQuery = supabase.from("customer_invoice_aging").select("*").eq("company_id", companyId).order("invoice_date", { ascending: false });
    let metadataQuery = supabase.from("sales_orders").select("id,invoice_type,payment_mode,sales_person").eq("company_id", companyId);
    let allocationQuery = supabase.from("invoice_payment_allocations").select("id,sales_order_id,journal_entry_id,allocation_date,amount,reference,notes").eq("company_id", companyId).order("allocation_date", { ascending: false });

    if (businessUnitId) {
      invoiceQuery = invoiceQuery.eq("business_unit_id", businessUnitId);
      metadataQuery = metadataQuery.eq("business_unit_id", businessUnitId);
      allocationQuery = allocationQuery.eq("business_unit_id", businessUnitId);
    }

    const [customerResult, invoiceResult, metadataResult, allocationResult] = await Promise.all([customerQuery, invoiceQuery, metadataQuery, allocationQuery]);
    const firstError = customerResult.error || invoiceResult.error || metadataResult.error || allocationResult.error;
    if (firstError) setError(firstError.message);

    setCustomers((customerResult.data ?? []) as CustomerRow[]);
    const meta = new Map((metadataResult.data ?? []).map((row: any) => [row.id, row]));
    setInvoices(((invoiceResult.data ?? []) as AgingInvoice[]).map(row => ({ ...row, ...(meta.get(row.sales_order_id) ?? {}) })));
    setAllocations((allocationResult.data ?? []) as PaymentAllocation[]);
    setLoading(false);
  }, [companyId, businessUnitId]);

  useEffect(() => { void loadReport(); }, [loadReport]);

  const selectedCustomer = useMemo(() => customers.find(c => c.id === selectedCustomerId) ?? null, [customers, selectedCustomerId]);
  const customerMatches = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 50);
    return customers.filter(c => c.name.toLowerCase().includes(q)).slice(0, 50);
  }, [customers, customerSearch]);

  const baseFilteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    return invoices.filter(inv => {
      const customerOk = !selectedCustomerId || inv.customer_id === selectedCustomerId;
      const statusOk = statusFilter === "all" || (inv.payment_status || "").toLowerCase() === statusFilter;
      const documentOk = documentFilter === "all" || normalizedDocType(inv.invoice_type) === documentFilter;
      const modeOk = paymentModeFilter === "all" || (inv.payment_mode || "Credit") === paymentModeFilter;
      const searchOk = !q || [inv.invoice_no, inv.invoice_date, inv.due_date, inv.customer_name, inv.payment_status, inv.aging_status, inv.aging_bucket, inv.sales_person].join(" ").toLowerCase().includes(q);
      return customerOk && statusOk && documentOk && modeOk && searchOk;
    });
  }, [invoices, selectedCustomerId, statusFilter, documentFilter, paymentModeFilter, invoiceSearch]);

  const filteredInvoices = useMemo(() => baseFilteredInvoices.filter(inv => agingFilter === "all" || inv.aging_bucket === agingFilter), [baseFilteredInvoices, agingFilter]);

  const summary = useMemo(() => filteredInvoices.reduce((a, inv) => {
    a.invoiced += num(inv.invoice_amount);
    a.received += num(inv.paid_amount);
    a.outstanding += num(inv.outstanding_amount);
    if (num(inv.overdue_days) > 0 && num(inv.outstanding_amount) > 0) a.overdue += num(inv.outstanding_amount);
    return a;
  }, { invoiced: 0, received: 0, outstanding: 0, overdue: 0 }), [filteredInvoices]);

  const bucketTotals = useMemo(() => {
    const totals: Record<string, number> = { Current: 0, "1-30 Days": 0, "31-60 Days": 0, "61-90 Days": 0, "90+ Days": 0 };
    baseFilteredInvoices.forEach(inv => { if (inv.aging_bucket in totals) totals[inv.aging_bucket] += num(inv.outstanding_amount); });
    return totals;
  }, [baseFilteredInvoices]);

  const clearCustomer = () => { setSelectedCustomerId(""); setCustomerSearch(""); setExpandedInvoiceId(null); };
  const exportCsv = () => {
    if (!filteredInvoices.length) return;
    const rows = [["Customer","Invoice No","Invoice Date","Document Type","Payment Mode","Salesperson","Due Date","Invoice","Received","Balance Due","Payment Status","Invoice Age Days","Overdue Days","Aging Bucket"], ...filteredInvoices.map(inv => [inv.customer_name || "", inv.invoice_no, inv.invoice_date, normalizedDocType(inv.invoice_type), inv.payment_mode || "Credit", inv.sales_person || "", inv.due_date || "", num(inv.invoice_amount).toFixed(2), num(inv.paid_amount).toFixed(2), num(inv.outstanding_amount).toFixed(2), inv.payment_status, String(inv.days_outstanding), String(inv.overdue_days), inv.aging_bucket])];
    const blob = new Blob(["\ufeff" + rows.map(r => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${selectedCustomer?.name?.replace(/\s+/g,"_") || "customer_aging"}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between print:hidden">
      <div><h1 className="text-2xl font-bold text-slate-900">Customer Invoice Statement & Aging</h1><p className="mt-1 text-sm text-slate-500">Company-wide receivables, payment history, outstanding balances and aging. Customer is an optional filter.</p></div>
      <div className="relative flex flex-wrap gap-2">
        <button type="button" onClick={() => setShowColumns(v => !v)} className="px-3 py-2 text-sm font-semibold rounded-lg border border-blue-200 bg-blue-50 text-blue-700">Customize</button>
        {showColumns && <div className="absolute right-0 top-11 z-50 grid w-[300px] grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">{Object.entries({type:"Document Type",mode:"Payment Mode",salesperson:"Salesperson",dueDate:"Due Date",age:"Invoice Age",overdue:"Overdue",aging:"Aging Bucket"}).map(([key,label]) => <label key={key} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={visibleColumns[key as keyof typeof visibleColumns]} onChange={() => setVisibleColumns(v => ({ ...v, [key]: !v[key as keyof typeof v] }))}/>{label}</label>)}</div>}
        <button type="button" onClick={exportCsv} disabled={!filteredInvoices.length} className="px-3 py-2 text-sm font-semibold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 disabled:opacity-50">Export CSV</button>
        <button type="button" onClick={() => window.print()} className="px-3 py-2 text-sm font-semibold rounded-lg border border-slate-300 hover:bg-slate-50">Print</button>
      </div>
    </div>

    {error && <ErrorBanner message={error} />}

    <div className="rounded-xl border border-slate-200 bg-white p-4 print:hidden">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="relative"><label className="label">Customer</label><div className="relative"><input className="input pr-14" value={customerSearch} onChange={e => { setCustomerSearch(e.target.value); if (selectedCustomerId) setSelectedCustomerId(""); }} placeholder="All customers / search customer..."/>{(customerSearch || selectedCustomerId) && <button type="button" onClick={clearCustomer} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">Clear</button>}</div>{!selectedCustomerId && customerSearch.trim() && <div className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">{customerMatches.length ? customerMatches.map(c => <button key={c.id} type="button" onClick={() => { setSelectedCustomerId(c.id); setCustomerSearch(c.name); }} className="w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50">{c.name}</button>) : <div className="px-3 py-3 text-sm text-slate-400">No customer found.</div>}</div>}</div>
        <div><label className="label">Payment Status</label><SearchableSelect className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All Statuses</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option><option value="overdue">Overdue</option></SearchableSelect></div>
        <div><label className="label">Aging Bucket</label><SearchableSelect className="input" value={agingFilter} onChange={e => setAgingFilter(e.target.value)}><option value="all">All Aging</option><option value="Current">Current</option><option value="1-30 Days">1-30 Days</option><option value="31-60 Days">31-60 Days</option><option value="61-90 Days">61-90 Days</option><option value="90+ Days">90+ Days</option></SearchableSelect></div>
        <div><label className="label">Document Type</label><SearchableSelect className="input" value={documentFilter} onChange={e => setDocumentFilter(e.target.value)}><option value="all">All Documents</option><option value="Without Tax">Without Tax</option><option value="With Tax">With Tax</option></SearchableSelect></div>
        <div><label className="label">Payment Mode</label><SearchableSelect className="input" value={paymentModeFilter} onChange={e => setPaymentModeFilter(e.target.value)}><option value="all">All Payment Modes</option><option value="Credit">Credit</option><option value="Cash">Cash</option><option value="Bank">Bank</option><option value="Partial">Partial</option></SearchableSelect></div>
      </div>
      <input className="input mt-4" value={invoiceSearch} onChange={e => setInvoiceSearch(e.target.value)} placeholder="Search customer, invoice no., date, payment status, salesperson or aging..."/>
    </div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><div className="rounded-xl border bg-white p-4"><div className="text-xs text-slate-500">Total Invoiced</div><div className="mt-1 text-xl font-bold">{formatCurrency(summary.invoiced)}</div></div><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="text-xs text-emerald-700">Total Received</div><div className="mt-1 text-xl font-bold text-emerald-800">{formatCurrency(summary.received)}</div></div><div className="rounded-xl border border-rose-200 bg-rose-50 p-4"><div className="text-xs text-rose-700">Outstanding</div><div className="mt-1 text-xl font-bold text-rose-800">{formatCurrency(summary.outstanding)}</div></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="text-xs text-amber-700">Overdue Amount</div><div className="mt-1 text-xl font-bold text-amber-800">{formatCurrency(summary.overdue)}</div></div></div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Object.entries(bucketTotals).map(([label,amount]) => <button key={label} type="button" onClick={() => setAgingFilter(label)} className={`rounded-xl border p-3 text-left ${agingFilter === label ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-bold">{formatCurrency(amount)}</div></button>)}</div>

    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b px-4 py-3"><div><h3 className="font-bold">Invoice-wise Statement</h3><p className="text-xs text-slate-500">Click a row to see payments allocated against that invoice.</p></div><div className="text-xs text-slate-500">{loading ? "Loading..." : `${filteredInvoices.length} invoice${filteredInvoices.length === 1 ? "" : "s"}`}</div></div><div className="overflow-x-auto"><table className="w-full min-w-[1400px] text-sm"><thead className="bg-slate-50"><tr className="border-b text-slate-600"><th className="px-3 py-3 text-left">Customer</th><th className="px-3 py-3 text-left">Invoice #</th><th className="px-3 py-3 text-left">Invoice Date</th>{visibleColumns.type && <th className="px-3 py-3 text-left">Document Type</th>}{visibleColumns.mode && <th className="px-3 py-3 text-left">Payment Mode</th>}{visibleColumns.salesperson && <th className="px-3 py-3 text-left">Salesperson</th>}{visibleColumns.dueDate && <th className="px-3 py-3 text-left">Due Date</th>}<th className="px-3 py-3 text-right">Invoice</th><th className="px-3 py-3 text-right">Received</th><th className="px-3 py-3 text-right">Balance Due</th><th className="px-3 py-3 text-left">Payment</th>{visibleColumns.age && <th className="px-3 py-3 text-right">Invoice Age</th>}{visibleColumns.overdue && <th className="px-3 py-3 text-right">Overdue</th>}{visibleColumns.aging && <th className="px-3 py-3 text-left">Aging Bucket</th>}</tr></thead><tbody>{loading ? <tr><td colSpan={14} className="px-3 py-10 text-center text-slate-400">Loading receivables...</td></tr> : !filteredInvoices.length ? <tr><td colSpan={14} className="px-3 py-10 text-center text-slate-400">No invoices match the current filters.</td></tr> : filteredInvoices.map(inv => { const expanded = expandedInvoiceId === inv.sales_order_id; const pays = allocations.filter(a => a.sales_order_id === inv.sales_order_id); return <>
      <tr key={inv.sales_order_id} onClick={() => setExpandedInvoiceId(expanded ? null : inv.sales_order_id)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"><td className="px-3 py-3 font-semibold">{inv.customer_name || "—"}</td><td className="px-3 py-3 font-semibold text-blue-700">{inv.invoice_no} <span className="text-[11px] text-slate-400">{expanded ? "▲" : "▼"}</span></td><td className="px-3 py-3">{formatDate(inv.invoice_date)}</td>{visibleColumns.type && <td className="px-3 py-3">{normalizedDocType(inv.invoice_type)}</td>}{visibleColumns.mode && <td className="px-3 py-3">{inv.payment_mode || "Credit"}</td>}{visibleColumns.salesperson && <td className="px-3 py-3">{inv.sales_person || "—"}</td>}{visibleColumns.dueDate && <td className="px-3 py-3">{inv.due_date ? formatDate(inv.due_date) : "—"}</td>}<td className="px-3 py-3 text-right font-semibold">{formatCurrency(num(inv.invoice_amount))}</td><td className="px-3 py-3 text-right font-semibold text-emerald-700">{formatCurrency(num(inv.paid_amount))}</td><td className="px-3 py-3 text-right font-bold text-rose-700">{formatCurrency(num(inv.outstanding_amount))}</td><td className="px-3 py-3">{statusBadge(inv.payment_status)}</td>{visibleColumns.age && <td className="px-3 py-3 text-right">{num(inv.days_outstanding)} days</td>}{visibleColumns.overdue && <td className="px-3 py-3 text-right">{num(inv.overdue_days) > 0 ? `${num(inv.overdue_days)} days` : "Current"}</td>}{visibleColumns.aging && <td className="px-3 py-3">{inv.aging_bucket}</td>}</tr>
      {expanded && <tr key={`${inv.sales_order_id}-payments`}><td colSpan={14} className="border-b bg-slate-50 px-5 py-4"><div className="mb-2 font-semibold">Payment History — {inv.invoice_no}</div>{pays.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] bg-white text-sm"><thead><tr className="border-b text-slate-500"><th className="px-3 py-2 text-left">Payment Date</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-left">Reference</th><th className="px-3 py-2 text-left">Notes</th><th className="px-3 py-2 text-left">Journal</th></tr></thead><tbody>{pays.map(p => <tr key={p.id} className="border-b"><td className="px-3 py-2">{formatDate(p.allocation_date)}</td><td className="px-3 py-2 text-right font-bold text-emerald-700">{formatCurrency(num(p.amount))}</td><td className="px-3 py-2">{p.reference || "—"}</td><td className="px-3 py-2">{p.notes || "—"}</td><td className="px-3 py-2 font-mono text-xs text-slate-500">{p.journal_entry_id}</td></tr>)}</tbody></table></div> : <div className="text-sm text-slate-500">No payment allocations found.</div>}</td></tr>}
    </>; })}</tbody></table></div></div>
  </div>;
}
