import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { ErrorBanner, StatusBadge, formatCurrency, formatDate } from "@/components/ui";
import { exportToCSV, exportToExcel } from "@/lib/exportUtils";
import { chargesFromRecord, getChargeBreakdown } from "@/lib/chargeTypes";
import PrintLayout from "@/components/PrintLayout";

type PurchaseOrder = {
  id: string;
  order_no: string;
  order_date: string;
  supplier_id: string | null;
  status: string;
  invoice_type?: "Purchase Invoice" | "Tax Invoice" | null;
  tax_percent?: number | string | null;
  total: number | string;
  paid_amount?: number | string | null;
  outstanding_amount?: number | string | null;
  payment_status?: string | null;
  supplier?: { id: string; name: string; phone?: string | null; address?: string | null } | null;
  loading_charge?: number | string | null;
  unloading_charge?: number | string | null;
  cutting_charge?: number | string | null;
  transport_charge?: number | string | null;
  labour_charge?: number | string | null;
  handling_charge?: number | string | null;
  other_charge?: number | string | null;
};

type Line = {
  id: string;
  item_id: string | null;
  godown_id: string | null;
  qty: number | string;
  unit_cost: number | string;
  tax_percent?: number | string | null;
  line_total: number | string;
  source_consolidated_purchase_invoice_id?: string | null;
  item?: { id: string; name: string; sku?: string | null } | null;
  godown?: { id: string; name: string } | null;
};

type Option = { id: string; name: string; sku?: string | null; cost?: number | string | null };
type Godown = { id: string; name: string };
type Consolidated = {
  id: string;
  invoice_no: string;
  invoice_date: string;
  reference_name: string | null;
  reference_no: string | null;
  total: number | string;
  linked_purchase_order_id: string | null;
  invoice_type?: "Purchase Invoice" | "Tax Invoice" | null;
};
type PaymentAccount = { account_id: string; mapping_key: "cash" | "bank"; label: string };
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
const n = (value: unknown) => Number(value) || 0;

