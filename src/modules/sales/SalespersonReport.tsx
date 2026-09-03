import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Pencil,
  Plus,
  Printer,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ErrorBanner, Modal, formatCurrency, formatDate } from "@/components/ui";
import * as XLSX from "xlsx";

interface SalespersonAccount {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface SalesOrderReportRow {
  id: string;
  order_no: string;
  sales_person: string | null;
  order_date: string;
  total: number | string | null;
  paid_amount?: number | string | null;
  outstanding_amount?: number | string | null;
  invoice_type?: string | null;
  payment_mode?: string | null;
  status: string;
  customer_id: string | null;
  customer?: { name: string } | { name: string }[] | null;
}

interface SalespersonSummary {
  id?: string;
  code?: string;
  isActive?: boolean;
  salesPerson: string;
  totalOrders: number;
  totalSales: number;
  totalReceived: number;
  cashSales: number;
  creditSales: number;
  taxSales: number;
  balanceDue: number;
  debitBalance: number;
  creditBalance: number;
  customers: string[];
  earliestDate: string | null;
  latestDate: string | null;
  dateRange: string;
}

interface LedgerBalanceRow {
  account_id: string | null;
  debit: number | string | null;
  credit: number | string | null;
}

const toNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const getCustomerName = (customer: SalesOrderReportRow["customer"]) => {
  if (!customer) return "";
  if (Array.isArray(customer)) return customer[0]?.name ?? "";
  return customer.name ?? "";
};

const salespersonCode = () =>
  `SP-${Date.now().toString().slice(-8)}`;

export default function SalespersonReport() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<SalespersonSummary[]>([]);

