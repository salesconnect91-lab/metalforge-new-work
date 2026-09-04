import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Download,
  FileSpreadsheet,
  LockKeyhole,
  Pencil,
  Printer,
  ReceiptText,
  ShieldCheck,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { OrderStatus, SalesOrder, SalesOrderLine } from "@/types";
import {
  ConfirmModal,
  ErrorBanner,
  StatusBadge,
  formatCurrency,
  formatDate,
} from "@/components/ui";
import {
  exportToCSV,
  exportToExcel,
  triggerPrint,
} from "@/lib/exportUtils";
import {
  chargesFromRecord,
  getChargeBreakdown,
} from "@/lib/chargeTypes";
import PrintLayout from "@/components/PrintLayout";
import InvoiceFinancialSummary from "./InvoiceFinancialSummary";
import { useAuth } from "@/auth/AuthContext";
import { canPerformModule } from "@/auth/permissions";

type LinkedHawalaPrintRow = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  reference_name: string | null;
  reference_no: string | null;
  reference_notes: string | null;
  total: number | string;
};

type PaymentStatus = "unpaid" | "partial" | "paid" | "overpaid";

type CompanyPrintSettings = {
  company_name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  ntn?: string | null;
  strn?: string | null;
  logo_url?: string | null;
  document_header?: string | null;
  document_header_urdu?: string | null;
  document_footer?: string | null;
  document_footer_urdu?: string | null;
  prepared_by_label?: string | null;
  checked_by_label?: string | null;
  approved_by_label?: string | null;
  page_size?: string | null;
  page_orientation?: string | null;
};

type SalesPrintVisibility = {
  show_company_name: boolean;
  show_logo: boolean;
  show_address: boolean;
  show_phone_email: boolean;
  show_tax_details: boolean;
  show_header: boolean;
  show_footer: boolean;
  show_signatures: boolean;
  show_print_datetime: boolean;
  show_page_numbers: boolean;
};

const DEFAULT_SALES_PRINT_VISIBILITY: SalesPrintVisibility = {
  show_company_name: true,
  show_logo: true,
  show_address: true,
  show_phone_email: true,
  show_tax_details: true,
  show_header: true,
  show_footer: true,
  show_signatures: true,
  show_print_datetime: false,
  show_page_numbers: true,
};

type SalesInvoiceDetailOrder = SalesOrder & {
  due_date?: string | null;
  paid_amount?: number | string | null;
  outstanding_amount?: number | string | null;
  payment_status?: PaymentStatus | null;
  invoice_type?: "Sale Invoice" | "Cash Bill" | "Tax Invoice";
  payment_mode?: "Credit" | "Cash" | "Bank" | null;
};

interface OrderChargeWorker {
  id: string;
  charge_key: string;
  charge_label: string;
  amount: number;
  quantity?: number;
  unit?: string;
  rate?: number;
  tax_percent?: number;
  service_party_id?: string | null;
  service_party_name?: string | null;
  worker_account_id: string | null;
  account_id?: string | null;
  account?: {
    id?: string;
    code?: string | null;
    name: string;
  } | null;
}

interface RawOrderCharge {
  id: string;
  charge_key: string;
  charge_label: string;
  amount: number | string | null;
  quantity?: number | string | null;
  unit?: string | null;
  rate?: number | string | null;
  tax_percent?: number | string | null;
  service_party_id?: string | null;
  service_party_name?: string | null;
  worker_account_id: string | null;
  account_id?: string | null;
}

interface AccountLookup {
  id: string;
  code?: string | null;
  name: string;
}

const toNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const paymentStatusBadge = (status?: string | null) => {
  const normalized = (status || "unpaid").toLowerCase();

  const className =
    normalized === "paid"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "partial"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : normalized === "overpaid"
          ? "border-violet-200 bg-violet-50 text-violet-700"
          : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[12px] font-semibold capitalize ${className}`}
    >
      {normalized}
    </span>
  );
};

export default function SalesInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeCompany, isPlatformOwner } = useAuth();
  const salesRole = activeCompany?.membership_role;
  const salesPermissions = activeCompany?.permissions;
  const canEditSales = canPerformModule(salesRole, "sales", "edit", salesPermissions, isPlatformOwner);
  const canDeleteSales = canPerformModule(salesRole, "sales", "delete", salesPermissions, isPlatformOwner);
  const canPostSales = canPerformModule(salesRole, "sales", "post", salesPermissions, isPlatformOwner);
  const canPrintSales = canPerformModule(salesRole, "sales", "print", salesPermissions, isPlatformOwner);

  const [order, setOrder] = useState<SalesInvoiceDetailOrder | null>(null);
  const [lines, setLines] = useState<SalesOrderLine[]>([]);
  const [workerCharges, setWorkerCharges] = useState<OrderChargeWorker[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [linkedHawalaInvoices, setLinkedHawalaInvoices] =
    useState<LinkedHawalaPrintRow[]>([]);

  const [companyPrint, setCompanyPrint] =
    useState<CompanyPrintSettings>({});
  const [salesPrintVisibility, setSalesPrintVisibility] =
    useState<SalesPrintVisibility>(
      DEFAULT_SALES_PRINT_VISIBILITY
    );
  const [financial, setFinancial] = useState<{
    previous_balance: number | string | null;
    invoice_amount: number | string | null;
    paid_amount: number | string | null;
    outstanding_amount: number | string | null;
    today_received: number | string | null;
    last_payment_amount: number | string | null;
    last_payment_date: string | null;
    last_payment_mode: string | null;
    last_payment_account_code: string | null;
    last_payment_account_name: string | null;
    balance_before_last_payment: number | string | null;
    overdue_days: number | string | null;
  } | null>(null);

  const fetchLinkedHawalaInvoices = useCallback(async () => {
    if (!id) {
      setLinkedHawalaInvoices([]);
      return;
    }

    const { data: links, error: linkError } = await supabase
      .from("sales_order_hawala_invoices")
      .select("hawala_invoice_id")
      .eq("sales_order_id", id);

    if (linkError) {
      console.error("Failed to load linked Hawala invoices:", linkError);
      setLinkedHawalaInvoices([]);
      return;
    }

    const hawalaIds = (links ?? []).map(
      (row: any) => row.hawala_invoice_id
    );

    if (hawalaIds.length === 0) {
      setLinkedHawalaInvoices([]);
      return;
    }

    const { data, error: hawalaError } = await supabase
      .from("consolidated_sales_invoices")
      .select(
        "id,invoice_no,invoice_date,reference_name,reference_no,reference_notes,total"
      )
      .in("id", hawalaIds)
      .order("invoice_date", { ascending: true })
      .order("invoice_no", { ascending: true });

    if (hawalaError) {
      console.error("Failed to load Hawala invoice details:", hawalaError);
      setLinkedHawalaInvoices([]);
      return;
    }

    setLinkedHawalaInvoices(
      (data ?? []) as LinkedHawalaPrintRow[]
    );
  }, [id]);

  const fetchPrintSettings = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const [companyResult, visibilityResult] =
      await Promise.all([
        supabase
          .from("company_settings")
          .select("*")
          .maybeSingle(),

        supabase
          .from("document_print_visibility")
          .select("*")
          .eq("document_type", "sales_invoice")
          .maybeSingle(),
      ]);

    if (companyResult.error) {
      throw companyResult.error;
    }

    if (visibilityResult.error) {
      throw visibilityResult.error;
    }

    setCompanyPrint(
      (companyResult.data || {}) as CompanyPrintSettings
    );

    setSalesPrintVisibility({
      ...DEFAULT_SALES_PRINT_VISIBILITY,
      ...(visibilityResult.data || {}),
    });
  }, []);

  const fetchOrder = useCallback(async () => {
    if (!id) return;

    const { data, error: fetchError } = await supabase
      .from("sales_orders")
      .select("*, customer:customers(*)")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setOrder((data ?? null) as SalesInvoiceDetailOrder | null);
  }, [id]);

  const fetchLines = useCallback(async () => {
    if (!id) return;

    const { data, error: fetchError } = await supabase
      .from("sales_order_lines")
      .select("*, item:items(*)")
      .eq("order_id", id)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setLines((data ?? []) as SalesOrderLine[]);
  }, [id]);

  const fetchWorkerCharges = useCallback(async () => {
    if (!id) return;

    const { data, error: chargeError } = await supabase
      .from("sales_order_charges")
      .select("*")
      .eq("order_id", id);

    if (chargeError) {
      setError(chargeError.message);
      setWorkerCharges([]);
      return;
    }

    const rawCharges = (data ?? []) as RawOrderCharge[];

    const accountIds = Array.from(
      new Set(
        rawCharges
          .map((charge) => charge.worker_account_id || charge.account_id)
          .filter((value): value is string => Boolean(value))
      )
    );

    const accountMap = new Map<string, AccountLookup>();

    if (accountIds.length > 0) {
      const { data: coaRows } = await supabase
        .from("chart_of_accounts")
        .select("id,code,name")
        .in("id", accountIds);

      for (const account of (coaRows ?? []) as AccountLookup[]) {
        accountMap.set(account.id, account);
      }

      /*
       * Legacy fallback:
       * old sales_order_charges rows may still point to the previous `accounts`
       * table. We only read it when the ID was not found in Chart of Accounts.
       * New/current rows continue to use chart_of_accounts.
       */
      const missingIds = accountIds.filter((accountId) => !accountMap.has(accountId));

      if (missingIds.length > 0) {
        const { data: legacyRows } = await supabase
          .from("accounts")
          .select("id,name")
          .in("id", missingIds);

        for (const account of (legacyRows ?? []) as AccountLookup[]) {
          accountMap.set(account.id, account);
        }
      }
    }

    setWorkerCharges(
      rawCharges.map((charge) => {
        const accountId = charge.worker_account_id || charge.account_id || "";

        return {
          id: charge.id,
          charge_key: charge.charge_key,
          charge_label: charge.charge_label,
          amount: toNumber(charge.amount),
          quantity: toNumber(charge.quantity),
          unit: charge.unit ?? undefined,
          rate: toNumber(charge.rate),
          tax_percent: toNumber(charge.tax_percent),
          service_party_id: charge.service_party_id,
          service_party_name: charge.service_party_name,
          worker_account_id: charge.worker_account_id,
          account_id: charge.account_id,
          account: accountId ? accountMap.get(accountId) ?? null : null,
        };
      })
    );
  }, [id]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      await Promise.all([
        fetchOrder(),
        fetchLines(),
        fetchWorkerCharges(),
        fetchPrintSettings(),
        fetchLinkedHawalaInvoices(),
      ]);

      setLoading(false);
    };

    void load();
  }, [
    fetchOrder,
    fetchLines,
    fetchWorkerCharges,
    fetchPrintSettings,
    fetchLinkedHawalaInvoices,
  ]);

  const isPostedOrClosed =
    order?.status === "posted" || order?.status === "closed";

  const handleStatusChange = async (status: OrderStatus) => {
    if (!order || isPostedOrClosed || posting) return;

    const allowedNextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
      draft: "confirmed",
      confirmed: "shipped",
      shipped: "posted",
    };

    if (allowedNextStatus[order.status] !== status) {
      setError(
        `Invalid status transition: ${order.status} → ${status}.`
      );
      return;
    }

    if (status === "posted") {
      await handlePost();
      return;
    }

    setError(null);

    const { error: updateError } = await supabase
      .from("sales_orders")
      .update({ status })
      .eq("id", order.id)
      .eq("status", order.status);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setOrder({ ...order, status });
  };

  const handlePost = async () => {
    if (!order || isPostedOrClosed || posting) return;

    setPosting(true);
    setError(null);
    setPostSuccess(null);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "post_sales_invoice",
        {
          p_order_id: order.id,
        }
      );

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      const result = data as {
        success?: boolean;
        error?: string | null;
        message?: string | null;
        journal_entry_no?: string | null;
        journalEntryNo?: string | null;
      } | null;

      if (!result?.success) {
        throw new Error(
          result?.error || result?.message || "Failed to post sales invoice."
        );
      }

      const journalNo =
        result.journal_entry_no || result.journalEntryNo || null;

      setPostSuccess(
        journalNo
          ? `Invoice ${order.order_no} posted successfully. Journal ${journalNo} created and stock/accounting impact completed.`
          : `Invoice ${order.order_no} posted successfully. Stock and accounting impact completed.`
      );

      await Promise.all([
        fetchOrder(),
        fetchLines(),
        fetchWorkerCharges(),
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to post sales invoice."
      );
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async () => {
    if (!order) return;

    if (isPostedOrClosed) {
      setConfirmDelete(false);
      setError(
        "Posted or closed invoices cannot be deleted. Historical accounting records are protected."
      );
      return;
    }

    const { error: deleteError } = await supabase
      .from("sales_orders")
      .delete()
      .eq("id", order.id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    navigate("/sales");
  };

  // HAWALA_SCREEN_DETAIL_V1
  const linkedHawalaTotal = useMemo(
    () =>
      linkedHawalaInvoices.reduce(
        (sum, hawala) => sum + toNumber(hawala.total),
        0
      ),
    [linkedHawalaInvoices]
  );

  const normalInvoiceTotal = Math.max(
    toNumber(order?.total) - linkedHawalaTotal,
    0
  );

  const handlePdf = async () => {
    if (!order) return;

    setError(null);

    try {
      // Reload settings so PDF always follows latest matrix.
      await fetchPrintSettings();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Authentication required.");
      }

      const [companyResult, visibilityResult] =
        await Promise.all([
          supabase
            .from("company_settings")
            .select("*")
            .maybeSingle(),

          supabase
            .from("document_print_visibility")
            .select("*")
            .eq("document_type", "sales_invoice")
            .maybeSingle(),
        ]);

      if (companyResult.error) throw companyResult.error;
      if (visibilityResult.error) throw visibilityResult.error;

      const company =
        (companyResult.data || {}) as CompanyPrintSettings;

      const visibility: SalesPrintVisibility = {
        ...DEFAULT_SALES_PRINT_VISIBILITY,
        ...(visibilityResult.data || {}),
      };

      const pdf = new jsPDF({
        orientation:
          company.page_orientation === "landscape"
            ? "landscape"
            : "portrait",
        unit: "mm",
        format:
          company.page_size === "Letter"
            ? "letter"
            : "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 14;

      let y = 14;

      // Company logo
      if (visibility.show_logo && company.logo_url) {
        try {
          const response = await fetch(company.logo_url);
          const blob = await response.blob();

          const dataUrl = await new Promise<string>(
            (resolve, reject) => {
              const reader = new FileReader();

              reader.onload = () =>
                resolve(String(reader.result));

              reader.onerror = () =>
                reject(reader.error);

              reader.readAsDataURL(blob);
            }
          );

          const imageType =
            blob.type.includes("jpeg") ||
            blob.type.includes("jpg")
              ? "JPEG"
              : "PNG";

          pdf.addImage(
            dataUrl,
            imageType,
            margin,
            y,
            27,
            18
          );
        } catch {
          // Logo failure must not block invoice PDF.
        }
      }

      const companyX =
        visibility.show_logo && company.logo_url
          ? margin + 33
          : margin;

      if (
        visibility.show_company_name &&
        company.company_name
      ) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(17);

        pdf.text(
          company.company_name,
          companyX,
          y + 5
        );
      }

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);

      let companyY = y + 10;

      if (
        visibility.show_address &&
        company.address
      ) {
        pdf.text(
          String(company.address),
          companyX,
          companyY
        );
        companyY += 4;
      }

      if (visibility.show_phone_email) {
        const contact = [
          company.phone
            ? `Phone: ${company.phone}`
            : "",
          company.email
            ? `Email: ${company.email}`
            : "",
        ]
          .filter(Boolean)
          .join(" | ");

        if (contact) {
          pdf.text(contact, companyX, companyY);
          companyY += 4;
        }
      }

      if (visibility.show_tax_details) {
        const tax = [
          company.ntn
            ? `NTN: ${company.ntn}`
            : "",
          company.strn
            ? `STRN: ${company.strn}`
            : "",
        ]
          .filter(Boolean)
          .join(" | ");

        if (tax) {
          pdf.text(tax, companyX, companyY);
        }
      }

      y = Math.max(38, companyY + 4);

      pdf.setDrawColor(100);
      pdf.line(
        margin,
        y,
        pageWidth - margin,
        y
      );

      y += 7;

      if (
        visibility.show_header &&
        company.document_header
      ) {
        pdf.setFontSize(8.5);

        const headerLines =
          pdf.splitTextToSize(
            company.document_header,
            pageWidth - margin * 2
          );

        pdf.text(
          headerLines,
          pageWidth / 2,
          y,
          { align: "center" }
        );

        y += headerLines.length * 4 + 3;
      }

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);

      pdf.text(
        order.invoice_type === "Cash Bill"
          ? "CASH BILL"
          : order.invoice_type === "Tax Invoice"
            ? "TAX INVOICE"
            : "SALES INVOICE",
        pageWidth / 2,
        y,
        { align: "center" }
      );

      y += 6;

      pdf.setFontSize(10);

      pdf.text(
        order.order_no,
        pageWidth / 2,
        y,
        { align: "center" }
      );

      y += 8;

      autoTable(pdf, {
        startY: y,
        theme: "grid",

        styles: {
          fontSize: 8.5,
          cellPadding: 2.5,
        },

        head: [
          [
            "Customer",
            "Invoice Date",
            "Due Date",
            "Sales Person",
            "Status",
          ],
        ],

        body: [
          [
            order.customer?.name || "—",
            formatDate(order.order_date),
            order.due_date
              ? formatDate(order.due_date)
              : "—",
            order.sales_person || "—",
            String(order.status).toUpperCase(),
          ],
        ],
      });

      y =
        (pdf as any).lastAutoTable?.finalY
          ? (pdf as any).lastAutoTable.finalY + 7
          : y + 22;

      autoTable(pdf, {
        startY: y,
        theme: "grid",

        styles: {
          fontSize: 8.5,
          cellPadding: 2.5,
        },

        head: [[
          "#", "Item", "Grade", "Size", "Qty", "Rate",
          ...(order.invoice_type === "Tax Invoice" ? ["VAT", "VAT Amount"] : []),
          "Amount",
        ]],

        body:
          lines.length > 0
            ? lines.map((line, index) => [
                String(index + 1),
                line.item?.name || "—",
                line.grade || "—",
                line.size || "—",
                String(line.qty),
                formatCurrency(
                  toNumber(line.unit_price)
                ),
                ...(order.invoice_type === "Tax Invoice"
                  ? [
                      `${toNumber(line.tax_percent)}%`,
                      formatCurrency(
                        (toNumber(line.line_total) * toNumber(line.tax_percent)) / 100
                      ),
                    ]
                  : []),
                formatCurrency(
                  toNumber(line.line_total)
                ),
              ])
            : [
                [
                  "",
                  "No invoice items",
                  "",
                  "",
                  "",
                  "",
                  "",
                ],
              ],
      });

      y =
        (pdf as any).lastAutoTable?.finalY
          ? (pdf as any).lastAutoTable.finalY + 7
          : y + 20;

      if (chargeBreakdown.length > 0) {
        autoTable(pdf, {
          startY: y,
          theme: "grid",

          styles: {
            fontSize: 8.5,
            cellPadding: 2.5,
          },

          head: [["Charge", "Amount"]],

          body: chargeBreakdown.map((charge) => [
            charge.label,
            formatCurrency(charge.amount),
          ]),
        });

        y =
          (pdf as any).lastAutoTable?.finalY
            ? (pdf as any).lastAutoTable.finalY + 7
            : y + 15;
      }

      if (linkedHawalaInvoices.length > 0) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.text(
          "Unbilled Dispatch Documents",
          margin,
          y
        );

        y += 4;

        autoTable(pdf, {
          startY: y,
          theme: "grid",

          styles: {
            fontSize: 7.8,
            cellPadding: 2,
          },

          head: [
            [
              "Hawala No.",
              "Date",
              "Reference Name",
              "Reference No.",
              "Amount",
            ],
          ],

          body: linkedHawalaInvoices.map((hawala) => [
            hawala.invoice_no,
            formatDate(hawala.invoice_date),
            hawala.reference_name || "—",
            hawala.reference_no || "—",
            formatCurrency(toNumber(hawala.total)),
          ]),

          foot: [
            [
              "",
              "",
              "",
              "Total Hawala Amount",
              formatCurrency(
                linkedHawalaInvoices.reduce(
                  (sum, hawala) =>
                    sum + toNumber(hawala.total),
                  0
                )
              ),
            ],
          ],
        });

        y =
          (pdf as any).lastAutoTable?.finalY
            ? (pdf as any).lastAutoTable.finalY + 7
            : y + 20;
      }

      autoTable(pdf, {
        startY: y,
        theme: "plain",
        margin: {
          left: Math.max(
            margin,
            pageWidth - 85
          ),
        },

        styles: {
          fontSize: 9,
          cellPadding: 2,
        },

        columnStyles: {
          0: { fontStyle: "bold" },
          1: {
            halign: "right",
            fontStyle: "bold",
          },
        },

        body: [
          [
            "Items Total",
            formatCurrency(itemsTotal),
          ],
          [
            "Charges Total",
            formatCurrency(chargesTotal),
          ],
          ...(order.invoice_type === "Tax Invoice"
            ? [["Total VAT", formatCurrency(taxAmount)]]
            : []),
          [
            "Grand Total",
            formatCurrency(toNumber(order.total)),
          ],
          [
            "Received",
            formatCurrency(paidAmount),
          ],
          [
            "Balance Due",
            formatCurrency(outstandingAmount),
          ],
        ],
      });

      y =
        (pdf as any).lastAutoTable?.finalY
          ? (pdf as any).lastAutoTable.finalY + 8
          : y + 25;

      if (financial) {
        const printPreviousBalance =
          toNumber(financial.previous_balance);

        const printInvoiceAmount =
          toNumber(order.total);

        const printTotalReceived =
          toNumber(financial.paid_amount);

        const printTodayReceived =
          toNumber(financial.today_received);

        const printLastPayment =
          toNumber(financial.last_payment_amount);

        const printCurrentOutstanding =
          toNumber(financial.outstanding_amount);

        const printBalanceBeforeLast =
          Math.max(
            0,
            printCurrentOutstanding + printLastPayment
          );

        autoTable(pdf, {
          startY: y,
          theme: "grid",

          styles: {
            fontSize: 7.4,
            cellPadding: 2,
            valign: "middle",
          },

          head: [
            [
              "Previous Balance",
              "Invoice",
              "Total Received",
              "Today's Received",
            ],
          ],

          body: [
            [
              formatCurrency(printPreviousBalance),
              formatCurrency(printInvoiceAmount),
              formatCurrency(printTotalReceived),
              formatCurrency(printTodayReceived),
            ],
          ],
        });

        y =
          (pdf as any).lastAutoTable?.finalY
            ? (pdf as any).lastAutoTable.finalY + 3
            : y + 15;

        autoTable(pdf, {
          startY: y,
          theme: "grid",

          styles: {
            fontSize: 7.4,
            cellPadding: 2,
            valign: "middle",
          },

          head: [
            [
              "Balance Before Last",
              "Last Payment",
              "Last Payment Date / Mode",
              "Current Outstanding",
            ],
          ],

          body: [
            [
              formatCurrency(printBalanceBeforeLast),
              formatCurrency(printLastPayment),
              [
                financial.last_payment_date
                  ? formatDate(financial.last_payment_date)
                  : "—",
                financial.last_payment_mode || "",
              ]
                .filter(Boolean)
                .join(" / "),
              formatCurrency(printCurrentOutstanding),
            ],
          ],
        });

        y =
          (pdf as any).lastAutoTable?.finalY
            ? (pdf as any).lastAutoTable.finalY + 8
            : y + 18;
      }

      if (visibility.show_signatures) {
        let signatureY = Math.max(y + 18, pageHeight - 35);

        if (signatureY > pageHeight - 22) {
          pdf.addPage();
          signatureY = 35;
        }

        const labels = [
          company.prepared_by_label ||
            "Prepared By",
          company.checked_by_label ||
            "Checked By",
          company.approved_by_label ||
            "Approved By",
        ];

        const usable =
          pageWidth - margin * 2;

        const width = usable / 3;

        labels.forEach((label, index) => {
          const x =
            margin + width * index;

          pdf.line(
            x + 4,
            signatureY,
            x + width - 4,
            signatureY
          );

          pdf.setFontSize(7.5);

          pdf.text(
            label,
            x + width / 2,
            signatureY + 5,
            { align: "center" }
          );
        });
      }

      const pages = pdf.getNumberOfPages();

      for (
        let page = 1;
        page <= pages;
        page += 1
      ) {
        pdf.setPage(page);

        if (
          visibility.show_footer &&
          company.document_footer
        ) {
          pdf.setFontSize(7.5);

          pdf.text(
            company.document_footer,
            pageWidth / 2,
            pageHeight - 10,
            {
              align: "center",
              maxWidth:
                pageWidth - margin * 2,
            }
          );
        }

        if (visibility.show_print_datetime) {
          pdf.setFontSize(6.5);

          pdf.text(
            `Generated: ${new Date().toLocaleString(
              "en-PK"
            )}`,
            margin,
            pageHeight - 5
          );
        }

        if (visibility.show_page_numbers) {
          pdf.setFontSize(6.5);

          pdf.text(
            `Page ${page} of ${pages}`,
            pageWidth - margin,
            pageHeight - 5,
            { align: "right" }
          );
        }
      }

      pdf.save(
        `${order.order_no}-Sales-Invoice.pdf`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to generate Sales Invoice PDF."
      );
    }
  };

  const handlePrint = () => {
    setShowPrint(true);

    setTimeout(() => {
      triggerPrint();
      setShowPrint(false);
    }, 200);
  };

  const handleExportCSV = () => {
    if (!order) return;

    exportToCSV(
      `sales-invoice-${order.order_no}.csv`,
      [
        { key: "name", label: "Item / آئٹم" },
        { key: "grade", label: "Grade / گریڈ" },
        { key: "size", label: "Size / سائز" },
        { key: "qty", label: "Qty" },
        { key: "unit_price", label: "Rate / ریٹ" },
        { key: "line_total", label: "Amount / رقم" },
      ],
      lines.map((line) => ({
        name: line.item?.name ?? "—",
        grade: line.grade ?? "",
        size: line.size ?? "",
        qty: line.qty,
        unit_price: line.unit_price,
        line_total: line.line_total,
      }))
    );
  };

  const handleExportExcel = () => {
    if (!order) return;

    exportToExcel(
      `sales-invoice-${order.order_no}.xls`,
      [
        { key: "name", label: "Item / آئٹم" },
        { key: "grade", label: "Grade / گریڈ" },
        { key: "size", label: "Size / سائز" },
        { key: "qty", label: "Qty" },
        { key: "unit_price", label: "Rate / ریٹ" },
        { key: "line_total", label: "Amount / رقم" },
      ],
      lines.map((line) => ({
        name: line.item?.name ?? "—",
        grade: line.grade ?? "",
        size: line.size ?? "",
        qty: line.qty,
        unit_price: line.unit_price,
        line_total: line.line_total,
      }))
    );
  };

  const charges = useMemo(
    () =>
      order
        ? chargesFromRecord(order as unknown as Record<string, unknown>)
        : chargesFromRecord({}),
    [order]
  );

  const chargeBreakdown = useMemo(
    () => getChargeBreakdown(charges, "sales"),
    [charges]
  );

  const chargesTotal = useMemo(
    () => chargeBreakdown.reduce((sum, charge) => sum + charge.amount, 0),
    [chargeBreakdown]
  );

  const itemsTotal = useMemo(
    () => lines.reduce((sum, line) => sum + toNumber(line.line_total), 0),
    [lines]
  );

  const isTaxInvoice = order?.invoice_type === "Tax Invoice";
  const itemTaxAmount = isTaxInvoice
    ? lines.reduce(
        (sum, line) =>
          sum +
          (toNumber(line.line_total) * toNumber(line.tax_percent)) / 100,
        0
      )
    : 0;
  const chargeTaxAmount = isTaxInvoice
    ? workerCharges.reduce(
        (sum, charge) =>
          sum +
          (toNumber(charge.amount) * toNumber(charge.tax_percent)) / 100,
        0
      )
    : 0;
  const taxAmount = itemTaxAmount + chargeTaxAmount;

  const paidAmount = toNumber(order?.paid_amount);
  const outstandingAmount = toNumber(order?.outstanding_amount);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-[12px] text-slate-400">
        Loading invoice…
      </div>
    );
  }

  if (!order) {
    return <ErrorBanner message="Invoice not found. / انوائس نہیں ملی۔" />;
  }

  return (
    <div className="space-y-3">
      <section className="flex flex-col gap-3 border-b border-slate-200 pb-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <Link
            to="/sales"
            className="mb-1 inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-blue-700"
          >
            <ArrowLeft className="h-3 w-3" />
            Sales Invoices
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <ReceiptText className="h-4 w-4 text-blue-600" />
            <h1 className="text-lg font-semibold text-slate-900">
              {order.order_no}
            </h1>
            <StatusBadge status={order.status} />
            {paymentStatusBadge(order.payment_status)}
          </div>

          <p className="mt-0.5 text-[12px] text-slate-500">
            {order.customer?.name
              ? `Customer · ${order.customer.name}`
              : "No customer linked"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {order.status === "draft" && (
            <button
              type="button"
              disabled={posting}
              onClick={() => void handleStatusChange("confirmed")}
              className="btn-primary"
              title="Confirm invoice / انوائس کی تصدیق کریں"
            >
              Confirm / تصدیق کریں
            </button>
          )}

          {order.status === "confirmed" && (
            <button
              type="button"
              disabled={posting}
              onClick={() => void handleStatusChange("shipped")}
              className="btn-primary"
              title="Mark invoice as shipped / روانہ شدہ کریں"
            >
              Ship / روانہ کریں
            </button>
          )}

          {order.status === "shipped" && (
            <button
              type="button"
              disabled={posting}
              onClick={() => void handleStatusChange("posted")}
              className="btn-primary"
              title="Post stock and accounting / اسٹاک اور اکاؤنٹنگ پوسٹ کریں"
            >
              {posting
                ? "Posting…"
                : "Post Invoice / پوسٹ کریں"}
            </button>
          )}

          {order.status === "posted" && (
            <span className="inline-flex h-8 items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold text-emerald-700">
              Posted / پوسٹ شدہ
            </span>
          )}

          {order.status === "closed" && (
            <span className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-slate-100 px-3 text-[12px] font-semibold text-slate-600">
              Closed / بند
            </span>
          )}

          {!isPostedOrClosed && canEditSales && (
            <button
              type="button"
              onClick={() => navigate(`/sales/${order.id}/edit`)}
              className="btn-secondary"
            >
              <Pencil className="h-3.5 w-3.5" />Edit / ترمیم</button>
          )}

          {canPrintSales && <button
            type="button"
            onClick={handleExportCSV}
            className="btn-secondary"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>}

          {canPrintSales && <button
            type="button"
            onClick={handleExportExcel}
            className="btn-secondary"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </button>}

          {canPrintSales && <button
            type="button"
            onClick={handlePrint}
            className="btn-secondary"
          >
            <Printer className="h-3.5 w-3.5" />
            Print / پرنٹ
          </button>}

          {canPrintSales && <button
            type="button"
            onClick={() => void handlePdf()}
            className="btn-secondary"
            title="Download Sales Invoice PDF"
          >
            <Download className="h-3.5 w-3.5" />
            PDF / پی ڈی ایف
          </button>}

          {!isPostedOrClosed && canDeleteSales && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="btn-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />Delete / حذف کریں</button>
          )}
        </div>
      </section>

      {postSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">
          {postSuccess}
        </div>
      )}

      {posting && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
          Posting invoice — creating accounting entries and applying stock impact…
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {isPostedOrClosed && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          <LockKeyhole className="h-3.5 w-3.5 text-slate-500" />
          Posted history is locked. Direct edit, delete and status rollback are disabled.
        </div>
      )}

      <InvoiceFinancialSummary invoiceId={order.id} customerId={order.customer_id} onFinancialChange={setFinancial} />

      {order.status === "draft" && canPostSales && (
        <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-700 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Draft invoice has not yet completed accounting and stock posting.
          </span>

          <button
            type="button"
            onClick={handlePost}
            disabled={posting}
            className="btn-primary"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {posting ? "Posting…" : "Approve & Post / منظور و پوسٹ"}
          </button>
        </div>
      )}

      <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-6">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
            <CalendarDays className="h-3 w-3" />
            Invoice Date / بل تاریخ
          </div>
          <div className="mt-1.5 text-[12px] font-semibold text-slate-800">
            {formatDate(order.order_date)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
            <CalendarDays className="h-3 w-3" />
            Due Date / آخری تاریخ
          </div>
          <div className="mt-1.5 text-[12px] font-semibold text-slate-800">
            {order.due_date ? formatDate(order.due_date) : "—"}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
            <UserRound className="h-3 w-3" />
            Sales Person / سیلز مین
          </div>
          <div className="mt-1.5 truncate text-[12px] font-semibold text-slate-800">
            {order.sales_person ?? "—"}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
            Invoice Total / کل بل
          </div>
          <div className="mt-1.5 text-[15px] font-semibold text-slate-900">
            {formatCurrency(toNumber(order.total))}
          </div>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-white p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-emerald-600">
            <Banknote className="h-3 w-3" />
            Received / وصول شدہ
          </div>
          <div className="mt-1.5 text-[15px] font-semibold text-emerald-700">
            {formatCurrency(paidAmount)}
          </div>
        </div>

        <div className="rounded-lg border border-rose-200 bg-white p-3">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-rose-600">
            <WalletCards className="h-3 w-3" />
            Balance Due / بقایا
          </div>
          <div className="mt-1.5 text-[15px] font-semibold text-rose-700">
            {formatCurrency(outstandingAmount)}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
              <div>
                <div className="text-[12px] font-semibold text-slate-800">
                  Invoice Lines / بل کی تفصیل
                </div>
                <div className="mt-0.5 text-[12px] text-slate-400">
                  {lines.length} line{lines.length === 1 ? "" : "s"}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[12px] uppercase tracking-wide text-slate-400">Items Total / آئٹمز کل</div>
                <div className="text-[12px] font-semibold text-slate-800">
                  {formatCurrency(itemsTotal)}
                </div>
              </div>
            </div>

            {lines.length === 0 ? (
              <div className="px-3 py-8 text-center text-[12px] text-slate-400">
                No items on this invoice.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[12px]">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 text-left">Item / آئٹم</th>
                      <th className="px-2 py-2 text-left">Grade / گریڈ</th>
                      <th className="px-2 py-2 text-left">Size / سائز</th>
                      <th className="px-2 py-2 text-right">Qty / Weight / مقدار یا وزن</th>
                      <th className="px-2 py-2 text-right">Rate / ریٹ</th>
                      <th className="px-3 py-2 text-right">Amount / رقم</th>
                    </tr>
                  </thead>

                  <tbody>
                    {lines.map((line) => (
                      <tr
                        key={line.id}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="px-3 py-2.5 font-semibold text-slate-800">
                          {line.item?.name ?? "—"}
                        </td>
                        <td className="px-2 py-2.5 text-slate-600">
                          {line.grade ?? "—"}
                        </td>
                        <td className="px-2 py-2.5 text-slate-600">
                          {line.size ?? "—"}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">
                          {line.qty}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">
                          {formatCurrency(line.unit_price)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                          {formatCurrency(line.line_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3 py-2.5">
              <div className="text-[12px] font-semibold text-slate-800">
                Charge Account Allocations / چارج کھاتے
              </div>
              <div className="mt-0.5 text-[12px] text-slate-400">
                Worker / charge posting accounts linked to this invoice
              </div>
            </div>

            {workerCharges.length === 0 ? (
              <div className="px-3 py-5 text-[12px] text-slate-400">
                No charge account allocations are linked to this invoice.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {workerCharges.map((charge) => (
                  <div
                    key={charge.id}
                    className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-slate-700">
                        {charge.charge_label}
                      </div>
                      <div className="mt-0.5 truncate text-[12px] text-slate-400">
                        {charge.service_party_name ? `Party / پارٹی: ${charge.service_party_name} · ` : ""}
                        {charge.account
                          ? `${charge.account.code ? `${charge.account.code} · ` : ""}${charge.account.name}`
                          : "Unassigned posting account"}
                      </div>
                      {charge.rate && charge.rate > 0 && (
                        <div className="mt-0.5 text-[12px] text-slate-500">
                          {charge.quantity || 1} {charge.unit || "unit"} × {formatCurrency(charge.rate)} · Tax {charge.tax_percent || 0}%
                        </div>
                      )}
                    </div>

                    <div className="text-right text-[12px] font-semibold text-slate-900">
                      {formatCurrency(charge.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-[72px] xl:self-start">
          {linkedHawalaInvoices.length > 0 && (
            <section className="overflow-hidden rounded-lg border border-blue-200 bg-white">
              <div className="border-b border-blue-100 bg-blue-50 px-3 py-2.5">
                <div className="text-[12px] font-semibold text-blue-900">
                  Unbilled Dispatch Details / حوالہ تفصیل
                </div>
                <div className="mt-0.5 text-[12px] text-blue-600">
                  Unbilled dispatch documents included in this Sales Invoice / اس بل میں شامل حوالہ دستاویزات
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {linkedHawalaInvoices.map((hawala, index) => (
                  <div key={hawala.id} className="p-3">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                          Dispatch No. / حوالہ نمبر
                        </div>
                        <div className="mt-0.5 text-[12px] font-semibold text-slate-900">
                          {hawala.invoice_no}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                          Amount / رقم
                        </div>
                        <div className="mt-0.5 text-[12px] font-bold text-blue-700">
                          {formatCurrency(toNumber(hawala.total))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
                      <div>
                        <div className="text-slate-400">Date / تاریخ</div>
                        <div className="font-medium text-slate-700">
                          {formatDate(hawala.invoice_date)}
                        </div>
                      </div>

                      <div>
                        <div className="text-slate-400">
                          Reference Name / حوالہ نام
                        </div>
                        <div className="font-medium text-slate-700">
                          {hawala.reference_name || "—"}
                        </div>
                      </div>

                      <div>
                        <div className="text-slate-400">
                          Reference No. / ریفرنس نمبر
                        </div>
                        <div className="font-medium text-slate-700">
                          {hawala.reference_no || "—"}
                        </div>
                      </div>

                      <div>
                        <div className="text-slate-400">
                          Document / دستاویز
                        </div>
                        <div className="font-medium text-slate-700">
                          Hawala {index + 1}
                        </div>
                      </div>
                    </div>

                    {hawala.reference_notes && (
                      <div className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-[12px] text-slate-600">
                        <span className="font-semibold">
                          Remarks / تفصیل:
                        </span>{" "}
                        {hawala.reference_notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-blue-100 bg-blue-50 px-3 py-2.5">
                <span className="text-[12px] font-semibold text-blue-900">
                  Unbilled Dispatch Total / کل حوالہ رقم
                </span>
                <span className="text-[13px] font-bold text-blue-900">
                  {formatCurrency(linkedHawalaTotal)}
                </span>
              </div>
            </section>
          )}

          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3 py-2.5">
              <div className="text-[12px] font-semibold text-slate-800">
                Invoice Total / کل بل
              </div>
            </div>

            <div className="space-y-2.5 p-3 text-[12px]">
              <div className="flex items-center justify-between text-slate-500">
                <span>Items Total / آئٹمز کل</span>
                <span className="font-medium text-slate-800">
                  {formatCurrency(itemsTotal)}
                </span>
              </div>

              {chargeBreakdown.map((charge) => (
                <div
                  key={charge.label}
                  className="flex items-center justify-between gap-3 text-slate-500"
                >
                  <span className="truncate">{charge.label}</span>
                  <span className="whitespace-nowrap font-medium text-slate-800">
                    {formatCurrency(charge.amount)}
                  </span>
                </div>
              ))}

              <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-slate-500">
                <span>Charges Total / چارجز کل</span>
                <span className="font-medium text-slate-800">
                  {formatCurrency(chargesTotal)}
                </span>
              </div>

              {isTaxInvoice && (
                <div className="flex items-center justify-between text-slate-500">
                  <span>Total VAT / کل ٹیکس</span>
                  <span className="font-semibold text-slate-800">
                    {formatCurrency(taxAmount)}
                  </span>
                </div>
              )}

              {linkedHawalaInvoices.length > 0 && (
                <>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-slate-500">
                    <span>Normal Invoice Total / اصل انوائس رقم</span>
                    <span className="font-semibold text-slate-800">
                      {formatCurrency(normalInvoiceTotal)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-blue-700">
                    <span>Unbilled Dispatch Total / کل حوالہ رقم</span>
                    <span className="font-semibold">
                      {formatCurrency(linkedHawalaTotal)}
                    </span>
                  </div>
                </>
              )}

              <div className="border-t border-slate-200 pt-2.5">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                  Grand Total / کل بل
                </div>
                <div className="mt-1 text-[20px] font-semibold tracking-tight text-slate-900">
                  {formatCurrency(toNumber(order.total))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              Collection Position / وصولی پوزیشن
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-slate-500">Payment Status / ادائیگی حالت</span>
                {paymentStatusBadge(order.payment_status)}
              </div>

              <div className="flex items-center justify-between text-[12px]">
                <span className="text-slate-500">Received / وصول شدہ</span>
                <span className="font-semibold text-emerald-700">
                  {formatCurrency(paidAmount)}
                </span>
              </div>

              <div className="flex items-center justify-between text-[12px]">
                <span className="text-slate-500">Balance Due / بقایا</span>
                <span className="font-semibold text-rose-700">
                  {formatCurrency(outstandingAmount)}
                </span>
              </div>
            </div>
          </section>

          {!isPostedOrClosed && canPostSales && (
            <section className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-blue-600">
                Posting Action / پوسٹ کرنے کا عمل
              </div>
              <p className="mt-1 text-[12px] leading-4 text-blue-700">
                Posting should create the accounting/stock impact and lock the invoice history.
              </p>

              <button
                type="button"
                onClick={handlePost}
                disabled={posting}
                className="btn-primary mt-3 w-full"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {posting ? "Posting…" : "Approve & Post / منظور و پوسٹ"}
              </button>
            </section>
          )}
        </aside>
      </section>

      <ConfirmModal
        open={confirmDelete}
        title="Delete Invoice / انوائس حذف کریں"
        message="Delete this draft sales invoice permanently? / کیا یہ ڈرافٹ فروخت انوائس مستقل حذف کرنی ہے؟"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {showPrint && (
        <PrintLayout
          voucherTitle={
            order.invoice_type === "Cash Bill"
              ? "Cash Bill"
              : order.invoice_type === "Tax Invoice"
                ? "Tax Invoice"
                : "Sales Invoice"
          }
          voucherNo={order.order_no}
          voucherDate={order.order_date}
          company={{
            name: companyPrint.company_name || "Steel Mill ERP",
            address: companyPrint.address || undefined,
            phone: companyPrint.phone || undefined,
            email: companyPrint.email || undefined,
            taxId: [
              companyPrint.ntn
                ? `NTN: ${companyPrint.ntn}`
                : "",
              companyPrint.strn
                ? `STRN: ${companyPrint.strn}`
                : "",
            ]
              .filter(Boolean)
              .join(" | ") || undefined,
            logoUrl: companyPrint.logo_url || undefined,
          }}
          visibility={{
            showCompanyName:
              salesPrintVisibility.show_company_name,
            showLogo:
              salesPrintVisibility.show_logo,
            showAddress:
              salesPrintVisibility.show_address,
            showPhoneEmail:
              salesPrintVisibility.show_phone_email,
            showTaxDetails:
              salesPrintVisibility.show_tax_details,
            showHeader:
              salesPrintVisibility.show_header,
            showFooter:
              salesPrintVisibility.show_footer,
            showSignatures:
              salesPrintVisibility.show_signatures,
            showPrintDatetime:
              salesPrintVisibility.show_print_datetime,
            showPageNumbers:
              salesPrintVisibility.show_page_numbers,
          }}
          documentHeader={
            companyPrint.document_header
          }
          documentHeaderUrdu={
            companyPrint.document_header_urdu
          }
          documentFooter={
            companyPrint.document_footer
          }
          documentFooterUrdu={
            companyPrint.document_footer_urdu
          }
          signatureLabels={[
            companyPrint.prepared_by_label ||
              "Prepared By / تیار کردہ",
            companyPrint.checked_by_label ||
              "Checked By / جانچ کردہ",
            companyPrint.approved_by_label ||
              "Approved By / منظور کردہ",
          ]}
          party={{
            name: order.customer?.name ?? "—",
            address: order.customer?.address,
            phone: order.customer?.phone,
            email: order.customer?.email,
          }}
          items={lines.map((line) => ({
            name: line.item?.name ?? "—",
            grade: line.grade,
            size: line.size,
            qty: line.qty,
            unitPrice: line.unit_price,
            lineTotal: line.line_total,
            taxPercent: isTaxInvoice ? toNumber(line.tax_percent) : 0,
            taxAmount: isTaxInvoice
              ? (toNumber(line.line_total) * toNumber(line.tax_percent)) / 100
              : 0,
          }))}
          chargeBreakdown={chargeBreakdown}
          itemsTotal={itemsTotal}
          chargesTotal={chargesTotal}
          taxAmount={taxAmount}
          showTaxSummary={isTaxInvoice}
          grandTotal={order.total}
          hawalaDocuments={linkedHawalaInvoices.map((hawala) => ({
            id: hawala.id,
            invoiceNo: hawala.invoice_no,
            invoiceDate: hawala.invoice_date,
            referenceName: hawala.reference_name,
            referenceNo: hawala.reference_no,
            referenceNotes: hawala.reference_notes,
            amount: toNumber(hawala.total),
          }))}
          normalInvoiceTotal={normalInvoiceTotal}
          paymentSummary={
            financial
              ? {
                  previousBalance: toNumber(financial.previous_balance),
                  totalReceived: toNumber(financial.paid_amount),
                  todayReceived: toNumber(financial.today_received),
                  lastPaymentAmount: toNumber(financial.last_payment_amount),
                  lastPaymentDate: financial.last_payment_date,
                  lastPaymentMode: financial.last_payment_mode,
                  currentOutstanding: toNumber(financial.outstanding_amount),
                }
              : undefined
          }
          extraFields={[
            {
              label: "Settlement / ادائیگی",
              value: "Receipts recorded separately / وصولی الگ درج ہوتی ہے",
            },
            ...(order.sales_person
              ? [
                  {
                    label: "Sales Person / سیلز مین",
                    value: order.sales_person,
                  },
                ]
              : []),

          ]}
        />
      )}
    </div>
  );
}