export default function PurchaseInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [items, setItems] = useState<Option[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [consolidated, setConsolidated] = useState<Consolidated[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newLine, setNewLine] = useState({ item_id: "", godown_id: "", qty: "1", unit_cost: "0" });
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [companyPrint, setCompanyPrint] = useState<CompanyPrintSettings>({});
  const [printVisibility, setPrintVisibility] = useState<PrintVisibility>(DEFAULT_PRINT_VISIBILITY);
  const [loading, setLoading] = useState(true);
  const [savingLinks, setSavingLinks] = useState(false);
  const [posting, setPosting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadPrintSettings = useCallback(async () => {
    const [companyRes, visibilityRes] = await Promise.all([
      supabase.from("company_settings").select("*").maybeSingle(),
      supabase.from("document_print_visibility").select("*").eq("document_type", "purchase_invoice").maybeSingle(),
    ]);
    if (!companyRes.error) setCompanyPrint((companyRes.data || {}) as CompanyPrintSettings);
    if (!visibilityRes.error) setPrintVisibility({ ...DEFAULT_PRINT_VISIBILITY, ...(visibilityRes.data || {}) });
  }, []);

  const loadPaymentAccounts = useCallback(async () => {
    const { data: mappings, error: mapError } = await supabase
      .from("account_mappings")
      .select("mapping_key,account_id")
      .in("mapping_key", ["cash", "bank"]);
    if (mapError || !mappings?.length) {
      setPaymentAccounts([]);
      return;
    }
    const ids = mappings.map((row: any) => row.account_id).filter(Boolean);
    const { data: accounts } = await supabase.from("chart_of_accounts").select("id,code,name").in("id", ids);
    const byId = new Map((accounts ?? []).map((account: any) => [account.id, account]));
    const rows = mappings.map((row: any) => {
      const account = byId.get(row.account_id) as any;
      return {
        account_id: row.account_id,
        mapping_key: row.mapping_key as "cash" | "bank",
        label: `${row.mapping_key === "cash" ? "Cash" : "Bank"} — ${account?.code ? `${account.code} · ` : ""}${account?.name || "Configured Account"}`,
      };
    });
    setPaymentAccounts(rows);
    setPaymentAccountId((current) => current || rows[0]?.account_id || "");
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const [orderRes, linesRes, itemsRes, godownRes] = await Promise.all([
      supabase.from("purchase_orders").select("*, supplier:suppliers(id,name,phone,address)").eq("id", id).maybeSingle(),
      supabase.from("purchase_order_lines").select("*, item:items(id,name,sku), godown:godowns(id,name)").eq("order_id", id).order("created_at"),
      supabase.from("items").select("id,name,sku,cost").order("name"),
      supabase.from("godowns").select("id,name").order("name"),
    ]);
    const firstError = orderRes.error || linesRes.error || itemsRes.error || godownRes.error;
    if (firstError) { setError(firstError.message); setLoading(false); return; }
    const loadedOrder = orderRes.data as PurchaseOrder | null;
    setOrder(loadedOrder);
    setLines((linesRes.data ?? []) as Line[]);
    setItems((itemsRes.data ?? []) as Option[]);
    const loadedGodowns = (godownRes.data ?? []) as Godown[];
    setGodowns(loadedGodowns);
    setNewLine((current) => ({ ...current, godown_id: current.godown_id || loadedGodowns[0]?.id || "" }));
    if (loadedOrder?.supplier_id) {
      const { data, error: consolidatedError } = await supabase.rpc("get_available_consolidated_purchase_invoices", { p_supplier_id: loadedOrder.supplier_id, p_order_id: id });
      if (consolidatedError) setError(consolidatedError.message);
      else {
        const type = loadedOrder.invoice_type === "Tax Invoice" ? "Tax Invoice" : "Purchase Invoice";
        const rows = ((data ?? []) as Consolidated[]).filter((row) => !row.invoice_type || row.invoice_type === type);
        setConsolidated(rows);
        setSelectedIds(rows.filter((row) => row.linked_purchase_order_id === id).map((row) => row.id));
      }
    } else { setConsolidated([]); setSelectedIds([]); }
    setLoading(false);
  }, [id]);

  useEffect(() => { void Promise.all([load(), loadPrintSettings(), loadPaymentAccounts()]); }, [load, loadPrintSettings, loadPaymentAccounts]);

  const invoiceType = order?.invoice_type === "Tax Invoice" ? "Tax Invoice" : "Purchase Invoice";
  const isTax = invoiceType === "Tax Invoice";
  const directLines = lines.filter((line) => !line.source_consolidated_purchase_invoice_id);
  const linkedLines = lines.filter((line) => Boolean(line.source_consolidated_purchase_invoice_id));
  const charges = order ? getChargeBreakdown(chargesFromRecord(order as unknown as Record<string, unknown>), "purchase") : [];
  const chargeTotal = charges.reduce((sum, charge) => sum + n(charge.amount), 0);
  const directBase = directLines.reduce((sum, line) => sum + n(line.line_total), 0);
  const linkedBase = linkedLines.reduce((sum, line) => sum + n(line.line_total), 0);
  const directVat = isTax ? directLines.reduce((sum, line) => sum + n(line.line_total) * n(line.tax_percent) / 100, 0) : 0;
  const linkedVat = isTax ? linkedLines.reduce((sum, line) => sum + n(line.line_total) * n(line.tax_percent) / 100, 0) : 0;
  const chargeVat = isTax ? chargeTotal * n(order?.tax_percent) / 100 : 0;
  const totalVat = directVat + linkedVat + chargeVat;
  const computedTotal = directBase + linkedBase + totalVat + chargeTotal;
  const outstanding = n(order?.outstanding_amount ?? (order?.status === "posted" ? order?.total : 0));

  const addLine = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id || !order || order.status === "posted") return;
    if (!newLine.item_id || !newLine.godown_id) { setError("Item aur destination godown select karein."); return; }
    const qty = n(newLine.qty); const cost = n(newLine.unit_cost);
    if (qty <= 0 || cost < 0) { setError("Quantity/cost invalid hai."); return; }
    const { error: insertError } = await supabase.from("purchase_order_lines").insert({ order_id: id, item_id: newLine.item_id, godown_id: newLine.godown_id, qty, unit_cost: cost, tax_percent: isTax ? n(order.tax_percent) : 0, line_total: qty * cost });
    if (insertError) { setError(insertError.message); return; }
    setNewLine({ item_id: "", godown_id: godowns[0]?.id || "", qty: "1", unit_cost: "0" });
    await load();
  };

  const removeLine = async (lineId: string) => {
    if (order?.status === "posted") return;
    const { error: removeError } = await supabase.from("purchase_order_lines").delete().eq("id", lineId);
    if (removeError) setError(removeError.message); else await load();
  };

  const saveConsolidated = async () => {
    if (!id || order?.status === "posted") return;
    setSavingLinks(true); setError(null); setSuccess(null);
    const { error: linkError } = await supabase.rpc("replace_purchase_order_consolidated_invoices", { p_order_id: id, p_consolidated_invoice_ids: selectedIds });
    setSavingLinks(false);
    if (linkError) { setError(linkError.message); return; }
    setSuccess("Consolidated Purchase selection saved. Linked stock will not be received twice.");
    await load();
  };

  const post = async () => {
    if (!id || order?.status === "posted") return;
    if (!window.confirm("Post Main Purchase Invoice? Is ke baad stock/accounting lock ho jayegi.")) return;
    setPosting(true); setError(null); setSuccess(null);
    const { data, error: postError } = await supabase.rpc("post_purchase_invoice", { p_order_id: id });
    setPosting(false);
    if (postError) { setError(postError.message); return; }
    const result = data as any;
    setSuccess(`Purchase Invoice posted${result?.journal_entry_no ? ` — ${result.journal_entry_no}` : ""}.`);
    await load();
  };

  const paySupplier = async () => {
    if (!order?.supplier_id || order.status !== "posted") return;
    const amount = n(paymentAmount);
    const account = paymentAccounts.find((row) => row.account_id === paymentAccountId);
    if (amount <= 0 || amount > outstanding + 0.005) { setError("Payment amount outstanding se zyada ya invalid hai."); return; }
    if (!account) { setError("Cash/Bank payment account select karein."); return; }
    setPaying(true); setError(null); setSuccess(null);
    const { error: paymentError } = await supabase.rpc("pay_supplier", {
      p_supplier_id: order.supplier_id,
      p_payment_date: new Date().toISOString().slice(0, 10),
      p_payment_account_id: account.account_id,
      p_payment_method: account.mapping_key === "cash" ? "Cash" : "Bank",
      p_reference: null,
      p_description: `Payment against ${order.order_no}`,
      p_notes: null,
      p_purchase_order_id: order.id,
      p_amount: amount,
    });
    setPaying(false);
    if (paymentError) setError(paymentError.message);
    else { setPaymentAmount(""); setSuccess("Supplier payment posted."); await load(); }
  };

  const rowsForExport = lines.map((line) => ({
    source: line.source_consolidated_purchase_invoice_id ? "Consolidated" : "Direct",
    item: line.item?.name ?? "—", godown: line.godown?.name ?? "—", qty: n(line.qty), unit_cost: n(line.unit_cost),
    vat_percent: isTax ? n(line.tax_percent) : 0,
    vat_amount: isTax ? n(line.line_total) * n(line.tax_percent) / 100 : 0,
    base_amount: n(line.line_total), amount_incl_vat: n(line.line_total) + (isTax ? n(line.line_total) * n(line.tax_percent) / 100 : 0),
  }));
  const exportColumns = [
    { key: "source", label: "Source" }, { key: "item", label: "Item" }, { key: "godown", label: "Godown" }, { key: "qty", label: "Qty" }, { key: "unit_cost", label: "Unit Cost" },
    ...(isTax ? [{ key: "vat_percent", label: "VAT %" }, { key: "vat_amount", label: "VAT Amount" }] : []),
    { key: "base_amount", label: "Base Amount" }, { key: "amount_incl_vat", label: "Amount Incl VAT" },
  ];

  const printInvoice = async () => {
    await loadPrintSettings();
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  if (loading) return <div className="card p-12 text-center text-slate-400">Loading Purchase Invoice…</div>;
  if (!order) return <ErrorBanner message="Purchase Invoice not found." />;

  return <div className="space-y-5">
    <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
      <div><Link to="/purchase" className="text-sm text-primary-600">← Back to Purchase</Link><h1 className="mt-2 text-2xl font-bold text-slate-900">{isTax ? "Purchase Tax Invoice" : "Purchase Invoice"} / خریداری انوائس</h1><div className="mt-1 text-sm text-slate-500">{order.order_no} · Supplier: {order.supplier?.name ?? "—"}</div></div>
      <div className="flex flex-wrap gap-2">
        {order.status !== "posted" && <button className="btn-primary" disabled={posting} onClick={() => void post()}>{posting ? "Posting…" : "Post Purchase Invoice"}</button>}
        <button className="btn-secondary" onClick={() => exportToCSV(`${order.order_no}-purchase.csv`, exportColumns, rowsForExport)}>CSV</button>
        <button className="btn-secondary" onClick={() => exportToExcel(`${order.order_no}-purchase.xls`, exportColumns, rowsForExport)}>Excel</button>
        <button className="btn-secondary" onClick={() => void printInvoice()}>Print / PDF</button>
        {order.status !== "posted" && <button className="btn-danger" onClick={async () => { if (!window.confirm("Delete this draft Purchase Invoice?")) return; const { error: delError } = await supabase.from("purchase_orders").delete().eq("id", order.id); if (delError) setError(delError.message); else navigate("/purchase"); }}>Delete</button>}
      </div>
    </div>

    <div className="print:hidden">
      {error && <ErrorBanner message={error} />}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{success}</div>}

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-6">
        <div className="card p-4"><div className="text-xs text-slate-500">Invoice Type</div><div className="mt-1 font-semibold">{isTax ? "With Tax" : "Without Tax"}</div></div>
        <div className="card p-4"><div className="text-xs text-slate-500">VAT Rate</div><div className="mt-1 font-semibold">{isTax ? `${n(order.tax_percent)}% (Fixed)` : "—"}</div></div>
        <div className="card p-4"><div className="text-xs text-slate-500">Date</div><div className="mt-1 font-semibold">{formatDate(order.order_date)}</div></div>
        <div className="card p-4"><div className="text-xs text-slate-500">Status</div><div className="mt-1"><StatusBadge status={order.status as any} /></div></div>
        <div className="card p-4"><div className="text-xs text-slate-500">Paid</div><div className="mt-1 font-semibold">{formatCurrency(n(order.paid_amount))}</div></div>
        <div className="card p-4"><div className="text-xs text-slate-500">Outstanding</div><div className="mt-1 font-semibold">{formatCurrency(outstanding)}</div></div>
      </div>

      {order.status === "posted" && outstanding > 0 && <div className="card mt-5 p-5">
        <h2 className="font-bold text-slate-900">Supplier Payment</h2>
        <p className="mt-1 text-xs text-slate-500">Payment timing invoice tax type se separate hai. Cash ya Bank account explicitly select karein.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div><label className="label">Amount</label><input className="input text-right" type="number" min="0.01" max={outstanding} step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder={outstanding.toFixed(2)} /></div>
          <div><label className="label">Payment Account</label><select className="input" value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)}><option value="">— Select Cash / Bank —</option>{paymentAccounts.map((account) => <option key={`${account.mapping_key}-${account.account_id}`} value={account.account_id}>{account.label}</option>)}</select></div>
          <div className="flex items-end"><button className="btn-primary w-full" disabled={paying || !paymentAmount || !paymentAccountId} onClick={() => void paySupplier()}>{paying ? "Posting Payment…" : "Pay Supplier"}</button></div>
        </div>
      </div>}

      <div className="card mt-5 p-6">
        <div className="mb-4"><h2 className="font-bold text-slate-900">Main Purchase Invoice Items</h2><p className="text-xs text-slate-500">Direct items entered on this Main Invoice.</p></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-slate-500"><th className="py-2 text-left">Item</th><th className="text-left">Godown</th><th className="text-right">Qty</th><th className="text-right">Unit Cost</th>{isTax && <><th className="text-right">VAT %</th><th className="text-right">VAT Amount</th></>}<th className="text-right">Amount</th><th /></tr></thead><tbody>{directLines.length === 0 ? <tr><td colSpan={isTax ? 8 : 6} className="py-6 text-center text-slate-400">No direct items yet.</td></tr> : directLines.map((line) => <tr key={line.id} className="border-b border-slate-100"><td className="py-3">{line.item?.name ?? "—"}</td><td>{line.godown?.name ?? "—"}</td><td className="text-right">{line.qty}</td><td className="text-right">{formatCurrency(n(line.unit_cost))}</td>{isTax && <><td className="text-right">{n(line.tax_percent)}%</td><td className="text-right">{formatCurrency(n(line.line_total) * n(line.tax_percent) / 100)}</td></>}<td className="text-right font-semibold">{formatCurrency(n(line.line_total) + (isTax ? n(line.line_total) * n(line.tax_percent) / 100 : 0))}</td><td className="text-right">{order.status !== "posted" && <button className="text-rose-600" onClick={() => void removeLine(line.id)}>Remove</button>}</td></tr>)}</tbody></table></div>
        {order.status !== "posted" && <form onSubmit={addLine} className="mt-5 grid grid-cols-1 gap-3 border-t pt-5 md:grid-cols-6"><div className="md:col-span-2"><label className="label">Item</label><select className="input" required value={newLine.item_id} onChange={(e) => { const item = items.find((candidate) => candidate.id === e.target.value); setNewLine({ ...newLine, item_id: e.target.value, unit_cost: item ? String(n(item.cost)) : newLine.unit_cost }); }}><option value="">— Select item —</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` (${item.sku})` : ""}</option>)}</select></div><div><label className="label">Godown</label><select className="input" required value={newLine.godown_id} onChange={(e) => setNewLine({ ...newLine, godown_id: e.target.value })}><option value="">— Select —</option>{godowns.map((godown) => <option key={godown.id} value={godown.id}>{godown.name}</option>)}</select></div><div><label className="label">Qty</label><input className="input text-right" type="number" step="0.01" min="0.01" required value={newLine.qty} onChange={(e) => setNewLine({ ...newLine, qty: e.target.value })} /></div><div><label className="label">Unit Cost</label><input className="input text-right" type="number" step="0.01" min="0" required value={newLine.unit_cost} onChange={(e) => setNewLine({ ...newLine, unit_cost: e.target.value })} /></div><div className="flex items-end"><button className="btn-primary w-full" type="submit">Add Line</button></div>{isTax && <div className="md:col-span-6 text-xs font-medium text-slate-500">VAT {n(order.tax_percent)}% Tax Settings se fixed hai; line par manually edit nahi hoga.</div>}</form>}
      </div>

      <div className="card mt-5 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">Consolidated Purchase Invoices</h2><p className="text-xs text-slate-500">Separate posted documents. Main Invoice mein baad mein add hote hain; stock dobara receive nahi hota.</p></div><Link to="/purchase/consolidated" className="btn-secondary">Open Consolidated Purchase</Link></div>
        {consolidated.length === 0 ? <div className="py-4 text-sm text-slate-400">Is supplier aur isi tax type ke liye koi available posted Consolidated Purchase nahi.</div> : <div className="space-y-2">{consolidated.map((invoice) => <label key={invoice.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3"><span className="flex items-center gap-3"><input type="checkbox" disabled={order.status === "posted"} checked={selectedIds.includes(invoice.id)} onChange={(e) => setSelectedIds((current) => e.target.checked ? [...current, invoice.id] : current.filter((value) => value !== invoice.id))} /><span><span className="font-semibold">{invoice.invoice_no}</span><span className="ml-2 text-xs text-slate-500">{formatDate(invoice.invoice_date)}{invoice.reference_no ? ` · ${invoice.reference_no}` : ""}</span></span></span><span className="font-semibold">{formatCurrency(n(invoice.total))}</span></label>)}</div>}
        {order.status !== "posted" && consolidated.length > 0 && <div className="mt-4 flex justify-end"><button className="btn-primary" disabled={savingLinks} onClick={() => void saveConsolidated()}>{savingLinks ? "Saving…" : "Save Consolidated Selection"}</button></div>}
        {linkedLines.length > 0 && <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm"><div className="font-semibold text-slate-700">Linked consolidated item lines: {linkedLines.length}</div><div className="mt-1 text-xs text-slate-500">Ye accounting total mein included hain, lekin Main posting par inka stock movement repeat nahi hota.</div></div>}
      </div>

      <div className="card mt-5 p-6"><h2 className="mb-4 font-bold text-slate-900">Invoice Summary</h2><div className="ml-auto max-w-md space-y-2 text-sm"><div className="flex justify-between"><span>Direct Items</span><span>{formatCurrency(directBase)}</span></div><div className="flex justify-between"><span>Linked Consolidated Items</span><span>{formatCurrency(linkedBase)}</span></div>{charges.map((charge) => <div key={charge.label} className="flex justify-between text-slate-600"><span>{charge.label}</span><span>{formatCurrency(charge.amount)}</span></div>)}<div className="flex justify-between"><span>Charges Total</span><span>{formatCurrency(chargeTotal)}</span></div>{isTax && <><div className="flex justify-between"><span>Items VAT</span><span>{formatCurrency(directVat + linkedVat)}</span></div><div className="flex justify-between"><span>Charges VAT</span><span>{formatCurrency(chargeVat)}</span></div><div className="flex justify-between font-semibold"><span>Total VAT</span><span>{formatCurrency(totalVat)}</span></div></>}<div className="flex justify-between border-t pt-3 text-lg font-bold"><span>Grand Total</span><span>{formatCurrency(n(order.total) || computedTotal)}</span></div><div className="flex justify-between text-slate-600"><span>Paid</span><span>{formatCurrency(n(order.paid_amount))}</span></div><div className="flex justify-between font-semibold"><span>Outstanding</span><span>{formatCurrency(outstanding)}</span></div></div></div>
    </div>

    <div className="hidden print:block">
      <PrintLayout
        voucherTitle={isTax ? "Purchase Tax Invoice" : "Purchase Invoice"}
        voucherNo={order.order_no}
        voucherDate={order.order_date}
        company={{
          name: companyPrint.company_name || undefined,
          address: companyPrint.address || undefined,
          phone: companyPrint.phone || undefined,
          email: companyPrint.email || undefined,
          taxId: [companyPrint.ntn, companyPrint.strn].filter(Boolean).join(" / ") || undefined,
          logoUrl: companyPrint.logo_url || undefined,
        }}
        party={{ name: order.supplier?.name || "—", address: order.supplier?.address, phone: order.supplier?.phone }}
        items={lines.map((line) => ({
          name: line.item?.name || "—",
          description: line.source_consolidated_purchase_invoice_id ? "Consolidated Purchase" : "Main Purchase",
          qty: n(line.qty),
          unitPrice: n(line.unit_cost),
          lineTotal: n(line.line_total) + (isTax ? n(line.line_total) * n(line.tax_percent) / 100 : 0),
          taxPercent: isTax ? n(line.tax_percent) : 0,
          taxAmount: isTax ? n(line.line_total) * n(line.tax_percent) / 100 : 0,
        }))}
        chargeBreakdown={charges}
        itemsTotal={directBase + linkedBase}
        chargesTotal={chargeTotal}
        taxAmount={totalVat}
        showTaxSummary={isTax}
        grandTotal={n(order.total) || computedTotal}
        extraFields={[
          { label: "Status / حیثیت", value: order.status.toUpperCase() },
          { label: "Type / قسم", value: isTax ? "With Tax" : "Without Tax" },
          ...(isTax ? [{ label: "VAT Rate / ٹیکس شرح", value: `${n(order.tax_percent)}% (Fixed)` }] : []),
        ]}
        paymentSummary={{ totalReceived: n(order.paid_amount), currentOutstanding: outstanding }}
        signatureLabels={[companyPrint.prepared_by_label || "Prepared By / تیار کردہ", companyPrint.checked_by_label || "Checked By / جانچ کردہ", companyPrint.approved_by_label || "Approved By / منظور کردہ"]}
        visibility={{
          showCompanyName: printVisibility.show_company_name,
          showLogo: printVisibility.show_logo,
          showAddress: printVisibility.show_address,
          showPhoneEmail: printVisibility.show_phone_email,
          showTaxDetails: printVisibility.show_tax_details,
          showHeader: printVisibility.show_header,
          showFooter: printVisibility.show_footer,
          showSignatures: printVisibility.show_signatures,
          showPrintDatetime: printVisibility.show_print_datetime,
          showPageNumbers: printVisibility.show_page_numbers,
        }}
        documentHeader={companyPrint.document_header}
        documentHeaderUrdu={companyPrint.document_header_urdu}
        documentFooter={companyPrint.document_footer}
        documentFooterUrdu={companyPrint.document_footer_urdu}
      />
    </div>
  </div>;
}
