import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  Plus,
  RefreshCw,
  Save,
  Printer,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import PrintLayout from "@/components/PrintLayout";

type Customer = {
  id: string;
  name: string;
};

type Item = {
  id: string;
  name: string;
  sku?: string | null;
};

type Godown = {
  id: string;
  name: string;
};

type ChargeMaster = {
  id: string;
  charge_key: string;
  charge_name: string;
  tax_applicable: boolean;
  is_active: boolean;
};

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
};

type HawalaInvoice = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  customer_id: string | null;
  reference_name: string | null;
  reference_no: string | null;
  reference_notes: string | null;
  invoice_type: string;
  tax_percent: number | string;
  item_tax: number | string;
  charges_total: number | string;
  charge_tax: number | string;
  subtotal: number | string;
  total: number | string;
  status: "draft" | "posted" | "cancelled";
  main_sales_order_id: string | null;
  posted_at: string | null;
  customer?: Customer | null;
};

type InvoiceRow = {
  id?: string;
  item_id: string;
  godown_id: string;
  qty: string;
  rate: string;
  tax_percent: string;
};

type ChargeRow = {
  charge_key: string;
  amount: string;
  tax_percent: string;
};

const money = (value: unknown) =>
  `Rs ${Number(value || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const today = () => new Date().toISOString().slice(0, 10);

function generateHawalaNo() {
  const d = new Date();

  const stamp =
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}` +
    `${String(d.getDate()).padStart(2, "0")}-` +
    `${String(d.getHours()).padStart(2, "0")}` +
    `${String(d.getMinutes()).padStart(2, "0")}` +
    `${String(d.getSeconds()).padStart(2, "0")}`;

  return `HWL-${stamp}`;
}

const emptyRow = (tax = "0"): InvoiceRow => ({
  item_id: "",
  godown_id: "",
  qty: "0",
  rate: "0",
  tax_percent: tax,
});

