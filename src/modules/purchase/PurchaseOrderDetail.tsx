import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PurchaseOrder, PurchaseOrderLine, Item } from "@/types";
import { PageHeader, Modal, ErrorBanner, StatusBadge, formatCurrency, formatDate, ConfirmModal } from "@/components/ui";
import { exportToCSV, exportToExcel, triggerPrint } from "@/lib/exportUtils";
import { chargesFromRecord, getChargeBreakdown } from "@/lib/chargeTypes";
import PrintLayout from "@/components/PrintLayout";

interface Godown {
  id: string;
  name: string;
  warehouse_id?: string | null;
}

interface CompanyPrintSettings {
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
}

interface PurchasePrintVisibility {
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
}

const DEFAULT_PURCHASE_VISIBILITY: PurchasePrintVisibility = {
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

export default function PurchaseOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteLineId, setDeleteLineId] = useState<string | null>(null);
  const [newLine, setNewLine] = useState({
    item_id: "",
    godown_id: "",
    qty: "1",
    unit_cost: "0",
    tax_percent: "18",
  });
  const [posting, setPosting] = useState(false);
  const [showPostConfirm, setShowPostConfirm] = useState(false);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);
  const [showPrint, setShowPrint] = useState(false);

  const [companyPrint, setCompanyPrint] =
    useState<CompanyPrintSettings>({});

  const [purchasePrintVisibility, setPurchasePrintVisibility] =
    useState<PurchasePrintVisibility>(
      DEFAULT_PURCHASE_VISIBILITY
    );

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);
  const [paymentAccounts, setPaymentAccounts] = useState<
    { id: string; code: string; name: string }[]
  >([]);
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [paymentMethod, setPaymentMethod] = useState("Bank");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

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
          .eq("document_type", "purchase")
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

    setPurchasePrintVisibility({
      ...DEFAULT_PURCHASE_VISIBILITY,
      ...(visibilityResult.data || {}),
    });
  }, []);

  const fetchOrder = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from("purchase_orders").select("*, supplier:suppliers(*)").eq("id", id).maybeSingle();
    if (error) { setError(error.message); return; }
    setOrder(data);
    if (data) {
      setNewLine((current) => ({
        ...current,
        tax_percent: String(data.tax_percent ?? 18),
      }));
    }
  }, [id]);

  const fetchLines = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("purchase_order_lines")
      .select("*, item:items(*), godown:godowns(id,name,warehouse_id)")
      .eq("order_id", id)
      .order("created_at", { ascending: false });
    if (error) { setError(error.message); return; }
    setLines(data ?? []);
  }, [id]);

  const fetchItems = useCallback(async () => {
    const { data } = await supabase.from("items").select("*").order("name");
    setItems(data ?? []);
  }, []);

  const fetchGodowns = useCallback(async () => {
    const { data, error } = await supabase
      .from("godowns")
      .select("id,name,warehouse_id")
      .order("name");

    if (error) {
      setError(`Unable to load godowns: ${error.message}`);
      return;
    }

    const loadedGodowns = (data ?? []) as Godown[];
    setGodowns(loadedGodowns);

    if (loadedGodowns.length > 0) {
      setNewLine((current) => ({
        ...current,
        godown_id: current.godown_id || loadedGodowns[0].id,
      }));
    }
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([
        fetchOrder(),
        fetchLines(),
        fetchItems(),
        fetchGodowns(),
        fetchPrintSettings(),
      ]);
      setLoading(false);
    })();
  }, [
    fetchOrder,
    fetchLines,
    fetchItems,
    fetchGodowns,
    fetchPrintSettings,
  ]);

  const recalcTotal = async (updatedLines: PurchaseOrderLine[]) => {
    if (!order) return;
    const itemsSubtotal = updatedLines.reduce((sum, line) => sum + Number(line.line_total ?? 0), 0);
    const itemVat = order.invoice_type === "Tax Invoice"
      ? updatedLines.reduce(
          (sum, line) => sum + (Number(line.line_total ?? 0) * Number(line.tax_percent ?? 0)) / 100,
          0
        )
      : 0;
    const orderCharges = getChargeBreakdown(
      chargesFromRecord(order as unknown as Record<string, unknown>),
      "purchase"
    ).reduce((sum, charge) => sum + charge.amount, 0);
    const chargeVat = order.invoice_type === "Tax Invoice"
      ? (orderCharges * Number(order.tax_percent ?? 0)) / 100
      : 0;
    const total = itemsSubtotal + itemVat + orderCharges + chargeVat;
    await supabase.from("purchase_orders").update({ total }).eq("id", order.id);
    setOrder({ ...order, total });
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !newLine.item_id || !newLine.godown_id) {
      setError("Please select an item and destination godown.");
      return;
    }
    const qty = parseFloat(newLine.qty) || 0;
    const unitCost = parseFloat(newLine.unit_cost) || 0;
    const lineTotal = qty * unitCost;
    const taxPercent = order?.invoice_type === "Tax Invoice"
      ? parseFloat(newLine.tax_percent) || 0
      : 0;
    const { data, error } = await supabase
      .from("purchase_order_lines")
      .insert({
        order_id: id,
        item_id: newLine.item_id,
        godown_id: newLine.godown_id,
        qty,
        unit_cost: unitCost,
        tax_percent: taxPercent,
        line_total: lineTotal,
      })
      .select("*, item:items(*), godown:godowns(id,name,warehouse_id)")
      .single();
    if (error) { setError(error.message); return; }
    const updated = [...lines, data];
    setLines(updated);
    setNewLine({
      item_id: "",
      godown_id: godowns[0]?.id ?? "",
      qty: "1",
      unit_cost: "0",
      tax_percent: String(order?.tax_percent ?? 18),
    });
    setError(null);
    recalcTotal(updated);
  };

  const handleDeleteLine = async () => {
    if (!deleteLineId) return;
    const { error } = await supabase.from("purchase_order_lines").delete().eq("id", deleteLineId);
    if (error) { setError(error.message); return; }
    const updated = lines.filter((l) => l.id !== deleteLineId);
    setLines(updated);
    setDeleteLineId(null);
    recalcTotal(updated);
  };


  const handlePost = async () => {
    if (!order) return;

    setPosting(true);
    setError(null);
    setPostSuccess(null);

    try {
      const { data, error: postError } = await supabase.rpc("post_purchase_invoice", {
        p_order_id: order.id,
      });

      if (postError) throw postError;

      const result = data as { journal_entry_no?: string } | null;

      setPostSuccess(
        `Purchase invoice posted successfully. Journal entry ${result?.journal_entry_no ?? ""} created, warehouse stock increased, and supplier ledger updated.`
      );

      await fetchOrder();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to post purchase invoice."
      );
    } finally {
      setPosting(false);
    }
  };

  const openSupplierPayment = async () => {
    if (!order?.supplier_id) {
      setError("This purchase invoice has no supplier.");
      return;
    }

    setError(null);
    setPaymentSuccess(null);

    const outstanding = Number(order.outstanding_amount ?? order.total ?? 0);

    if (outstanding <= 0) {
      setError("This purchase invoice is already fully paid.");
      return;
    }

    const { data: mappings, error: mappingError } = await supabase
      .from("account_mappings")
      .select("mapping_key,account_id")
      .in("mapping_key", ["cash", "bank"]);

    if (mappingError) {
      setError(mappingError.message);
      return;
    }

    const accountIds = (mappings ?? []).map((row: any) => row.account_id);

    if (accountIds.length === 0) {
      setError("Cash / Bank account mappings are missing.");
      return;
    }

    const { data: accounts, error: accountError } = await supabase
      .from("chart_of_accounts")
      .select("id,code,name")
      .in("id", accountIds)
      .eq("is_active", true)
      .order("code");

    if (accountError) {
      setError(accountError.message);
      return;
    }

    const loadedAccounts =
      (accounts ?? []) as { id: string; code: string; name: string }[];

    if (loadedAccounts.length === 0) {
      setError("No active Cash / Bank payment account is available.");
      return;
    }

    setPaymentAccounts(loadedAccounts);
    setPaymentAccountId(loadedAccounts[0].id);
    setPaymentAmount(outstanding.toFixed(2));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("Bank");
    setPaymentReference("");
    setPaymentNotes("");
    setPaymentModalOpen(true);
  };

  const handleSupplierPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!order?.supplier_id) return;

    const amount = Number(paymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }

    const outstanding = Number(order.outstanding_amount ?? order.total ?? 0);

    if (amount > outstanding + 0.005) {
      setError("Payment cannot exceed outstanding balance.");
      return;
    }

    if (!paymentAccountId) {
      setError("Select Cash or Bank account.");
      return;
    }

    setPaymentSaving(true);
    setError(null);
    setPaymentSuccess(null);

    try {
      const { data, error } = await supabase.rpc("pay_supplier", {
        p_supplier_id: order.supplier_id,
        p_payment_date: paymentDate,
        p_payment_account_id: paymentAccountId,
        p_payment_method: paymentMethod,
        p_reference: paymentReference.trim() || null,
        p_description: `Payment against ${order.order_no}`,
        p_notes: paymentNotes.trim() || null,
        p_purchase_order_id: order.id,
        p_amount: amount,
      });

      if (error) throw error;

      const result = (data ?? {}) as {
        entry_no?: string;
        payment_amount?: number;
      };

      setPaymentSuccess(
        `Supplier payment posted successfully${
          result.entry_no ? ` — ${result.entry_no}` : ""
        }.`
      );

      setPaymentModalOpen(false);
      await fetchOrder();
    } catch (err: any) {
      console.error("Supplier payment error:", err);

      setError(
        err?.message ||
          err?.details ||
          err?.hint ||
          "Failed to post supplier payment."
      );
    } finally {
      setPaymentSaving(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!order) return;
    const { error } = await supabase.from("purchase_orders").delete().eq("id", order.id);
    if (error) { setError(error.message); return; }
    navigate("/purchase");
  };

  const handlePdf = async () => {
    if (!order) return;

    setError(null);

    try {
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
            .eq("document_type", "purchase")
            .maybeSingle(),
        ]);

      if (companyResult.error) throw companyResult.error;
      if (visibilityResult.error) throw visibilityResult.error;

      const company =
        (companyResult.data || {}) as CompanyPrintSettings;

      const visibility: PurchasePrintVisibility = {
        ...DEFAULT_PURCHASE_VISIBILITY,
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
          // Logo failure must not block PDF.
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
        const headerLines =
          pdf.splitTextToSize(
            company.document_header,
            pageWidth - margin * 2
          );

        pdf.setFontSize(8.5);
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
        order.invoice_type === "Tax Invoice"
          ? "PURCHASE TAX INVOICE"
          : order.status === "posted"
            ? "PURCHASE INVOICE"
            : "PURCHASE ORDER",
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
            "Supplier",
            "Date",
            "Status",
            "Payment Status",
          ],
        ],
        body: [
          [
            order.supplier?.name || "—",
            formatDate(order.order_date),
            String(order.status).toUpperCase(),
            String(
              order.payment_status || "unpaid"
            ).toUpperCase(),
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
          "#", "Item", "Godown", "Qty", "Unit Cost",
          ...(order.invoice_type === "Tax Invoice" ? ["VAT", "VAT Amount"] : []),
          "Amount",
        ]],
        body:
          lines.length > 0
            ? lines.map((line, index) => [
                String(index + 1),
                line.item?.name || "—",
                line.godown?.name || "—",
                String(line.qty),
                formatCurrency(
                  Number(line.unit_cost || 0)
                ),
                ...(order.invoice_type === "Tax Invoice"
                  ? [
                      `${Number(line.tax_percent || 0)}%`,
                      formatCurrency(
                        (Number(line.line_total || 0) * Number(line.tax_percent || 0)) / 100
                      ),
                    ]
                  : []),
                formatCurrency(
                  Number(line.line_total || 0)
                ),
              ])
            : [
                [
                  "",
                  "No purchase items",
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
          [
            "VAT Amount",
            formatCurrency(vatAmount),
          ],
          [
            "Grand Total",
            formatCurrency(Number(order.total || 0)),
          ],
          [
            "Paid",
            formatCurrency(
              Number(order.paid_amount || 0)
            ),
          ],
          [
            "Outstanding",
            formatCurrency(
              Number(
                order.outstanding_amount ??
                  (order.status === "posted"
                    ? order.total
                    : 0)
              )
            ),
          ],
        ],
      });

      y =
        (pdf as any).lastAutoTable?.finalY
          ? (pdf as any).lastAutoTable.finalY + 8
          : y + 25;

      if (visibility.show_signatures) {
        let signatureY = Math.max(
          y + 18,
          pageHeight - 35
        );

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
        `${order.order_no}-Purchase.pdf`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to generate Purchase PDF."
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
      `purchase-order-${order.order_no}.csv`,
      [
        { key: "name", label: "Item / آئٹم" },
        { key: "qty", label: "Qty / مقدار" },
        { key: "unit_cost", label: "Unit Cost / فی یونٹ لاگت" },
        { key: "line_total", label: "Line Total / لائن کل" },
      ],
      lines.map((l) => ({
        name: l.item?.name ?? "—",
        qty: l.qty,
        unit_cost: l.unit_cost,
        line_total: l.line_total,
      })),
    );
  };

  const handleExportExcel = () => {
    if (!order) return;
    exportToExcel(
      `purchase-order-${order.order_no}.xls`,
      [
        { key: "name", label: "Item / آئٹم" },
        { key: "qty", label: "Qty / مقدار" },
        { key: "unit_cost", label: "Unit Cost / فی یونٹ لاگت" },
        { key: "line_total", label: "Line Total / لائن کل" },
      ],
      lines.map((l) => ({
        name: l.item?.name ?? "—",
        qty: l.qty,
        unit_cost: l.unit_cost,
        line_total: l.line_total,
      })),
    );
  };

  if (loading) return <div className="card p-12 text-center text-slate-400">Loading… / لوڈ ہو رہا ہے…</div>;
  if (!order) return <ErrorBanner message="Order not found. / آرڈر نہیں ملا۔" />;

  const charges = chargesFromRecord(order as unknown as Record<string, unknown>);
  const chargeBreakdown = getChargeBreakdown(charges, "purchase");
  const chargesTotal = chargeBreakdown.reduce((s, c) => s + c.amount, 0);
  const itemsTotal = lines.reduce((s, l) => s + Number(l.line_total ?? 0), 0);
  const itemTaxAmount = order.invoice_type === "Tax Invoice"
    ? lines.reduce(
        (sum, line) => sum + (Number(line.line_total ?? 0) * Number(line.tax_percent ?? 0)) / 100,
        0
      )
    : 0;
  const chargeTaxAmount = order.invoice_type === "Tax Invoice"
    ? (chargesTotal * Number(order.tax_percent ?? 0)) / 100
    : 0;
  const vatAmount = itemTaxAmount + chargeTaxAmount;

  return (
    <div>
      <Link to="/purchase" className="text-sm text-primary-600 hover:text-primary-700 mb-4 inline-block">← Back to Purchase Orders</Link>
      <PageHeader
        title={order.order_no}
        subtitle={order.supplier ? `Supplier: ${order.supplier.name}` : "No supplier assigned"}
        action={
          <div className="flex items-center gap-3">
            {order.status !== "posted" && (
              <button
                onClick={() => setShowPostConfirm(true)}
                className="btn-primary"
                disabled={posting}
              >
                {posting ? "Posting..." : "Post Purchase"}
              </button>
            )}
            {order.status === "posted" &&
              Number(order.outstanding_amount ?? order.total ?? 0) > 0 &&
              order.supplier_id && (
                <button
                  onClick={openSupplierPayment}
                  className="btn-primary"
                >Pay Supplier / سپلائر کو ادائیگی</button>
              )}
            <button onClick={handleExportCSV} className="btn-secondary text-sm">CSV</button>
            <button onClick={handleExportExcel} className="btn-secondary text-sm">Excel</button>
            <button
              onClick={handlePrint}
              className="btn-secondary text-sm"
            >
              Print / پرنٹ
            </button>

            <button
              onClick={() => void handlePdf()}
              className="btn-secondary text-sm"
            >
              PDF / پی ڈی ایف
            </button>
            {order.status !== "posted" && (
              <button onClick={handleDeleteOrder} className="btn-danger">Delete / حذف کریں</button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="card p-4"><div className="text-sm text-slate-500">Date / تاریخ</div><div className="font-medium mt-1">{formatDate(order.order_date)}</div></div>
        <div className="card p-4"><div className="text-sm text-slate-500">Status / حالت</div><div className="mt-1"><StatusBadge status={order.status} /></div></div>
        <div className="card p-4"><div className="text-sm text-slate-500">Total / کل</div><div className="font-bold text-lg mt-1">{formatCurrency(order.total)}</div></div>
        <div className="card p-4"><div className="text-sm text-slate-500">Paid / ادا شدہ</div><div className="font-bold text-lg mt-1">{formatCurrency(Number(order.paid_amount ?? 0))}</div></div>
        <div className="card p-4"><div className="text-sm text-slate-500">Outstanding / بقایا</div><div className="font-bold text-lg mt-1">{formatCurrency(Number(order.outstanding_amount ?? (order.status === "posted" ? order.total : 0)))}</div><div className="text-xs capitalize text-slate-500 mt-1">{String(order.payment_status ?? "unpaid")}</div></div>
      </div>

      {paymentSuccess && (
        <div className="rounded-lg bg-success-50 border border-success-200 px-4 py-3 text-sm text-success-700 mb-4">
          {paymentSuccess}
        </div>
      )}

      {postSuccess && (
        <div className="rounded-lg bg-success-50 border border-success-200 px-4 py-3 text-sm text-success-700 mb-4">{postSuccess}</div>
      )}
      {posting && (
        <div className="rounded-lg bg-warning-50 border border-warning-200 px-4 py-3 text-sm text-warning-700 mb-4">
          Posting purchase invoice — increasing stock, creating journal entries, updating supplier ledger…
        </div>
      )}
      {error && <ErrorBanner message={error} />}

      {order.status === "draft" && (
        <div className="rounded-lg bg-primary-50 border border-primary-200 px-4 py-3 text-sm text-primary-700 mb-4">
          Click <strong>Post Purchase / خریداری پوسٹ کریں</strong> to increase warehouse stock, create stock movements, post the supplier payable ledger, and generate balanced journal entries.
        </div>
      )}

      <div className="card p-6 mb-6">
        <h3 className="font-semibold text-slate-900 mb-4">Order Lines / آرڈر لائنز</h3>
        {lines.length === 0 ? (
          <div className="text-slate-400 text-sm py-4">No line items yet. Add one below. / ابھی کوئی آئٹم شامل نہیں۔</div>
        ) : (
          <table className="w-full text-sm mb-4">
            <thead><tr className="border-b border-slate-200"><th className="text-left py-2 font-medium text-slate-600">Item / آئٹم</th><th className="text-left py-2 font-medium text-slate-600">Godown / گودام</th><th className="text-right py-2 font-medium text-slate-600">Qty / مقدار</th><th className="text-right py-2 font-medium text-slate-600">Unit Cost / فی یونٹ لاگت</th>{order.invoice_type === "Tax Invoice" && <th className="text-right py-2 font-medium text-slate-600">VAT / ویٹ</th>}<th className="text-right py-2 font-medium text-slate-600">Line Total / لائن کل</th><th></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className="py-2">{line.item?.name ?? "—"}</td>
                  <td className="py-2">{line.godown?.name ?? "—"}</td>
                  <td className="py-2 text-right">{line.qty}</td>
                  <td className="py-2 text-right">{formatCurrency(line.unit_cost)}</td>
                  {order.invoice_type === "Tax Invoice" && (
                    <td className="py-2 text-right">
                      {Number(line.tax_percent ?? 0)}%
                      <div className="text-xs text-slate-500">
                        {formatCurrency((Number(line.line_total ?? 0) * Number(line.tax_percent ?? 0)) / 100)}
                      </div>
                    </td>
                  )}
                  <td className="py-2 text-right font-medium">
                    {formatCurrency(
                      Number(line.line_total ?? 0) +
                      (order.invoice_type === "Tax Invoice"
                        ? (Number(line.line_total ?? 0) * Number(line.tax_percent ?? 0)) / 100
                        : 0)
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {order.status !== "posted" && (
                      <button onClick={() => setDeleteLineId(line.id)} className="text-error-600 hover:text-error-700 text-sm">Remove / ہٹائیں</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {order.status !== "posted" && (
        <form onSubmit={handleAddLine} className="flex flex-wrap gap-3 items-end pt-4 border-t border-slate-100">
          <div className="flex-1 min-w-[200px]">
            <label className="label">Add Item / آئٹم شامل کریں</label>
            <select className="input" required value={newLine.item_id} onChange={(e) => {
              const item = items.find((i) => i.id === e.target.value);
              setNewLine({ ...newLine, item_id: e.target.value, unit_cost: item ? String(item.cost) : newLine.unit_cost });
            }}>
              <option value="">— Select item —</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}
            </select>
          </div>
          <div className="min-w-[180px]">
            <label className="label">Destination Godown / منزل گودام</label>
            <select
              className="input"
              required
              value={newLine.godown_id}
              onChange={(e) => setNewLine({ ...newLine, godown_id: e.target.value })}
            >
              <option value="">— Select godown —</option>
              {godowns.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div><label className="label">Qty / مقدار</label><input className="input w-24" type="number" step="0.01" required value={newLine.qty} onChange={(e) => setNewLine({ ...newLine, qty: e.target.value })} /></div>
          <div><label className="label">Unit Cost / فی یونٹ لاگت</label><input className="input w-32" type="number" step="0.01" required value={newLine.unit_cost} onChange={(e) => setNewLine({ ...newLine, unit_cost: e.target.value })} /></div>
          {order.invoice_type === "Tax Invoice" && (
            <div><label className="label">VAT % / ویٹ</label><input className="input w-24 text-right" type="number" min="0" max="100" step="0.01" required value={newLine.tax_percent} onChange={(e) => setNewLine({ ...newLine, tax_percent: e.target.value })} /></div>
          )}
          <button type="submit" className="btn-primary">Add Line / لائن شامل کریں</button>
        </form>
        )}
      </div>

      {(chargeBreakdown.length > 0 || itemsTotal > 0) && (
        <div className="card p-6 mb-6">
          <h3 className="font-semibold text-slate-900 mb-4">Charges & Summary / چارجز اور خلاصہ</h3>
          <div className="flex justify-end">
            <div className="w-full max-w-sm space-y-2">
              <div className="flex justify-between text-sm text-slate-600"><span>Items Total / آئٹمز کل</span><span>{formatCurrency(itemsTotal)}</span></div>
              {chargeBreakdown.map((c) => (
                <div key={c.label} className="flex justify-between text-sm text-slate-600"><span>{c.label}</span><span>{formatCurrency(c.amount)}</span></div>
              ))}
              <div className="flex justify-between text-sm text-slate-600 border-t border-slate-200 pt-2"><span>Charges Total / چارجز کل</span><span>{formatCurrency(chargesTotal)}</span></div>
              {order.invoice_type === "Tax Invoice" && (
                <>
                  <div className="flex justify-between text-sm text-slate-600"><span>Items VAT / آئٹمز ویٹ</span><span>{formatCurrency(itemTaxAmount)}</span></div>
                  <div className="flex justify-between text-sm text-slate-600"><span>Charges VAT / چارجز ویٹ</span><span>{formatCurrency(chargeTaxAmount)}</span></div>
                  <div className="flex justify-between text-sm font-semibold text-slate-700"><span>Total VAT / کل ویٹ</span><span>{formatCurrency(vatAmount)}</span></div>
                </>
              )}
              <div className="flex justify-between text-lg font-bold text-slate-900 border-t border-slate-200 pt-2"><span>Grand Total / مجموعی کل</span><span>{formatCurrency(order.total)}</span></div>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={paymentModalOpen}
        title="Pay Supplier / سپلائر کو ادائیگی"
        onClose={() => {
          if (!paymentSaving) setPaymentModalOpen(false);
        }}
      >
        <form onSubmit={handleSupplierPayment} className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="font-semibold text-slate-900">
              {order.supplier?.name ?? "Supplier"}
            </div>
            <div className="mt-1 text-slate-500">
              Invoice {order.order_no} · Outstanding{" "}
              {formatCurrency(
                Number(order.outstanding_amount ?? order.total ?? 0)
              )}
            </div>
          </div>

          <div>
            <label className="label">Payment Date / ادائیگی کی تاریخ</label>
            <input
              type="date"
              className="input"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Payment Account / ادائیگی اکاؤنٹ</label>
            <select
              className="input"
              required
              value={paymentAccountId}
              onChange={(e) => setPaymentAccountId(e.target.value)}
            >
              {paymentAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Payment Method / ادائیگی طریقہ</label>
            <select
              className="input"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="Bank">Bank / بینک</option>
              <option value="Cash">Cash / نقد</option>
              <option value="Cheque">Cheque / چیک</option>
              <option value="Transfer">Transfer / ٹرانسفر</option>
            </select>
          </div>

          <div>
            <label className="label">Amount / رقم</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="input"
              required
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Reference / حوالہ</label>
            <input
              className="input"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="Cheque / transfer reference / چیک یا ٹرانسفر حوالہ"
            />
          </div>

          <div>
            <label className="label">Notes / نوٹس</label>
            <textarea
              className="input min-h-[80px]"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={paymentSaving}
              onClick={() => setPaymentModalOpen(false)}
            >Cancel / منسوخ کریں</button>

            <button
              type="submit"
              className="btn-primary"
              disabled={paymentSaving}
            >
              {paymentSaving ? "Posting Payment..." : "Post Supplier Payment"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal open={!!deleteLineId} title="Remove Line / لائن ہٹائیں" message="Remove this line item? / کیا یہ لائن ہٹانی ہے؟" onConfirm={handleDeleteLine} onCancel={() => setDeleteLineId(null)} />

      <ConfirmModal
        open={showPostConfirm}
        title="Post Purchase Invoice / خریداری انوائس پوسٹ کریں"
        message="Are you sure you want to post this Purchase Invoice? Stock and accounting entries will be created and the document will be locked. / کیا آپ یہ خریداری انوائس پوسٹ کرنا چاہتے ہیں؟ اسٹاک اور اکاؤنٹنگ اندراجات بنیں گے اور دستاویز لاک ہو جائے گی۔"
        onConfirm={() => {
          setShowPostConfirm(false);
          void handlePost();
        }}
        onCancel={() => setShowPostConfirm(false)}
      />

      {showPrint && (
        <PrintLayout
          voucherTitle={
            order.invoice_type === "Tax Invoice"
              ? "Purchase Tax Invoice"
              : "Purchase Invoice"
          }
          voucherNo={order.order_no}
          voucherDate={order.order_date}
          company={{
            name:
              companyPrint.company_name ||
              "Steel Mill ERP",
            address:
              companyPrint.address || undefined,
            phone:
              companyPrint.phone || undefined,
            email:
              companyPrint.email || undefined,
            taxId:
              [
                companyPrint.ntn
                  ? `NTN: ${companyPrint.ntn}`
                  : "",
                companyPrint.strn
                  ? `STRN: ${companyPrint.strn}`
                  : "",
              ]
                .filter(Boolean)
                .join(" | ") || undefined,
            logoUrl:
              companyPrint.logo_url || undefined,
          }}
          visibility={{
            showCompanyName:
              purchasePrintVisibility.show_company_name,
            showLogo:
              purchasePrintVisibility.show_logo,
            showAddress:
              purchasePrintVisibility.show_address,
            showPhoneEmail:
              purchasePrintVisibility.show_phone_email,
            showTaxDetails:
              purchasePrintVisibility.show_tax_details,
            showHeader:
              purchasePrintVisibility.show_header,
            showFooter:
              purchasePrintVisibility.show_footer,
            showSignatures:
              purchasePrintVisibility.show_signatures,
            showPrintDatetime:
              purchasePrintVisibility.show_print_datetime,
            showPageNumbers:
              purchasePrintVisibility.show_page_numbers,
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
          party={{
            name: order.supplier?.name ?? "—",
            address: order.supplier?.address,
            phone: order.supplier?.phone,
            email: order.supplier?.email,
          }}
          items={lines.map((l) => ({
            name: l.item?.name ?? "—",
            qty: l.qty,
            unitPrice: l.unit_cost,
            lineTotal: l.line_total,
            taxPercent:
              order.invoice_type === "Tax Invoice"
                ? Number(l.tax_percent ?? 0)
                : 0,
            taxAmount:
              order.invoice_type === "Tax Invoice"
                ? (Number(l.line_total ?? 0) * Number(l.tax_percent ?? 0)) / 100
                : 0,
          }))}
          chargeBreakdown={chargeBreakdown}
          itemsTotal={itemsTotal}
          chargesTotal={chargesTotal}
          taxAmount={vatAmount}
          showTaxSummary={order.invoice_type === "Tax Invoice"}
          grandTotal={order.total}
          signatureLabels={[
            companyPrint.prepared_by_label ||
              "Prepared By / تیار کردہ",
            companyPrint.checked_by_label ||
              "Checked By / جانچ کردہ",
            companyPrint.approved_by_label ||
              "Approved By / منظور کردہ",
          ]}
        />
      )}
    </div>
  );
}