  const [selectedSalesPerson, setSelectedSalesPerson] = useState("ALL");
  const [search, setSearch] = useState("");
  const [balanceSideFilter, setBalanceSideFilter] = useState<
    "all" | "debit" | "credit"
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    "active" | "all" | "inactive"
  >("active");
  const [showColumns, setShowColumns] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    customers: true, dateRange: true, cashSales: true, creditSales: true,
    taxSales: true, sales: true, received: true, debit: true, credit: true,
    collection: true, actions: true,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newSalesPersonName, setNewSalesPersonName] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchReportData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [salespersonResult, ordersResult, ledgerResult] = await Promise.all([
        supabase
          .from("chart_of_accounts")
          .select("id,code,name,is_active")
          .eq("account_role", "sales_person")
          .order("name"),

        supabase
          .from("sales_orders")
          .select(
            `
            id,
            order_no,
            sales_person,
            order_date,
            total,
            paid_amount,
            outstanding_amount,
            invoice_type,
            payment_mode,
            status,
            customer_id,
            customer:customers(name)
          `
          )
          .in("status", ["posted", "closed", "approved"])
          .order("order_date", { ascending: true }),

        supabase
          .from("ledgers")
          .select("account_id,debit,credit"),
      ]);

      if (salespersonResult.error) throw salespersonResult.error;
      if (ordersResult.error) throw ordersResult.error;
      if (ledgerResult.error) throw ledgerResult.error;

      const salespersonAccounts =
        (salespersonResult.data ?? []) as SalespersonAccount[];

      const orders =
        (ordersResult.data ?? []) as unknown as SalesOrderReportRow[];

      const ledgerRows =
        (ledgerResult.data ?? []) as LedgerBalanceRow[];

      const ledgerTotalsByAccount = new Map<
        string,
        { debit: number; credit: number }
      >();

      for (const line of ledgerRows) {
        if (!line.account_id) continue;

        const current = ledgerTotalsByAccount.get(line.account_id) ?? {
          debit: 0,
          credit: 0,
        };

        current.debit += toNumber(line.debit);
        current.credit += toNumber(line.credit);
        ledgerTotalsByAccount.set(line.account_id, current);
      }

      const accountByName = new Map<string, SalespersonAccount>();
      const registeredNames = new Set<string>();

      for (const account of salespersonAccounts) {
        const normalized = account.name.trim();
        if (!normalized) continue;

        registeredNames.add(normalized);
        accountByName.set(normalized.toLowerCase(), account);
      }

      for (const order of orders) {
        const name = order.sales_person?.trim();
        if (name) registeredNames.add(name);
      }

      const map = new Map<
        string,
        {
          totalOrders: number;
          totalSales: number;
          totalReceived: number;
          cashSales: number;
          creditSales: number;
          taxSales: number;
          balanceDue: number;
          customers: Set<string>;
          dates: string[];
        }
      >();

      for (const name of registeredNames) {
        map.set(name, {
          totalOrders: 0,
          totalSales: 0,
          totalReceived: 0,
          cashSales: 0,
          creditSales: 0,
          taxSales: 0,
          balanceDue: 0,
          customers: new Set<string>(),
          dates: [],
        });
      }

      for (const order of orders) {
        const name = order.sales_person?.trim();
        if (!name) continue;

        if (!map.has(name)) {
          map.set(name, {
            totalOrders: 0,
            totalSales: 0,
            totalReceived: 0,
            cashSales: 0,
            creditSales: 0,
            taxSales: 0,
            balanceDue: 0,
            customers: new Set<string>(),
            dates: [],
          });
        }

        const summary = map.get(name)!;
        const total = toNumber(order.total);
        const received = toNumber(order.paid_amount);
        const outstanding =
          order.outstanding_amount === null ||
          order.outstanding_amount === undefined
            ? Math.max(total - received, 0)
            : toNumber(order.outstanding_amount);

        summary.totalOrders += 1;
        summary.totalSales += total;
        summary.totalReceived += received;
        if (["cash", "bank"].includes(String(order.payment_mode || "credit").toLowerCase())) {
          summary.cashSales += total;
        } else {
          summary.creditSales += total;
        }
        if (order.invoice_type === "Tax Invoice") summary.taxSales += total;
        summary.balanceDue += outstanding;

        const customerName = getCustomerName(order.customer);
        if (customerName) summary.customers.add(customerName);
        if (order.order_date) summary.dates.push(order.order_date);
      }

      const formatted: SalespersonSummary[] = Array.from(map.entries())
        .map(([name, data]) => {
          data.dates.sort();

          const account = accountByName.get(name.toLowerCase());
          const balance = data.totalSales - data.totalReceived;

          const debitBalance = balance > 0 ? balance : 0;
          const creditBalance = balance < 0 ? Math.abs(balance) : 0;
          const earliestDate = data.dates[0] ?? null;
          const latestDate =
            data.dates[data.dates.length - 1] ?? null;

          return {
            id: account?.id,
            code: account?.code,
            isActive: account?.is_active ?? true,
            salesPerson: name,
            totalOrders: data.totalOrders,
            totalSales: data.totalSales,
            totalReceived: data.totalReceived,
            cashSales: data.cashSales,
            creditSales: data.creditSales,
            taxSales: data.taxSales,
            balanceDue: data.balanceDue,
            debitBalance,
            creditBalance,
            customers: Array.from(data.customers).sort(),
            earliestDate,
            latestDate,
            dateRange:
              !earliestDate
                ? "—"
                : earliestDate === latestDate
                  ? formatDate(earliestDate)
                  : `${formatDate(earliestDate)} → ${formatDate(
                      latestDate!
                    )}`,
          };
        })
        .sort((a, b) =>
          a.salesPerson.localeCompare(b.salesPerson)
        );

      setReportData(formatted);
    } catch (err: any) {
      setError(
        err?.message || "Failed to load salesperson report."
      );
      setReportData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReportData();
  }, [fetchReportData]);

  const salespersonOptions = useMemo(
    () =>
      reportData
        .map((item) => item.salesPerson)
        .sort((a, b) => a.localeCompare(b)),
    [reportData]
  );

  const filteredData = useMemo(() => {
    const query = search.trim().toLowerCase();

    return reportData.filter((row) => {
      if (
        selectedSalesPerson !== "ALL" &&
        row.salesPerson !== selectedSalesPerson
      ) {
        return false;
      }

      if (
        statusFilter === "active" &&
        row.isActive === false
      ) {
        return false;
      }

      if (
        statusFilter === "inactive" &&
        row.isActive !== false
      ) {
        return false;
      }

      if (
        balanceSideFilter === "debit" &&
        row.debitBalance <= 0
      ) {
        return false;
      }

      if (
        balanceSideFilter === "credit" &&
        row.creditBalance <= 0
      ) {
        return false;
      }

      if (!query) return true;

      return [
        row.salesPerson,
        row.code ?? "",
        row.customers.join(" "),
        row.dateRange,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    reportData,
    search,
    selectedSalesPerson,
    statusFilter,
    balanceSideFilter,
  ]);

  const totals = useMemo(
    () =>
      filteredData.reduce(
        (acc, row) => {
          acc.sales += row.totalSales;
          acc.received += row.totalReceived;
          acc.cashSales += row.cashSales;
          acc.creditSales += row.creditSales;
          acc.taxSales += row.taxSales;
          acc.debitBalance += row.debitBalance;
          acc.creditBalance += row.creditBalance;
          acc.orders += row.totalOrders;
          return acc;
        },
        {
          sales: 0,
          received: 0,
          cashSales: 0,
          creditSales: 0,
          taxSales: 0,
          debitBalance: 0,
          creditBalance: 0,
          orders: 0,
        }
      ),
    [filteredData]
  );

  const openAdd = () => {
    setEditingId(null);
    setNewSalesPersonName("");
    setIsModalOpen(true);
  };

  const openEdit = (row: SalespersonSummary) => {
    if (!row.id) {
      setError(
        "This salesperson exists on historical invoices but is not yet registered in Chart of Accounts."
      );
      return;
    }

    setEditingId(row.id);
    setNewSalesPersonName(row.salesPerson);
    setIsModalOpen(true);
  };

  const handleSaveSalesPerson = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    const name = newSalesPersonName.trim();
    if (!name) return;

    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        const { error: updateError } = await supabase
          .from("chart_of_accounts")
          .update({
            name,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId)
          .eq("account_role", "sales_person");

        if (updateError) throw updateError;
      } else {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError) throw userError;
        if (!userData.user) {
          throw new Error("Login session not found.");
        }

        /*
         * Salespersons are represented by the existing app architecture as
         * non-posting COA role records. They are not used for manual GL entry.
         */
        const { error: insertError } = await supabase
          .from("chart_of_accounts")
          .insert({
            user_id: userData.user.id,
            code: salespersonCode(),
            name,
            type: "expense",
            account_role: "sales_person",
            detail_type: null,
            parent_head: null,
            parent_id: null,
            is_group: false,
            normal_balance: "debit",
            allow_manual_entries: false,
            is_system_account: false,
            is_active: true,
            description:
              "Salesperson master record - non posting",
          });

        if (insertError) throw insertError;
      }

      setNewSalesPersonName("");
      setEditingId(null);
      setIsModalOpen(false);

      await fetchReportData();
    } catch (err: any) {
      setError(
        err?.message || "Failed to save salesperson."
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: SalespersonSummary) => {
    if (!row.id) {
      setError(
        "Historical-only salesperson cannot be deactivated until registered in Chart of Accounts."
      );
      return;
    }

    const nextActive = row.isActive === false;

    const { error: updateError } = await supabase
      .from("chart_of_accounts")
      .update({
        is_active: nextActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("account_role", "sales_person");

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await fetchReportData();
  };

  const exportToExcel = () => {
    const exportRows = filteredData.map((item) => ({
      "Sales Person": item.salesPerson,
      Code: item.code ?? "",
      Status: item.isActive === false ? "Inactive" : "Active",
      Invoices: item.totalOrders,
      Customers: item.customers.join(", "),
      "Date Range": item.dateRange,
      "Total Sales (PKR)": item.totalSales,
      "Received (PKR)": item.totalReceived,
      "Debit Balance (PKR)": item.debitBalance,
      "Credit Balance (PKR)": item.creditBalance,
      "Collection %":
        item.totalSales > 0
          ? Number(
              (
                (item.totalReceived / item.totalSales) *
                100
              ).toFixed(2)
            )
          : 0,
    }));

    const worksheet =
      XLSX.utils.json_to_sheet(exportRows);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Salesperson Report"
    );

    XLSX.writeFile(
      workbook,
      "Salesperson_Performance_Report.xlsx"
    );
  };

  const exportToPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-3">
      <section className="flex flex-col gap-3 border-b border-slate-200 pb-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Sales Analytics
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            <h1 className="text-lg font-semibold text-slate-900">
              Salesperson Performance
            </h1>
          </div>
          <p className="mt-0.5 text-[12px] text-slate-500">
            Posted sales, collections, customer coverage and outstanding balances.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <button type="button" onClick={() => setShowColumns((value) => !value)} className="btn-secondary">
              Customize Columns
            </button>
            {showColumns && (
              <div className="absolute right-0 top-10 z-50 grid w-[320px] grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
                {Object.entries({
                  customers:"Customers",dateRange:"Date Span",cashSales:"Cash Sales",creditSales:"Credit Sales",
                  taxSales:"Tax Sales",sales:"Total Sales",received:"Received",debit:"Debit",
                  credit:"Credit",collection:"Collection",actions:"Actions",
                }).map(([key,label]) => <label key={key} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={visibleColumns[key as keyof typeof visibleColumns]} onChange={() => setVisibleColumns((current) => ({...current,[key]:!current[key as keyof typeof current]}))}/>{label}</label>)}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={exportToExcel}
            className="btn-secondary"
          >
            <Download className="h-3.5 w-3.5" />
            Excel
          </button>

          <button
            type="button"
            onClick={exportToPDF}
            className="btn-secondary"
          >
            <Printer className="h-3.5 w-3.5" />
            Print / PDF
          </button>

          <button
            type="button"
            onClick={openAdd}
            className="btn-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            New Salesperson
          </button>
        </div>
      </section>

      {error && <ErrorBanner message={error} />}

      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-6">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
            Salespersons
          </div>
          <div className="mt-1.5 text-[17px] font-semibold text-slate-900">
            {filteredData.length}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
            Posted Invoices
          </div>
          <div className="mt-1.5 text-[17px] font-semibold text-slate-900">
            {totals.orders}
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-white p-3">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-blue-600">Sales / فروخت</div>
          <div className="mt-1.5 text-[16px] font-semibold text-blue-700">
            {formatCurrency(totals.sales)}
          </div>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-white p-3">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-emerald-600">
            Received
          </div>
          <div className="mt-1.5 text-[16px] font-semibold text-emerald-700">
            {formatCurrency(totals.received)}
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-white p-3">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-blue-600">
            Debit Balance
          </div>
          <div className="mt-1.5 text-[16px] font-semibold text-blue-700">
            {formatCurrency(totals.debitBalance)}
          </div>
        </div>

        <div className="rounded-lg border border-rose-200 bg-white p-3">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-rose-600">
            Credit Balance
          </div>
          <div className="mt-1.5 text-[16px] font-semibold text-rose-700">
            {formatCurrency(totals.creditBalance)}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 p-2.5 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative flex-1 xl:max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-8"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search salesperson or customer… / سیلز پرسن یا گاہک تلاش کریں…"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <select
              className="input w-[170px]"
              value={selectedSalesPerson}
              onChange={(event) =>
                setSelectedSalesPerson(
                  event.target.value
                )
              }
            >
              <option value="ALL">
                All Salespersons
              </option>
              {salespersonOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <select
              className="input w-[125px]"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as
                    | "active"
                    | "all"
                    | "inactive"
                )
              }
            >
              <option value="active">
                Active
              </option>
              <option value="all">
                All Status
              </option>
              <option value="inactive">
                Inactive
              </option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5 print:hidden">
          <span className="mr-1 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
            Balance View:
          </span>

          <button
            type="button"
            onClick={() => setBalanceSideFilter("all")}
            className={[
              "rounded-lg border px-3 py-2 text-[12px] font-bold",
              balanceSideFilter === "all"
                ? "border-slate-800 bg-slate-800 text-white"
                : "border-slate-200 bg-white text-slate-600",
            ].join(" ")}
          >
            Show All
          </button>

          <button
            type="button"
            onClick={() => setBalanceSideFilter("debit")}
            className={[
              "rounded-lg border px-3 py-2 text-[12px] font-bold",
              balanceSideFilter === "debit"
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-blue-200 bg-blue-50 text-blue-700",
            ].join(" ")}
          >
            Show Debit Balance Only
          </button>

          <button
            type="button"
            onClick={() => setBalanceSideFilter("credit")}
            className={[
              "rounded-lg border px-3 py-2 text-[12px] font-bold",
              balanceSideFilter === "credit"
                ? "border-rose-600 bg-rose-600 text-white"
                : "border-rose-200 bg-rose-50 text-rose-700",
            ].join(" ")}
          >
            Show Credit Balance Only
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-[12px]">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left">
                  Salesperson
                </th>
                <th className="px-2 py-2 text-center">
                  Invoices
                </th>
                {visibleColumns.customers && <th className="px-2 py-2 text-left">Customers / گاہک</th>}
                {visibleColumns.dateRange && <th className="px-2 py-2 text-left">
                  Date Span
                </th>}
                {visibleColumns.cashSales && <th className="px-2 py-2 text-right">Cash Sales</th>}
                {visibleColumns.creditSales && <th className="px-2 py-2 text-right">Credit Sales</th>}
                {visibleColumns.taxSales && <th className="px-2 py-2 text-right">Tax Sales</th>}
                {visibleColumns.sales && <th className="px-2 py-2 text-right">Sales / فروخت</th>}
                {visibleColumns.received && <th className="px-2 py-2 text-right">
                  Received
                </th>}
                {visibleColumns.debit && <th className="px-2 py-2 text-right">
                  Debit Balance
                </th>}
                {visibleColumns.credit && <th className="px-2 py-2 text-right">
                  Credit Balance
                </th>}
                {visibleColumns.collection && <th className="px-2 py-2 text-right">
                  Collection
                </th>}
                {visibleColumns.actions && <th className="px-3 py-2 text-right">Actions / کارروائیاں</th>}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-3 py-8 text-center text-[12px] text-slate-400"
                  >
                    Loading salesperson report…
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-3 py-8 text-center text-[12px] text-slate-400"
                  >
                    No salesperson records match the current filters.
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => {
                  const collection =
                    row.totalSales > 0
                      ? (row.totalReceived /
                          row.totalSales) *
                        100
                      : 0;

                  return (
                    <tr
                      key={`${row.id ?? "historical"}-${row.salesPerson}`}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                            <UserRound className="h-3.5 w-3.5" />
                          </div>

                          <div>
                            <div className="text-[12px] font-semibold text-slate-800">
                              {row.salesPerson}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate-400">
                              <span>
                                {row.code ??
                                  "Historical only"}
                              </span>
                              <span>·</span>
                              <span
                                className={
                                  row.isActive === false
                                    ? "text-rose-500"
                                    : "text-emerald-600"
                                }
                              >
                                {row.isActive === false
                                  ? "Inactive"
                                  : "Active"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-2 py-2.5 text-center font-semibold text-slate-700">
                        {row.totalOrders}
                      </td>

                      {visibleColumns.customers && <td
                        className="max-w-[250px] px-2 py-2.5 text-slate-600"
                        title={row.customers.join(", ")}
                      >
                        <div className="truncate">
                          {row.customers.length > 0
                            ? row.customers.join(", ")
                            : "—"}
                        </div>
                        {row.customers.length > 0 && (
                          <div className="mt-0.5 text-[12px] text-slate-400">
                            {row.customers.length} customer
                            {row.customers.length === 1
                              ? ""
                              : "s"}
                          </div>
                        )}
                      </td>}

                      {visibleColumns.dateRange && <td className="px-2 py-2.5 text-[12px] text-slate-500">
                        {row.dateRange}
                      </td>}

                      {visibleColumns.cashSales && <td className="px-2 py-2.5 text-right font-semibold text-emerald-700">{formatCurrency(row.cashSales)}</td>}
                      {visibleColumns.creditSales && <td className="px-2 py-2.5 text-right font-semibold text-amber-700">{formatCurrency(row.creditSales)}</td>}
                      {visibleColumns.taxSales && <td className="px-2 py-2.5 text-right font-semibold text-violet-700">{formatCurrency(row.taxSales)}</td>}

                      {visibleColumns.sales && <td className="px-2 py-2.5 text-right font-semibold text-slate-900">
                        {formatCurrency(row.totalSales)}
                      </td>}

                      {visibleColumns.received && <td className="px-2 py-2.5 text-right font-semibold text-emerald-700">
                        {formatCurrency(
                          row.totalReceived
                        )}
                      </td>}

                      {visibleColumns.debit && <td className="px-2 py-2.5 text-right font-semibold text-blue-700">
                        {formatCurrency(
                          row.debitBalance
                        )}
                      </td>}

                      {visibleColumns.credit && <td className="px-2 py-2.5 text-right font-semibold text-rose-700">
                        {formatCurrency(
                          row.creditBalance
                        )}
                      </td>}

                      {visibleColumns.collection && <td className="px-2 py-2.5 text-right">
                        <div className="font-semibold text-slate-700">
                          {collection.toFixed(1)}%
                        </div>
                        <div className="ml-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{
                              width: `${Math.max(
                                0,
                                Math.min(
                                  collection,
                                  100
                                )
                              )}%`,
                            }}
                          />
                        </div>
                      </td>}

                      {visibleColumns.actions && <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              openEdit(row)
                            }
                            disabled={!row.id}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Pencil className="h-3 w-3" />Edit / ترمیم</button>

                          <button
                            type="button"
                            onClick={() =>
                              toggleActive(row)
                            }
                            disabled={!row.id}
                            className={[
                              "inline-flex h-7 items-center rounded-md border px-2 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-40",
                              row.isActive === false
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-rose-200 bg-rose-50 text-rose-700",
                            ].join(" ")}
                          >
                            {row.isActive === false
                              ? "Activate"
                              : "Deactivate"}
                          </button>
                        </div>
                      </td>}
                    </tr>
                  );
                })
              )}
            </tbody>

            {!loading && filteredData.length > 0 && (
              <tfoot className="border-t-2 border-slate-300 bg-slate-100">
                <tr className="text-[12px] font-bold">
                  <td className="px-3 py-3 text-slate-900">
                    GRAND TOTAL
                    <div className="mt-0.5 text-[12px] font-medium text-slate-500">
                      Filtered: {filteredData.length} salesperson
                      {filteredData.length === 1 ? "" : "s"}
                    </div>
                  </td>

                  <td className="px-2 py-3 text-center">
                    {totals.orders}
                  </td>

                  <td className="px-2 py-3 text-slate-400">—</td>
                  <td className="px-2 py-3 text-slate-400">—</td>

                  <td className="px-2 py-3 text-right text-slate-900">
                    {formatCurrency(totals.sales)}
                  </td>

                  <td className="px-2 py-3 text-right text-emerald-700">
                    {formatCurrency(totals.received)}
                  </td>

                  <td className="px-2 py-3 text-right text-blue-700">
                    {formatCurrency(totals.debitBalance)}
                  </td>

                  <td className="px-2 py-3 text-right text-rose-700">
                    {formatCurrency(totals.creditBalance)}
                  </td>

                  <td className="px-2 py-3 text-right text-slate-700">
                    {totals.sales > 0
                      ? `${((totals.received / totals.sales) * 100).toFixed(1)}%`
                      : "0.0%"}
                  </td>

                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <Modal
        open={isModalOpen}
        title={
          editingId
            ? "Edit Salesperson"
            : "New Salesperson"
        }
        onClose={() => {
          if (saving) return;
          setIsModalOpen(false);
        }}
      >
        <form
          onSubmit={handleSaveSalesPerson}
          className="space-y-3"
        >
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
            Salesperson records are non-posting role records used by the sales invoice workflow.
          </div>

          <div>
            <label className="label">
              Salesperson Name
            </label>
            <input
              className="input"
              required
              autoFocus
              value={newSalesPersonName}
              onChange={(event) =>
                setNewSalesPersonName(
                  event.target.value
                )
              }
              placeholder="Enter salesperson name… / سیلز پرسن کا نام درج کریں…"
            />
          </div>

          <div className="flex justify-end gap-1.5 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={saving}
              className="btn-secondary"
            >Cancel / منسوخ کریں</button>

            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
            >
              {saving
                ? "Saving…"
                : editingId
                  ? "Update"
                  : "Create Salesperson"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
