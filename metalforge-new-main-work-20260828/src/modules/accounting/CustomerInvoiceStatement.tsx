import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import { Customer } from "@/types";
import {
  ErrorBanner,
  formatCurrency,
  formatDate,
} from "@/components/ui";

type AgingInvoice = {
  sales_order_id: string;
  user_id: string;
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
};

type PaymentAllocation = {
  id: string;
  sales_order_id: string;
  journal_entry_id: string;
  allocation_date: string;
  amount: number | string;
  reference: string | null;
  notes: string | null;
  created_at: string;
};

const toNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const statusBadge = (status: string) => {
  const normalized = (status || "").toLowerCase();

  const className =
    normalized === "paid"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : normalized === "partial"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : normalized === "overdue"
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${className}`}
    >
      {normalized || "—"}
    </span>
  );
};

export default function CustomerInvoiceStatement() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  const [invoices, setInvoices] = useState<AgingInvoice[]>([]);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [agingFilter, setAgingFilter] = useState("all");
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(
    null
  );

  useEffect(() => {
    const loadCustomers = async () => {
      setLoadingCustomers(true);

      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("name");

      if (error) {
        setError(error.message);
        setCustomers([]);
      } else {
        setCustomers((data ?? []) as Customer[]);
      }

      setLoadingCustomers(false);
    };

    loadCustomers();
  }, []);

  const loadStatement = useCallback(async (customerId: string) => {
    if (!customerId) {
      setInvoices([]);
      setAllocations([]);
      return;
    }

    setLoading(true);
    setError(null);

    const [invoiceResult, allocationResult] = await Promise.all([
      supabase
        .from("customer_invoice_aging")
        .select("*")
        .eq("customer_id", customerId)
        .order("invoice_date", { ascending: false }),

      supabase
        .from("invoice_payment_allocations")
        .select(
          "id,sales_order_id,journal_entry_id,allocation_date,amount,reference,notes,created_at"
        )
        .eq("customer_id", customerId)
        .order("allocation_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    if (invoiceResult.error) {
      setError(invoiceResult.error.message);
      setInvoices([]);
    } else {
      setInvoices((invoiceResult.data ?? []) as AgingInvoice[]);
    }

    if (allocationResult.error) {
      setError(allocationResult.error.message);
      setAllocations([]);
    } else {
      setAllocations((allocationResult.data ?? []) as PaymentAllocation[]);
    }

    setLoading(false);
  }, []);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();

    if (!q) return customers.slice(0, 50);

    return customers
      .filter((customer) => customer.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [customers, customerSearch]);

  const selectedCustomer = useMemo(
    () =>
      customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  const selectCustomer = async (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    setCustomerSearch(customer.name);
    setInvoiceSearch("");
    setStatusFilter("all");
    setAgingFilter("all");
    setExpandedInvoiceId(null);
    await loadStatement(customer.id);
  };

  const clearCustomer = () => {
    setSelectedCustomerId("");
    setCustomerSearch("");
    setInvoices([]);
    setAllocations([]);
    setInvoiceSearch("");
    setExpandedInvoiceId(null);
  };

  const summary = useMemo(() => {
    return invoices.reduce(
      (acc, invoice) => {
        acc.invoiced += toNumber(invoice.invoice_amount);
        acc.received += toNumber(invoice.paid_amount);
        acc.outstanding += toNumber(invoice.outstanding_amount);

        if (
          Number(invoice.overdue_days) > 0 &&
          toNumber(invoice.outstanding_amount) > 0
        ) {
          acc.overdue += toNumber(invoice.outstanding_amount);
        }

        return acc;
      },
      {
        invoiced: 0,
        received: 0,
        outstanding: 0,
        overdue: 0,
      }
    );
  }, [invoices]);

  const bucketTotals = useMemo(() => {
    const buckets: Record<string, number> = {
      Current: 0,
      "1-30 Days": 0,
      "31-60 Days": 0,
      "61-90 Days": 0,
      "90+ Days": 0,
      Paid: 0,
      "No Due Date": 0,
    };

    for (const invoice of invoices) {
      const key = invoice.aging_bucket || "No Due Date";
      buckets[key] = (buckets[key] || 0) + toNumber(invoice.outstanding_amount);
    }

    return buckets;
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();

    return invoices.filter((invoice) => {
      const matchesSearch =
        !q ||
        [
          invoice.invoice_no,
          invoice.invoice_date,
          invoice.due_date || "",
          invoice.payment_status,
          invoice.aging_status,
          invoice.aging_bucket,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);

      const matchesStatus =
        statusFilter === "all" ||
        invoice.payment_status.toLowerCase() === statusFilter;

      const matchesAging =
        agingFilter === "all" || invoice.aging_bucket === agingFilter;

      return matchesSearch && matchesStatus && matchesAging;
    });
  }, [invoices, invoiceSearch, statusFilter, agingFilter]);

  const paymentRowsForInvoice = useCallback(
    (invoiceId: string) =>
      allocations.filter(
        (allocation) => allocation.sales_order_id === invoiceId
      ),
    [allocations]
  );

  const exportCsv = () => {
    if (!selectedCustomer || filteredInvoices.length === 0) return;

    const header = [
      "Invoice No",
      "Invoice Date",
      "Due Date",
      "Invoice Amount",
      "Received",
      "Balance Due",
      "Payment Status",
      "Invoice Age Days",
      "Overdue Days",
      "Aging Bucket",
    ];

    const body = filteredInvoices.map((invoice) => [
      invoice.invoice_no,
      invoice.invoice_date,
      invoice.due_date || "",
      toNumber(invoice.invoice_amount).toFixed(2),
      toNumber(invoice.paid_amount).toFixed(2),
      toNumber(invoice.outstanding_amount).toFixed(2),
      invoice.payment_status,
      String(invoice.days_outstanding),
      String(invoice.overdue_days),
      invoice.aging_bucket,
    ]);

    const csv = [header, ...body]
      .map((row) =>
        row
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${selectedCustomer.name.replace(/\s+/g, "_")}_invoice_statement.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printStatement = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Customer Invoice Statement & Aging
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Invoice-wise receivables, payment history, outstanding balances and aging.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!selectedCustomerId || filteredInvoices.length === 0}
            className="px-3 py-2 text-sm font-semibold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            Export CSV
          </button>

          <button
            type="button"
            onClick={printStatement}
            disabled={!selectedCustomerId}
            className="px-3 py-2 text-sm font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            Print / PDF
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="rounded-xl border border-slate-200 bg-white p-4 print:hidden">
        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr_1fr] gap-4">
          <div className="relative">
            <label className="label">Customer / گاہک</label>

            <div className="relative">
              <input
                className="input pr-16"
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);

                  if (selectedCustomerId) {
                    setSelectedCustomerId("");
                    setInvoices([]);
                    setAllocations([]);
                  }
                }}
                placeholder={
                  loadingCustomers ? "Loading customers..." : "Search customer..."
                }
                disabled={loadingCustomers}
              />

              {(customerSearch || selectedCustomerId) && (
                <button
                  type="button"
                  onClick={clearCustomer}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Clear
                </button>
              )}
            </div>

            {!selectedCustomerId && customerSearch.trim() && (
              <div className="absolute z-40 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {filteredCustomers.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-slate-400">
                    No customer found.
                  </div>
                ) : (
                  filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => selectCustomer(customer)}
                      className="w-full px-3 py-2 text-left hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                    >
                      <div className="font-semibold text-sm text-slate-900">
                        {customer.name}
                      </div>
                      <div className="text-[11px] text-slate-400">Customer / گاہک</div>
                    </button>
                  ))
                )}
              </div>
            )}

            {selectedCustomer && (
              <div className="mt-1 text-xs font-medium text-emerald-700">
                Selected: {selectedCustomer.name}
              </div>
            )}
          </div>

          <div>
            <label className="label">Payment Status / ادائیگی حالت</label>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              disabled={!selectedCustomerId}
            >
              <option value="all">All Statuses / تمام حالتیں</option>
              <option value="unpaid">Unpaid / غیر ادا شدہ</option>
              <option value="partial">Partial / جزوی</option>
              <option value="paid">Paid / ادا شدہ</option>
            </select>
          </div>

          <div>
            <label className="label">Aging Bucket / بقایا مدت</label>
            <select
              className="input"
              value={agingFilter}
              onChange={(e) => setAgingFilter(e.target.value)}
              disabled={!selectedCustomerId}
            >
              <option value="all">All Aging / تمام مدتیں</option>
              <option value="Current">Current / موجودہ</option>
              <option value="1-30 Days">1-30 Days</option>
              <option value="31-60 Days">31-60 Days</option>
              <option value="61-90 Days">61-90 Days</option>
              <option value="90+ Days">90+ Days</option>
              <option value="Paid">Paid / ادا شدہ</option>
              <option value="No Due Date">No Due Date / مقررہ تاریخ نہیں</option>
            </select>
          </div>
        </div>

        <div className="mt-4">
          <input
            className="input"
            value={invoiceSearch}
            onChange={(e) => setInvoiceSearch(e.target.value)}
            placeholder="Search invoice no., date, payment status or aging... / انوائس، تاریخ، ادائیگی یا مدت تلاش کریں..."
            disabled={!selectedCustomerId}
          />
        </div>
      </div>

      {selectedCustomer && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Customer Invoice Statement
              </div>
              <h2 className="mt-1 text-xl font-bold text-slate-900">
                {selectedCustomer.name}
              </h2>
              <div className="mt-1 text-sm text-slate-500">
                {selectedCustomer.phone || ""}
                {selectedCustomer.phone && selectedCustomer.email ? " · " : ""}
                {selectedCustomer.email || ""}
              </div>
            </div>

            <div className="text-sm text-slate-500">
              Generated: {formatDate(new Date().toISOString().slice(0, 10))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Total Invoiced / کل انوائس</div>
          <div className="mt-1 text-xl font-bold text-slate-900">
            {formatCurrency(summary.invoiced)}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-xs text-emerald-700">Total Received / کل وصولی</div>
          <div className="mt-1 text-xl font-bold text-emerald-800">
            {formatCurrency(summary.received)}
          </div>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="text-xs text-rose-700">Outstanding / بقایا</div>
          <div className="mt-1 text-xl font-bold text-rose-800">
            {formatCurrency(summary.outstanding)}
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs text-amber-700">Overdue Amount / زائد المیعاد رقم</div>
          <div className="mt-1 text-xl font-bold text-amber-800">
            {formatCurrency(summary.overdue)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          ["Current", bucketTotals["Current"]],
          ["1-30 Days", bucketTotals["1-30 Days"]],
          ["31-60 Days", bucketTotals["31-60 Days"]],
          ["61-90 Days", bucketTotals["61-90 Days"]],
          ["90+ Days", bucketTotals["90+ Days"]],
        ].map(([label, amount]) => (
          <button
            key={String(label)}
            type="button"
            onClick={() => setAgingFilter(String(label))}
            className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50 print:pointer-events-none"
          >
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 font-bold text-slate-900">
              {formatCurrency(toNumber(amount))}
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Invoice-wise Statement / انوائس وار اسٹیٹمنٹ</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click a row to see all payments allocated against that invoice.
            </p>
          </div>

          <div className="text-xs text-slate-500">
            {filteredInvoices.length} invoice
            {filteredInvoices.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="px-3 py-3 text-left font-medium">Invoice #</th>
                <th className="px-3 py-3 text-left font-medium">Invoice Date / انوائس تاریخ</th>
                <th className="px-3 py-3 text-left font-medium">Due Date / مقررہ تاریخ</th>
                <th className="px-3 py-3 text-right font-medium">Invoice / انوائس</th>
                <th className="px-3 py-3 text-right font-medium">Received / وصول شدہ</th>
                <th className="px-3 py-3 text-right font-medium">Balance Due / واجب الادا بیلنس</th>
                <th className="px-3 py-3 text-left font-medium">Payment / ادائیگی</th>
                <th className="px-3 py-3 text-right font-medium">Invoice Age / انوائس مدت</th>
                <th className="px-3 py-3 text-right font-medium">Overdue / زائد المیعاد</th>
                <th className="px-3 py-3 text-left font-medium">Aging Bucket / بقایا مدت</th>
              </tr>
            </thead>

            <tbody>
              {!selectedCustomerId ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-slate-400">
                    Select a customer to view invoice-wise statement.
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-slate-400">
                    Loading statement...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-slate-400">
                    No invoices found for the selected filters.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => {
                  const paymentRows = paymentRowsForInvoice(
                    invoice.sales_order_id
                  );
                  const expanded =
                    expandedInvoiceId === invoice.sales_order_id;

                  return (
                    <>
                      <tr
                        key={invoice.sales_order_id}
                        onClick={() =>
                          setExpandedInvoiceId(
                            expanded ? null : invoice.sales_order_id
                          )
                        }
                        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      >
                        <td className="px-3 py-3 font-semibold text-blue-700">
                          {invoice.invoice_no}
                          <span className="ml-2 text-[11px] text-slate-400 print:hidden">
                            {expanded ? "▲" : "▼"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {formatDate(invoice.invoice_date)}
                        </td>
                        <td className="px-3 py-3">
                          {invoice.due_date
                            ? formatDate(invoice.due_date)
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold">
                          {formatCurrency(toNumber(invoice.invoice_amount))}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-emerald-700">
                          {formatCurrency(toNumber(invoice.paid_amount))}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-rose-700">
                          {formatCurrency(
                            toNumber(invoice.outstanding_amount)
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {statusBadge(invoice.payment_status)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {Number(invoice.days_outstanding)} days
                        </td>
                        <td className="px-3 py-3 text-right">
                          {Number(invoice.overdue_days) > 0 ? (
                            <span className="font-semibold text-rose-700">
                              {Number(invoice.overdue_days)} days
                            </span>
                          ) : (
                            <span className="text-emerald-700">Current / موجودہ</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-700">
                            {invoice.aging_bucket}
                          </div>
                          <div className="text-[11px] capitalize text-slate-400">
                            {invoice.aging_status}
                          </div>
                        </td>
                      </tr>

                      {expanded && (
                        <tr key={`${invoice.sales_order_id}-payments`}>
                          <td
                            colSpan={10}
                            className="bg-slate-50 px-5 py-4 border-b border-slate-200"
                          >
                            <div className="font-semibold text-slate-800 mb-2">
                              Payment History — {invoice.invoice_no}
                            </div>

                            {paymentRows.length === 0 ? (
                              <div className="text-sm text-slate-400">
                                No payment allocations found.
                              </div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full min-w-[720px] text-sm bg-white rounded-lg overflow-hidden border border-slate-200">
                                  <thead className="bg-white">
                                    <tr className="border-b border-slate-200 text-slate-500">
                                      <th className="px-3 py-2 text-left font-medium">
                                        Payment Date
                                      </th>
                                      <th className="px-3 py-2 text-right font-medium">Received / وصول شدہ</th>
                                      <th className="px-3 py-2 text-left font-medium">Reference / حوالہ</th>
                                      <th className="px-3 py-2 text-left font-medium">
                                        Notes
                                      </th>
                                      <th className="px-3 py-2 text-left font-medium">
                                        Journal
                                      </th>
                                    </tr>
                                  </thead>

                                  <tbody>
                                    {paymentRows.map((payment) => (
                                      <tr
                                        key={payment.id}
                                        className="border-b border-slate-100 last:border-b-0"
                                      >
                                        <td className="px-3 py-2.5">
                                          {formatDate(
                                            payment.allocation_date
                                          )}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-bold text-emerald-700">
                                          {formatCurrency(
                                            toNumber(payment.amount)
                                          )}
                                        </td>
                                        <td className="px-3 py-2.5">
                                          {payment.reference || "—"}
                                        </td>
                                        <td className="px-3 py-2.5">
                                          {payment.notes || "—"}
                                        </td>
                                        <td className="px-3 py-2.5 font-mono text-xs text-slate-500">
                                          {payment.journal_entry_id}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
