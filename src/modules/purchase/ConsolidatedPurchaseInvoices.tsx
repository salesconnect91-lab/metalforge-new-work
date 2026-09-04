import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { ErrorBanner, PageHeader, StatusBadge, formatCurrency, formatDate } from "@/components/ui";
import PrintLayout from "@/components/PrintLayout";

type Supplier = { id: string; name: string; phone?: string | null; address?: string | null };
type Item = { id: string; name: string; sku?: string | null; cost?: number | string | null };
type Godown = { id: string; name: string };
type Row = { item_id: string; godown_id: string; qty: string; unit_cost: string; tax_percent: string };
type Invoice = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  supplier_id: string | null;
  reference_name: string | null;
  reference_no: string | null;
  reference_notes: string | null;
  invoice_type: "Purchase Invoice" | "Tax Invoice";
  tax_percent: number | string;
  subtotal: number | string;
  item_tax: number | string;
  charges_total: number | string;
  charge_tax: number | string;
  total: number | string;
  status: "draft" | "posted" | "cancelled";
  supplier?: Supplier | null;
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
type PrintVisibility = {
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

const DEFAULT_PRINT_VISIBILITY: PrintVisibility = {
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

const makeNo = () => {
  const d = new Date();
  return `CP-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
};
const emptyRow = (tax = "0", godown = ""): Row => ({ item_id: "", godown_id: godown, qty: "1", unit_cost: "0", tax_percent: tax });
const n = (value: unknown) => Number(value) || 0;

export default function ConsolidatedPurchaseInvoices() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [companyPrint, setCompanyPrint] = useState<CompanyPrintSettings>({});
  const [printVisibility, setPrintVisibility] = useState<PrintVisibility>(DEFAULT_PRINT_VISIBILITY);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [invoiceNo, setInvoiceNo] = useState(makeNo());
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState("");
  const [referenceName, setReferenceName] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [referenceNotes, setReferenceNotes] = useState("");
  const [invoiceType, setInvoiceType] = useState<"Purchase Invoice" | "Tax Invoice">("Purchase Invoice");
  const [taxPercent, setTaxPercent] = useState("0");
  const [taxConfigured, setTaxConfigured] = useState(false);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [supplierRes, itemRes, godownRes, invoiceRes, taxRes, companyRes, visibilityRes] = await Promise.all([
      supabase.from("suppliers").select("id,name,phone,address").eq("is_active", true).order("name"),
      supabase.from("items").select("id,name,sku,cost").order("name"),
      supabase.from("godowns").select("id,name").order("name"),
      supabase.from("consolidated_purchase_invoices").select("*,supplier:suppliers(id,name,phone,address)").order("invoice_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("tax_rates").select("rate,is_fixed").eq("is_active", true).eq("is_fixed", true).in("applies_to", ["purchase", "both"]).order("created_at").limit(1).maybeSingle(),
      supabase.from("company_settings").select("*").maybeSingle(),
      supabase.from("document_print_visibility").select("*").eq("document_type", "purchase_invoice").maybeSingle(),
    ]);
    setLoading(false);
    const firstError = supplierRes.error || itemRes.error || godownRes.error || invoiceRes.error || taxRes.error || companyRes.error;
    if (firstError) { setError(firstError.message); return; }
    const loadedGodowns = (godownRes.data ?? []) as Godown[];
    setSuppliers((supplierRes.data ?? []) as Supplier[]);
    setItems((itemRes.data ?? []) as Item[]);
    setGodowns(loadedGodowns);
    setInvoices((invoiceRes.data ?? []) as unknown as Invoice[]);
    setCompanyPrint((companyRes.data || {}) as CompanyPrintSettings);
    if (!visibilityRes.error) setPrintVisibility({ ...DEFAULT_PRINT_VISIBILITY, ...(visibilityRes.data || {}) });
    if (taxRes.data) {
      const rate = String(n(taxRes.data.rate));
      setTaxPercent(rate);
      setTaxConfigured(true);
      if (!editingId) setRows((current) => current.map((row) => ({ ...row, tax_percent: rate, godown_id: row.godown_id || loadedGodowns[0]?.id || "" })));
    }
  }, [editingId]);

  useEffect(() => { void load(); }, [load]);

  const reset = () => {
    setEditingId(null);
    setInvoiceNo(makeNo());
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setSupplierId("");
    setReferenceName("");
    setReferenceNo("");
    setReferenceNotes("");
    setInvoiceType("Purchase Invoice");
    setRows([emptyRow(taxPercent, godowns[0]?.id ?? "")]);
    setShowForm(false);
  };

  const subtotal = rows.reduce((sum, row) => sum + n(row.qty) * n(row.unit_cost), 0);
  const itemTax = invoiceType === "Tax Invoice" ? rows.reduce((sum, row) => sum + n(row.qty) * n(row.unit_cost) * n(row.tax_percent) / 100, 0) : 0;
  const total = subtotal + itemTax;
  const currentInvoice = useMemo(() => invoices.find((invoice) => invoice.id === editingId) ?? null, [invoices, editingId]);
  const locked = currentInvoice?.status === "posted";
  const currentSupplier = suppliers.find((supplier) => supplier.id === supplierId) ?? currentInvoice?.supplier ?? null;

  const handleInvoiceType = (value: "Purchase Invoice" | "Tax Invoice") => {
    if (locked) return;
    setInvoiceType(value);
    setRows((current) => current.map((row) => ({ ...row, tax_percent: value === "Tax Invoice" ? taxPercent : "0" })));
  };

  const updateRow = (index: number, field: keyof Row, value: string) => {
    if (locked) return;
    setRows((current) => current.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, [field]: value };
      if (field === "item_id") {
        const item = items.find((candidate) => candidate.id === value);
        if (item) next.unit_cost = String(n(item.cost));
      }
      return next;
    }));
  };

  const editInvoice = async (invoice: Invoice) => {
    setError(null);
    const { data: lineData, error: lineError } = await supabase.from("consolidated_purchase_invoice_lines").select("*").eq("invoice_id", invoice.id).order("created_at");
    if (lineError) { setError(lineError.message); return; }
    setEditingId(invoice.id);
    setInvoiceNo(invoice.invoice_no);
    setInvoiceDate(invoice.invoice_date);
    setSupplierId(invoice.supplier_id ?? "");
    setReferenceName(invoice.reference_name ?? "");
    setReferenceNo(invoice.reference_no ?? "");
    setReferenceNotes(invoice.reference_notes ?? "");
    setInvoiceType(invoice.invoice_type);
    setTaxPercent(String(invoice.tax_percent ?? taxPercent));
    setRows((lineData ?? []).length ? (lineData ?? []).map((line: any) => ({ item_id: line.item_id, godown_id: line.godown_id, qty: String(line.qty), unit_cost: String(line.unit_cost), tax_percent: String(line.tax_percent) })) : [emptyRow(taxPercent, godowns[0]?.id ?? "")]);
    setShowForm(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (locked) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      if (!supplierId) throw new Error("Please select a supplier.");
      if (invoiceType === "Tax Invoice" && !taxConfigured) throw new Error("Add and fix an active Purchase/Both tax rate in Tax Settings first.");
      const validRows = rows.filter((row) => row.item_id && n(row.qty) > 0);
      if (!validRows.length) throw new Error("Add at least one item.");
      if (validRows.some((row) => !row.godown_id)) throw new Error("Select a godown for every item.");
      const payload = { invoice_no: invoiceNo, invoice_date: invoiceDate, supplier_id: supplierId, reference_name: referenceName.trim() || null, reference_no: referenceNo.trim() || null, reference_notes: referenceNotes.trim() || null, invoice_type: invoiceType, tax_percent: invoiceType === "Tax Invoice" ? n(taxPercent) : 0, subtotal, item_tax: itemTax, charges_total: 0, charge_tax: 0, total };
      let invoiceId = editingId;
      if (editingId) {
        const { error: updateError } = await supabase.from("consolidated_purchase_invoices").update(payload).eq("id", editingId);
        if (updateError) throw updateError;
        const { error: deleteError } = await supabase.from("consolidated_purchase_invoice_lines").delete().eq("invoice_id", editingId);
        if (deleteError) throw deleteError;
      } else {
        const { data, error: insertError } = await supabase.from("consolidated_purchase_invoices").insert({ ...payload, status: "draft" }).select().single();
        if (insertError) throw insertError;
        invoiceId = data.id;
      }
      const { error: lineError } = await supabase.from("consolidated_purchase_invoice_lines").insert(validRows.map((row) => ({ invoice_id: invoiceId, item_id: row.item_id, godown_id: row.godown_id, qty: n(row.qty), unit_cost: n(row.unit_cost), tax_percent: invoiceType === "Tax Invoice" ? n(row.tax_percent) : 0, line_total: n(row.qty) * n(row.unit_cost) })));
      if (lineError) throw lineError;
      setSuccess("Consolidated Purchase Invoice saved. Post it when goods are physically received.");
      reset();
      await load();
    } catch (e: any) { setError(e?.message || "Failed to save Consolidated Purchase Invoice."); }
    finally { setSaving(false); }
  };

  const post = async (invoice: Invoice) => {
    setPostingId(invoice.id); setError(null); setSuccess(null);
    const { error: postError } = await supabase.rpc("post_consolidated_purchase_invoice", { p_invoice_id: invoice.id });
    setPostingId(null);
    if (postError) { setError(postError.message); return; }
    setSuccess(`${invoice.invoice_no} posted: stock received. Supplier accounting will be created only when it is added to a Main Purchase Invoice and that Main Invoice is posted.`);
    await load();
  };

  const printInvoice = () => requestAnimationFrame(() => requestAnimationFrame(() => window.print()));

  return <div>
    <div className="print:hidden">
      <Link to="/purchase" className="mb-4 inline-block text-sm text-primary-600">← Back to Purchase</Link>
      <PageHeader title="Consolidated Purchase Invoices / کنسولیڈیٹڈ خریداری" subtitle="Separate receiving documents; add them later to a Main Purchase Invoice" action={<button className="btn-primary" onClick={() => { reset(); setShowForm(true); }}>+ New Consolidated Purchase</button>} />
      {error && <ErrorBanner message={error} />}
      {success && <div className="mb-4 rounded-lg border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700">{success}</div>}

      {showForm && <form onSubmit={save} className="card mb-6 space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{editingId ? "Open" : "New"} Consolidated Purchase Invoice</h3><div className="flex gap-2">{editingId && <button type="button" className="btn-secondary" onClick={printInvoice}>Print / PDF</button>}<button type="button" className="btn-secondary" onClick={reset}>Close</button></div></div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4"><div><label className="label">Invoice No.</label><input className="input bg-slate-50 cursor-not-allowed" value={invoiceNo} readOnly tabIndex={-1} title="Invoice number is generated automatically" /></div><div><label className="label">Supplier</label><select className="input" value={supplierId} disabled={locked} onChange={(e) => setSupplierId(e.target.value)}><option value="">— Select —</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div><div><label className="label">Date</label><input className="input" type="date" value={invoiceDate} disabled={locked} onChange={(e) => setInvoiceDate(e.target.value)} /></div><div><label className="label">Type</label><select className="input" value={invoiceType} disabled={locked} onChange={(e) => handleInvoiceType(e.target.value as "Purchase Invoice" | "Tax Invoice")}><option value="Purchase Invoice">Without Tax / بغیر ٹیکس</option><option value="Tax Invoice">With Tax / ٹیکس کے ساتھ</option></select></div></div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3"><div><label className="label">Reference Name</label><input className="input" value={referenceName} disabled={locked} onChange={(e) => setReferenceName(e.target.value)} /></div><div><label className="label">Reference No.</label><input className="input" value={referenceNo} disabled={locked} onChange={(e) => setReferenceNo(e.target.value)} /></div><div><label className="label">Notes</label><input className="input" value={referenceNotes} disabled={locked} onChange={(e) => setReferenceNotes(e.target.value)} /></div></div>
        {invoiceType === "Tax Invoice" && <div className="max-w-xs"><label className="label">Configured VAT %</label><input className="input cursor-not-allowed bg-slate-50" disabled value={taxPercent} /></div>}
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="py-2 text-left">Item</th><th>Godown</th><th className="text-right">Qty</th><th className="text-right">Unit Cost</th>{invoiceType === "Tax Invoice" && <><th className="text-right">VAT %</th><th className="text-right">VAT Amount</th></>}<th className="text-right">Amount</th><th /></tr></thead><tbody>{rows.map((row, index) => { const base = n(row.qty) * n(row.unit_cost); const tax = invoiceType === "Tax Invoice" ? base * n(row.tax_percent) / 100 : 0; return <tr key={index} className="border-b border-slate-100"><td className="py-2 pr-2"><select className="input" disabled={locked} value={row.item_id} onChange={(e) => updateRow(index, "item_id", e.target.value)}><option value="">— Select —</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` (${item.sku})` : ""}</option>)}</select></td><td className="px-2"><select className="input" disabled={locked} value={row.godown_id} onChange={(e) => updateRow(index, "godown_id", e.target.value)}><option value="">— Select —</option>{godowns.map((godown) => <option key={godown.id} value={godown.id}>{godown.name}</option>)}</select></td><td className="px-2"><input className="input w-24 text-right" type="number" step="0.01" disabled={locked} value={row.qty} onChange={(e) => updateRow(index, "qty", e.target.value)} /></td><td className="px-2"><input className="input w-28 text-right" type="number" step="0.01" disabled={locked} value={row.unit_cost} onChange={(e) => updateRow(index, "unit_cost", e.target.value)} /></td>{invoiceType === "Tax Invoice" && <><td className="px-2 text-right">{n(row.tax_percent)}%</td><td className="px-2 text-right">{formatCurrency(tax)}</td></>}<td className="px-2 text-right font-medium">{formatCurrency(base + tax)}</td><td className="pl-2">{!locked && rows.length > 1 && <button type="button" className="text-error-600" onClick={() => setRows(rows.filter((_, i) => i !== index))}>Remove</button>}</td></tr>; })}</tbody></table></div>
        {!locked && <button type="button" className="btn-secondary" onClick={() => setRows([...rows, emptyRow(invoiceType === "Tax Invoice" ? taxPercent : "0", godowns[0]?.id ?? "")])}>+ Add Row</button>}
        <div className="ml-auto max-w-sm space-y-2"><div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>{invoiceType === "Tax Invoice" && <div className="flex justify-between"><span>VAT Amount</span><span>{formatCurrency(itemTax)}</span></div>}<div className="flex justify-between border-t pt-2 text-lg font-bold"><span>Total</span><span>{formatCurrency(total)}</span></div></div>
        {!locked && <div className="flex justify-end"><button className="btn-primary" disabled={saving}>{saving ? "Saving..." : "Save Consolidated Purchase"}</button></div>}
      </form>}

      <div className="card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-slate-50"><th className="p-3 text-left">Invoice</th><th className="p-3 text-left">Supplier</th><th className="p-3 text-left">Date</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Status</th><th className="p-3 text-right">VAT</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={8} className="p-8 text-center text-slate-400">Loading…</td></tr> : invoices.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-slate-400">No Consolidated Purchase Invoices yet.</td></tr> : invoices.map((invoice) => <tr key={invoice.id} className="border-b border-slate-100"><td className="p-3 font-medium">{invoice.invoice_no}</td><td className="p-3">{invoice.supplier?.name ?? "—"}</td><td className="p-3">{formatDate(invoice.invoice_date)}</td><td className="p-3">{invoice.invoice_type === "Tax Invoice" ? "With Tax" : "Without Tax"}</td><td className="p-3"><StatusBadge status={invoice.status} /></td><td className="p-3 text-right">{invoice.invoice_type === "Tax Invoice" ? formatCurrency(n(invoice.item_tax) + n(invoice.charge_tax)) : "—"}</td><td className="p-3 text-right font-semibold">{formatCurrency(n(invoice.total))}</td><td className="p-3 text-right"><div className="flex justify-end gap-2"><button className="btn-secondary text-xs" onClick={() => void editInvoice(invoice)}>Open</button>{invoice.status === "draft" && <button className="btn-primary text-xs" disabled={postingId === invoice.id} onClick={() => void post(invoice)}>{postingId === invoice.id ? "Posting..." : "Post / Receive Stock"}</button>}</div></td></tr>)}</tbody></table></div>
    </div>

    {showForm && editingId && <div className="hidden print:block">
      <PrintLayout
        voucherTitle={invoiceType === "Tax Invoice" ? "Purchase Tax Invoice" : "Purchase Invoice"}
        voucherNo={invoiceNo}
        voucherDate={invoiceDate}
        company={{ name: companyPrint.company_name || undefined, address: companyPrint.address || undefined, phone: companyPrint.phone || undefined, email: companyPrint.email || undefined, taxId: [companyPrint.ntn, companyPrint.strn].filter(Boolean).join(" / ") || undefined, logoUrl: companyPrint.logo_url || undefined }}
        party={{ name: currentSupplier?.name || "—", address: currentSupplier?.address, phone: currentSupplier?.phone }}
        items={rows.filter((row) => row.item_id).map((row) => { const item = items.find((candidate) => candidate.id === row.item_id); const base = n(row.qty) * n(row.unit_cost); const tax = invoiceType === "Tax Invoice" ? base * n(row.tax_percent) / 100 : 0; return { name: item?.name || "—", description: `Consolidated Purchase${godowns.find((g) => g.id === row.godown_id)?.name ? ` · ${godowns.find((g) => g.id === row.godown_id)?.name}` : ""}`, qty: n(row.qty), unitPrice: n(row.unit_cost), lineTotal: base + tax, taxPercent: invoiceType === "Tax Invoice" ? n(row.tax_percent) : 0, taxAmount: tax }; })}
        chargeBreakdown={[]}
        itemsTotal={subtotal}
        chargesTotal={0}
        taxAmount={itemTax}
        showTaxSummary={invoiceType === "Tax Invoice"}
        grandTotal={total}
        extraFields={[{ label: "Document / دستاویز", value: "Consolidated Purchase" }, { label: "Status / حیثیت", value: currentInvoice?.status?.toUpperCase() || "DRAFT" }, ...(referenceName ? [{ label: "Reference Name / حوالہ نام", value: referenceName }] : []), ...(referenceNo ? [{ label: "Reference No / ریفرنس نمبر", value: referenceNo }] : []), ...(invoiceType === "Tax Invoice" ? [{ label: "VAT Rate / ٹیکس شرح", value: `${n(taxPercent)}% (Fixed)` }] : [])]}
        documentNotice="Separate receiving document. Accounting is created only after linking to and posting the Main Purchase Invoice."
        documentNoticeUrdu="یہ الگ وصولی دستاویز ہے۔ اکاؤنٹنگ صرف مین پرچیز انوائس سے لنک اور پوسٹ ہونے کے بعد بنے گی۔"
        signatureLabels={[companyPrint.prepared_by_label || "Prepared By / تیار کردہ", companyPrint.checked_by_label || "Checked By / جانچ کردہ", companyPrint.approved_by_label || "Approved By / منظور کردہ"]}
        visibility={{ showCompanyName: printVisibility.show_company_name, showLogo: printVisibility.show_logo, showAddress: printVisibility.show_address, showPhoneEmail: printVisibility.show_phone_email, showTaxDetails: printVisibility.show_tax_details, showHeader: printVisibility.show_header, showFooter: printVisibility.show_footer, showSignatures: printVisibility.show_signatures, showPrintDatetime: printVisibility.show_print_datetime, showPageNumbers: printVisibility.show_page_numbers }}
        documentHeader={companyPrint.document_header}
        documentHeaderUrdu={companyPrint.document_header_urdu}
        documentFooter={companyPrint.document_footer}
        documentFooterUrdu={companyPrint.document_footer_urdu}
      />
    </div>}
  </div>;
}