export default function ConsolidatedInvoices() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [chargeMaster, setChargeMaster] = useState<ChargeMaster[]>([]);
  const [invoices, setInvoices] = useState<HawalaInvoice[]>([]);
  const [companyPrint, setCompanyPrint] = useState<CompanyPrintSettings>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [invoiceNo, setInvoiceNo] = useState(generateHawalaNo());
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [customerId, setCustomerId] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [referenceNotes, setReferenceNotes] = useState("");
  const [invoiceType, setInvoiceType] =
    useState<"Cash Bill" | "Tax Invoice">("Cash Bill");
  const [globalTaxPercent, setGlobalTaxPercent] = useState("0");
  const [configuredTaxRate, setConfiguredTaxRate] = useState<string | null>(null);

  const [rows, setRows] = useState<InvoiceRow[]>([emptyRow()]);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [chargeToAdd, setChargeToAdd] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPrint, setShowPrint] = useState(false);

  const editingInvoice = useMemo(
    () => invoices.find((row) => row.id === editingId) ?? null,
    [invoices, editingId]
  );

  const isLocked = editingInvoice?.status === "posted";

  const loadBaseData = useCallback(async () => {
    const [customersRes, itemsRes, godownsRes, chargesRes, taxRes, companyRes] =
      await Promise.all([
        supabase.from("customers").select("id,name").order("name"),
        supabase.from("items").select("id,name,sku").order("name"),
        supabase.from("godowns").select("id,name").order("name"),
        supabase
          .from("charge_master")
          .select(
            "id,charge_key,charge_name,tax_applicable,is_active"
          )
          .eq("is_active", true)
          .order("charge_name"),
        supabase
          .from("tax_rates")
          .select("rate")
          .eq("is_active", true)
          .eq("is_fixed", true)
          .in("applies_to", ["sales", "both"])
          .order("created_at")
          .limit(1)
          .maybeSingle(),
        supabase.from("company_settings").select("*").maybeSingle(),
      ]);

    if (customersRes.error) throw customersRes.error;
    if (itemsRes.error) throw itemsRes.error;
    if (godownsRes.error) throw godownsRes.error;
    if (chargesRes.error) throw chargesRes.error;
    if (taxRes.error) throw taxRes.error;
    if (companyRes.error) throw companyRes.error;

    setCustomers((customersRes.data ?? []) as Customer[]);
    setItems((itemsRes.data ?? []) as Item[]);
    setGodowns((godownsRes.data ?? []) as Godown[]);
    setChargeMaster((chargesRes.data ?? []) as ChargeMaster[]);
    setCompanyPrint((companyRes.data || {}) as CompanyPrintSettings);
    if (taxRes.data) {
      const rate = String(Number(taxRes.data.rate) || 0);
      setConfiguredTaxRate(rate);
      setGlobalTaxPercent(rate);
      setRows((current) => current.map((row) => ({ ...row, tax_percent: rate })));
    }
  }, []);

  const loadInvoices = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("consolidated_sales_invoices")
      .select(
        `
        id,
        invoice_no,
        invoice_date,
        customer_id,
        reference_name,
        reference_no,
        reference_notes,
        invoice_type,
        tax_percent,
        item_tax,
        charges_total,
        charge_tax,
        subtotal,
        total,
        status,
        main_sales_order_id,
        posted_at,
        customer:customers(id,name)
        `
      )
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (loadError) throw loadError;

    setInvoices((data ?? []) as unknown as HawalaInvoice[]);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      try {
        await Promise.all([loadBaseData(), loadInvoices()]);
      } catch (e: any) {
        setError(e?.message || "Failed to load Hawala invoices.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [loadBaseData, loadInvoices]);

  const resetForm = () => {
    setEditingId(null);
    setInvoiceNo(generateHawalaNo());
    setInvoiceDate(today());
    setCustomerId("");
    setReferenceName("");
    setReferenceNo("");
    setReferenceNotes("");
    setInvoiceType("Cash Bill");
    setGlobalTaxPercent(configuredTaxRate ?? "0");
    setRows([emptyRow("0")]);
    setCharges([]);
    setChargeToAdd("");
    setError("");
    setSuccess("");
  };

  const openNew = () => {
    resetForm();
    setShowForm(true);
  };

  const openInvoice = async (invoice: HawalaInvoice) => {
    setError("");
    setSuccess("");
    setEditingId(invoice.id);
    setInvoiceNo(invoice.invoice_no);
    setInvoiceDate(invoice.invoice_date);
    setCustomerId(invoice.customer_id || "");
    setReferenceName(invoice.reference_name || "");
    setReferenceNo(invoice.reference_no || "");
    setReferenceNotes(invoice.reference_notes || "");
    setInvoiceType(invoice.invoice_type === "Tax Invoice" ? "Tax Invoice" : "Cash Bill");
    setGlobalTaxPercent(String(invoice.tax_percent ?? configuredTaxRate ?? 0));

    const [linesRes, chargesRes] = await Promise.all([
      supabase
        .from("consolidated_sales_invoice_lines")
        .select(
          "id,item_id,godown_id,qty,unit_price,tax_percent"
        )
        .eq("invoice_id", invoice.id)
        .order("created_at"),
      supabase
        .from("consolidated_sales_invoice_charges")
        .select("charge_key,amount,tax_percent")
        .eq("invoice_id", invoice.id)
        .order("created_at"),
    ]);

    if (linesRes.error) {
      setError(linesRes.error.message);
      return;
    }

    if (chargesRes.error) {
      setError(chargesRes.error.message);
      return;
    }

    setRows(
      (linesRes.data ?? []).length
        ? (linesRes.data ?? []).map((row: any) => ({
            id: row.id,
            item_id: row.item_id || "",
            godown_id: row.godown_id || "",
            qty: String(row.qty ?? 0),
            rate: String(row.unit_price ?? 0),
            tax_percent: String(row.tax_percent ?? 0),
          }))
        : [emptyRow(String(invoice.tax_percent ?? configuredTaxRate ?? 0))]
    );

    setCharges(
      (chargesRes.data ?? []).map((row: any) => ({
        charge_key: row.charge_key,
        amount: String(row.amount ?? 0),
        tax_percent: String(row.tax_percent ?? 0),
      }))
    );

    setShowForm(true);
  };

  const updateRow = (
    index: number,
    field: keyof InvoiceRow,
    value: string
  ) => {
    if (isLocked) return;

    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );
  };

  const addRow = () => {
    if (isLocked) return;
    setRows((current) => [
      ...current,
      emptyRow(invoiceType === "Tax Invoice" ? globalTaxPercent : "0"),
    ]);
  };

  const removeRow = (index: number) => {
    if (isLocked) return;

    setRows((current) =>
      current.length <= 1
        ? current
        : current.filter((_, rowIndex) => rowIndex !== index)
    );
  };

  const handleInvoiceType = (
    value: "Cash Bill" | "Tax Invoice"
  ) => {
    setInvoiceType(value);

    setRows((current) =>
      current.map((row) => ({
        ...row,
        tax_percent:
          value === "Tax Invoice" ? globalTaxPercent : "0",
      }))
    );

    setCharges((current) =>
      current.map((charge) => ({
        ...charge,
        tax_percent:
          value === "Tax Invoice"
            ? globalTaxPercent
            : "0",
      }))
    );
  };

  const addCharge = () => {
    if (!chargeToAdd || isLocked) return;

    if (charges.some((row) => row.charge_key === chargeToAdd)) {
      setChargeToAdd("");
      return;
    }

    const master = chargeMaster.find(
      (row) => row.charge_key === chargeToAdd
    );

    setCharges((current) => [
      ...current,
      {
        charge_key: chargeToAdd,
        amount: "0",
        tax_percent:
          invoiceType === "Tax Invoice" && master?.tax_applicable
            ? globalTaxPercent
            : "0",
      },
    ]);

    setChargeToAdd("");
  };

  const rowsSubtotal = rows.reduce(
    (sum, row) =>
      sum +
      (Number(row.qty) || 0) * (Number(row.rate) || 0),
    0
  );

  const itemTax = rows.reduce((sum, row) => {
    if (invoiceType !== "Tax Invoice") return sum;

    const base =
      (Number(row.qty) || 0) * (Number(row.rate) || 0);

    return (
      sum +
      (base * (Number(row.tax_percent) || 0)) / 100
    );
  }, 0);

  const chargesSubtotal = charges.reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0
  );

  const chargeTax = charges.reduce((sum, row) => {
    if (invoiceType !== "Tax Invoice") return sum;

    return (
      sum +
      ((Number(row.amount) || 0) *
        (Number(row.tax_percent) || 0)) /
        100
    );
  }, 0);

  const grandTotal =
    rowsSubtotal + itemTax + chargesSubtotal + chargeTax;

  const saveDraft = async () => {
    if (isLocked) {
      setError("Posted Hawala invoice is locked.");
      return null;
    }

    setError("");
    setSuccess("");

    if (!customerId) {
      setError(
        "Select customer / کسٹمر منتخب کریں۔"
      );
      return null;
    }

    if (!referenceName.trim()) {
      setError(
        "Enter Hawala / Reference Name / حوالہ نام درج کریں۔"
      );
      return null;
    }

    if (invoiceType === "Tax Invoice" && !configuredTaxRate) {
      setError("Add and fix an active Sales/Both tax rate in Tax Settings before creating a Tax Invoice.");
      return null;
    }

    const validRows = rows.filter(
      (row) => row.item_id && Number(row.qty) > 0
    );

    if (!validRows.length) {
      setError(
        "Add at least one item with quantity / کم از کم ایک آئٹم شامل کریں۔"
      );
      return null;
    }

    if (validRows.some((row) => !row.godown_id)) {
      setError(
        "Select godown for every item / ہر آئٹم کا گودام منتخب کریں۔"
      );
      return null;
    }

    setSaving(true);

    try {
      let invoiceId = editingId;

      const headerPayload = {
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        customer_id: customerId,
        reference_name: referenceName.trim(),
        reference_no: referenceNo.trim() || null,
        reference_notes: referenceNotes.trim() || null,
        invoice_type: invoiceType,
        tax_percent:
          invoiceType === "Tax Invoice"
            ? Number(globalTaxPercent) || 0
            : 0,
        subtotal: Number(rowsSubtotal.toFixed(2)),
        item_tax: Number(itemTax.toFixed(2)),
        charges_total: Number(chargesSubtotal.toFixed(2)),
        charge_tax: Number(chargeTax.toFixed(2)),
        total: Number(grandTotal.toFixed(2)),
        status: "draft",
      };

      if (invoiceId) {
        const { error: updateError } = await supabase
          .from("consolidated_sales_invoices")
          .update(headerPayload)
          .eq("id", invoiceId);

        if (updateError) throw updateError;

        const { error: deleteLinesError } = await supabase
          .from("consolidated_sales_invoice_lines")
          .delete()
          .eq("invoice_id", invoiceId);

        if (deleteLinesError) throw deleteLinesError;

        const { error: deleteChargesError } = await supabase
          .from("consolidated_sales_invoice_charges")
          .delete()
          .eq("invoice_id", invoiceId);

        if (deleteChargesError) throw deleteChargesError;
      } else {
        const { data, error: insertError } = await supabase
          .from("consolidated_sales_invoices")
          .insert(headerPayload)
          .select("id")
          .single();

        if (insertError) throw insertError;

        invoiceId = data.id;
        setEditingId(invoiceId);
      }

      if (!invoiceId) throw new Error("Unable to create Hawala invoice.");

      const linePayload = validRows.map((row) => ({
        invoice_id: invoiceId,
        item_id: row.item_id,
        godown_id: row.godown_id,
        qty: Number(row.qty) || 0,
        unit_price: Number(row.rate) || 0,
        tax_percent:
          invoiceType === "Tax Invoice"
            ? Number(row.tax_percent) || 0
            : 0,
        line_total:
          (Number(row.qty) || 0) *
          (Number(row.rate) || 0),
      }));

      const { error: lineError } = await supabase
        .from("consolidated_sales_invoice_lines")
        .insert(linePayload);

      if (lineError) throw lineError;

      if (charges.length) {
        const chargePayload = charges.map((row) => ({
          invoice_id: invoiceId,
          charge_key: row.charge_key,
          amount: Number(row.amount) || 0,
          tax_percent:
            invoiceType === "Tax Invoice"
              ? Number(row.tax_percent) || 0
              : 0,
        }));

        const { error: chargeError } = await supabase
          .from("consolidated_sales_invoice_charges")
          .insert(chargePayload);

        if (chargeError) throw chargeError;
      }

      await loadInvoices();

      setSuccess(
        "Hawala invoice draft saved / حوالہ انوائس محفوظ ہوگیا۔"
      );

      return invoiceId;
    } catch (e: any) {
      setError(e?.message || "Failed to save Hawala invoice.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const postStock = async () => {
    if (isLocked) return;

    setPosting(true);
    setError("");
    setSuccess("");

    try {
      const invoiceId = await saveDraft();
      if (!invoiceId) return;

      const { data, error: rpcError } = await supabase.rpc(
        "post_consolidated_sales_invoice",
        { p_invoice_id: invoiceId }
      );

      if (rpcError) throw rpcError;

      await loadInvoices();

      setSuccess(
        `Stock posted successfully. No accounting entry created. / اسٹاک پوسٹ ہوگیا، اکاؤنٹنگ انٹری نہیں بنی۔ ${
          data?.invoice_no || ""
        }`
      );

      const { data: refreshed } = await supabase
        .from("consolidated_sales_invoices")
        .select(
          `
          id,
          invoice_no,
          invoice_date,
          customer_id,
          reference_name,
          reference_no,
          reference_notes,
          invoice_type,
          tax_percent,
          item_tax,
          charges_total,
          charge_tax,
          subtotal,
          total,
          status,
          main_sales_order_id,
          posted_at,
          customer:customers(id,name)
          `
        )
        .eq("id", invoiceId)
        .single();

      if (refreshed) {
        setInvoices((current) => [
          refreshed as unknown as HawalaInvoice,
          ...current.filter((row) => row.id !== invoiceId),
        ]);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to post Hawala stock.");
    } finally {
      setPosting(false);
    }
  };

  const deleteDraft = async () => {
    if (!editingId || isLocked) return;

    if (
      !window.confirm(
        "Delete this Hawala draft? / کیا یہ حوالہ ڈرافٹ حذف کرنا ہے؟"
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const { error: deleteError } = await supabase
        .from("consolidated_sales_invoices")
        .delete()
        .eq("id", editingId);

      if (deleteError) throw deleteError;

      await loadInvoices();
      resetForm();
      setShowForm(false);
    } catch (e: any) {
      setError(e?.message || "Failed to delete Hawala draft.");
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    setShowPrint(true);

    window.setTimeout(() => {
      window.print();

      window.setTimeout(() => {
        setShowPrint(false);
      }, 250);
    }, 150);
  };

  const selectedCustomer =
    customers.find((customer) => customer.id === customerId) ?? null;

  const printItems = rows
    .filter((row) => row.item_id && Number(row.qty) > 0)
    .map((row) => {
      const item = items.find((item) => item.id === row.item_id);

      return {
        name: item?.name || "—",
        grade: null,
        size: null,
        qty: Number(row.qty) || 0,
        unitPrice: Number(row.rate) || 0,
        lineTotal:
          (Number(row.qty) || 0) *
          (Number(row.rate) || 0),
      };
    });

  const printCharges = charges.map((charge) => {
    const master = chargeMaster.find(
      (row) => row.charge_key === charge.charge_key
    );

    return {
      label: master?.charge_name || charge.charge_key,
      amount: Number(charge.amount) || 0,
    };
  });

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return invoices;

    return invoices.filter((row) =>
      [
        row.invoice_no,
        row.customer?.name,
        row.reference_name,
        row.reference_no,
        row.invoice_date,
        row.status,
      ].some((value) =>
        String(value ?? "").toLowerCase().includes(q)
      )
    );
  }, [invoices, search]);

  if (showForm) {
    return (
      <div className="space-y-3">
        <section className="flex flex-col gap-3 border-b border-slate-200 pb-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="mb-1 inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-blue-700"
            >
              <ArrowLeft className="h-3 w-3" />
              Hawala Invoices / حوالہ انوائسز
            </button>

            <h1 className="text-lg font-semibold text-slate-900">
              {editingId
                ? `Hawala Invoice · ${invoiceNo}`
                : "New Hawala Invoice / نیا حوالہ انوائس"}
            </h1>

            <p className="mt-0.5 text-[12px] text-slate-500">
              Unbilled Dispatch / حوالہ ڈسپیچ — operational unbilled delivery document. Accounting is recognized through the Main Sales Invoice / اکاؤنٹنگ مین سیلز انوائس پر ہوگی۔
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="btn-secondary"
              onClick={handlePrint}
            >
              <Printer className="h-3.5 w-3.5" />
              Preview / Print / پیش نظارہ
            </button>

            {editingId && !isLocked && (
              <button
                type="button"
                className="btn-danger"
                onClick={deleteDraft}
                disabled={saving}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Draft
              </button>
            )}

            {!isLocked && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={saving || posting}
                  onClick={() => void saveDraft()}
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Saving…" : "Save Draft / محفوظ کریں"}
                </button>

                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving || posting}
                  onClick={() => void postStock()}
                >
                  <FileCheck2 className="h-3.5 w-3.5" />
                  {posting
                    ? "Posting…"
                    : "Post Stock / اسٹاک پوسٹ کریں"}
                </button>
              </>
            )}

            {isLocked && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Stock Posted / اسٹاک پوسٹ شدہ
              </span>
            )}
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">
            {success}
          </div>
        )}

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-3 py-2.5">
            <div className="text-[12px] font-semibold text-slate-800">
              Hawala Information / حوالہ معلومات
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="label">Invoice Type / انوائس قسم</label>
              <select
                className="input"
                disabled={isLocked}
                value={invoiceType}
                onChange={(e) =>
                  handleInvoiceType(e.target.value as any)
                }
              >
                <option value="Cash Bill">Without Tax (Cash Bill) / بغیر ٹیکس</option>
                <option value="Tax Invoice">With Tax (Tax Invoice) / ٹیکس کے ساتھ</option>
              </select>
            </div>

            <div>
              <label className="label">Dispatch No. / حوالہ نمبر</label>
              <input
                className="input bg-slate-50 font-semibold"
                disabled
                value={invoiceNo}
              />
            </div>

            <div>
              <label className="label">Date / تاریخ</label>
              <input
                className="input"
                type="date"
                disabled={isLocked}
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Customer / گاہک</label>
              <select
                className="input"
                disabled={isLocked}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">— Select Customer —</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">
                Hawala / Reference Name / حوالہ نام
              </label>
              <input
                className="input"
                disabled={isLocked}
                value={referenceName}
                onChange={(e) => setReferenceName(e.target.value)}
                placeholder="Reference name / حوالہ نام"
              />
            </div>

            <div>
              <label className="label">
                Reference No. / حوالہ نمبر
              </label>
              <input
                className="input"
                disabled={isLocked}
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="label">
                Reference Remarks / حوالہ تفصیل
              </label>
              <input
                className="input"
                disabled={isLocked}
                value={referenceNotes}
                onChange={(e) => setReferenceNotes(e.target.value)}
              />
            </div>

            {invoiceType === "Tax Invoice" && (
              <div>
                <label className="label">
                  Default Tax % / ڈیفالٹ ٹیکس
                </label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  disabled
                  value={globalTaxPercent}
                  onChange={(e) => {
                    const value = e.target.value;
                    setGlobalTaxPercent(value);
                    setRows((current) =>
                      current.map((row) => ({
                        ...row,
                        tax_percent: value,
                      }))
                    );
                  }}
                />
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
            <div>
              <div className="text-[12px] font-semibold text-slate-800">
                Invoice Items / انوائس آئٹمز
              </div>
              <div className="text-[12px] text-slate-400">
                Item, godown, quantity, rate and tax
              </div>
            </div>

            {!isLocked && (
              <button
                type="button"
                className="btn-secondary"
                onClick={addRow}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Row
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-[12px]">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200 text-[12px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left">Item / آئٹم</th>
                  <th className="px-2 py-2 text-left">Godown / گودام</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Rate</th>
                  {invoiceType === "Tax Invoice" && (
                    <th className="px-2 py-2 text-right">Tax %</th>
                  )}
                  <th className="px-2 py-2 text-right">Amount / رقم</th>
                  <th className="w-10" />
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => {
                  const base =
                    (Number(row.qty) || 0) *
                    (Number(row.rate) || 0);

                  const tax =
                    invoiceType === "Tax Invoice"
                      ? (base *
                          (Number(row.tax_percent) || 0)) /
                        100
                      : 0;

                  return (
                    <tr
                      key={index}
                      className="border-b border-slate-100"
                    >
                      <td className="px-3 py-2">
                        <select
                          className="input"
                          disabled={isLocked}
                          value={row.item_id}
                          onChange={(e) =>
                            updateRow(
                              index,
                              "item_id",
                              e.target.value
                            )
                          }
                        >
                          <option value="">— Select item —</option>
                          {items.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                              {item.sku ? ` · ${item.sku}` : ""}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-2 py-2">
                        <select
                          className="input"
                          disabled={isLocked}
                          value={row.godown_id}
                          onChange={(e) =>
                            updateRow(
                              index,
                              "godown_id",
                              e.target.value
                            )
                          }
                        >
                          <option value="">— Select godown —</option>
                          {godowns.map((godown) => (
                            <option key={godown.id} value={godown.id}>
                              {godown.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-2 py-2">
                        <input
                          className="input text-right"
                          type="number"
                          step="0.001"
                          disabled={isLocked}
                          value={row.qty}
                          onChange={(e) =>
                            updateRow(index, "qty", e.target.value)
                          }
                        />
                      </td>

                      <td className="px-2 py-2">
                        <input
                          className="input text-right"
                          type="number"
                          step="0.01"
                          disabled={isLocked}
                          value={row.rate}
                          onChange={(e) =>
                            updateRow(index, "rate", e.target.value)
                          }
                        />
                      </td>

                      {invoiceType === "Tax Invoice" && (
                        <td className="px-2 py-2">
                          <input
                            className="input text-right"
                            type="number"
                            step="0.01"
                            disabled={isLocked}
                            value={row.tax_percent}
                            onChange={(e) =>
                              updateRow(
                                index,
                                "tax_percent",
                                e.target.value
                              )
                            }
                          />
                        </td>
                      )}

                      <td className="px-2 py-2 text-right font-semibold">
                        {money(base + tax)}
                      </td>

                      <td className="px-2 py-2">
                        {!isLocked && rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(index)}
                            className="text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[12px] font-semibold text-slate-800">
                Applicable Charges / قابل اطلاق چارجز
              </div>
              <div className="text-[12px] text-slate-400">
                Optional charges from Charge Master
              </div>
            </div>

            {!isLocked && (
              <div className="flex gap-1.5">
                <select
                  className="input min-w-[220px]"
                  value={chargeToAdd}
                  onChange={(e) => setChargeToAdd(e.target.value)}
                >
                  <option value="">— Select charge —</option>
                  {chargeMaster
                    .filter(
                      (master) =>
                        !charges.some(
                          (row) =>
                            row.charge_key === master.charge_key
                        )
                    )
                    .map((master) => (
                      <option
                        key={master.id}
                        value={master.charge_key}
                      >
                        {master.charge_name}
                      </option>
                    ))}
                </select>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={addCharge}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
            )}
          </div>

          {!charges.length ? (
            <div className="p-4 text-[12px] text-slate-400">
              No additional charges / کوئی اضافی چارج نہیں۔
            </div>
          ) : (
            <div className="grid gap-2 p-3 md:grid-cols-2">
              {charges.map((charge, index) => {
                const master = chargeMaster.find(
                  (row) => row.charge_key === charge.charge_key
                );

                return (
                  <div
                    key={charge.charge_key}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[12px] font-semibold">
                        {master?.charge_name || charge.charge_key}
                      </span>

                      {!isLocked && (
                        <button
                          type="button"
                          className="text-rose-600"
                          onClick={() =>
                            setCharges((current) =>
                              current.filter(
                                (_, rowIndex) => rowIndex !== index
                              )
                            )
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label">Amount / رقم</label>
                        <input
                          className="input text-right"
                          type="number"
                          step="0.01"
                          disabled={isLocked}
                          value={charge.amount}
                          onChange={(e) =>
                            setCharges((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index
                                  ? {
                                      ...row,
                                      amount: e.target.value,
                                    }
                                  : row
                              )
                            )
                          }
                        />
                      </div>

                      {invoiceType === "Tax Invoice" &&
                        master?.tax_applicable && (
                          <div>
                            <label className="label">Tax %</label>
                            <input
                              className="input text-right"
                              type="number"
                              step="0.01"
                              disabled={isLocked}
                              value={charge.tax_percent}
                              onChange={(e) =>
                                setCharges((current) =>
                                  current.map((row, rowIndex) =>
                                    rowIndex === index
                                      ? {
                                          ...row,
                                          tax_percent:
                                            e.target.value,
                                        }
                                      : row
                                  )
                                )
                              }
                            />
                          </div>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="ml-auto w-full max-w-md rounded-lg border border-slate-200 bg-white p-3 text-[12px]">
          <div className="flex justify-between py-1">
            <span>Items Subtotal / آئٹمز</span>
            <strong>{money(rowsSubtotal)}</strong>
          </div>

          {invoiceType === "Tax Invoice" && (
            <div className="flex justify-between py-1">
              <span>Item Tax / آئٹم ٹیکس</span>
              <strong>{money(itemTax)}</strong>
            </div>
          )}

          <div className="flex justify-between py-1">
            <span>Charges / چارجز</span>
            <strong>{money(chargesSubtotal)}</strong>
          </div>

          {invoiceType === "Tax Invoice" && (
            <div className="flex justify-between py-1">
              <span>Charge Tax / چارج ٹیکس</span>
              <strong>{money(chargeTax)}</strong>
            </div>
          )}

          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm">
            <span className="font-semibold">
              Net Total / کل رقم
            </span>
            <strong>{money(grandTotal)}</strong>
          </div>
        </section>

        {showPrint && (
          <PrintLayout
            voucherTitle="Unbilled Dispatch"
            voucherNo={invoiceNo}
            voucherDate={invoiceDate}
            company={{
              name: companyPrint.company_name || "Steel Mill ERP",
              address: companyPrint.address || undefined,
              phone: companyPrint.phone || undefined,
              email: companyPrint.email || undefined,
              taxId: [
                companyPrint.ntn ? `NTN: ${companyPrint.ntn}` : "",
                companyPrint.strn ? `STRN: ${companyPrint.strn}` : "",
              ].filter(Boolean).join(" | ") || undefined,
              logoUrl: companyPrint.logo_url || undefined,
            }}
            documentHeader={companyPrint.document_header || undefined}
            documentHeaderUrdu={companyPrint.document_header_urdu || undefined}
            documentFooter={companyPrint.document_footer || undefined}
            documentFooterUrdu={companyPrint.document_footer_urdu || undefined}
            party={{
              name: selectedCustomer?.name || "—",
            }}
            items={printItems}
            chargeBreakdown={printCharges}
            itemsTotal={rowsSubtotal}
            chargesTotal={chargesSubtotal}
            taxAmount={itemTax + chargeTax}
            showTaxSummary={invoiceType === "Tax Invoice"}
            grandTotal={grandTotal}
            extraFields={[
              {
                label: "Reference Name / حوالہ نام",
                value: referenceName || "—",
              },
              {
                label: "Reference No. / ریفرنس نمبر",
                value: referenceNo || "—",
              },
              ...(referenceNotes
                ? [
                    {
                      label: "Remarks / تفصیل",
                      value: referenceNotes,
                    },
                  ]
                : []),
            ]}
            documentNotice="NON-ACCOUNTING / UNBILLED DISPATCH DOCUMENT"
            documentNoticeUrdu="غیر اکاؤنٹنگ حوالہ / غیر بل شدہ ترسیلی دستاویز"
            paymentSummary={undefined}
            signatureLabels={[
              companyPrint.prepared_by_label || "Prepared By / تیار کردہ",
              companyPrint.checked_by_label || "Checked By / جانچ کردہ",
              companyPrint.approved_by_label || "Approved By / منظور کردہ",
            ]}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className="flex flex-col gap-3 border-b border-slate-200 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link
            to="/sales"
            className="mb-1 inline-flex items-center gap-1 text-[12px] text-slate-500 hover:text-blue-700"
          >
            <ArrowLeft className="h-3 w-3" />
            Sales / فروخت
          </Link>

          <h1 className="text-lg font-semibold text-slate-900">
            Hawala / Consolidated Invoices / حوالہ انوائسز
          </h1>

          <p className="text-[12px] text-slate-500">
            Separate stock-only invoices. Accounting will be recognized later through the Main Sales Invoice.
          </p>
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void loadInvoices()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={openNew}
          >
            <Plus className="h-3.5 w-3.5" />
            Create Hawala Invoice / نیا حوالہ انوائس
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
          {error}
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
        <input
          className="input pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice, customer or Hawala…"
        />
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[12px]">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200 text-[12px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left">Hawala No.</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-left">Reference / حوالہ</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-slate-400"
                  >
                    Loading…
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-slate-400"
                  >
                    No Hawala invoices found / کوئی حوالہ انوائس نہیں۔
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-slate-100"
                  >
                    <td className="px-3 py-2 font-semibold">
                      {invoice.invoice_no}
                    </td>
                    <td className="px-3 py-2">
                      {invoice.invoice_date}
                    </td>
                    <td className="px-3 py-2">
                      {invoice.customer?.name || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {invoice.reference_name || "—"}
                      </div>
                      {invoice.reference_no && (
                        <div className="text-[12px] text-slate-400">
                          {invoice.reference_no}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {money(invoice.total)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={
                          invoice.status === "posted"
                            ? "rounded-full bg-emerald-50 px-2 py-1 text-[12px] font-semibold text-emerald-700"
                            : "rounded-full bg-amber-50 px-2 py-1 text-[12px] font-semibold text-amber-700"
                        }
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void openInvoice(invoice)}
                      >
                        {invoice.status === "posted"
                          ? "View"
                          : "Open / Edit"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
