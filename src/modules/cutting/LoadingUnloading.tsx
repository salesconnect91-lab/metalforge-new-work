import SearchableSelect from "@/components/SearchableSelect";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { GatePass, GatePassType, GatePassStatus, SalesOrder, Customer } from "@/types";
import DataTable, { Column } from "@/components/DataTable";
import { PageHeader, Modal, ErrorBanner, StatusBadge, formatDate, ConfirmModal } from "@/components/ui";
import { exportToCSV, exportToExcel, triggerPrint } from "@/lib/exportUtils";
import PrintLayout from "@/components/PrintLayout";
import { jsPDF } from "jspdf";
import {
  loadDocumentPrintSettings,
  documentContactText,
  documentTaxText,
  documentPageFormat,
  documentOrientation,
} from "@/lib/documentPrintSettings";

type OrderBookHeader = {
  id: string;
  order_no: string;
  order_date: string;
  party_id: string;
  party_name: string;
  status: string;
  remarks?: string | null;
};

type GodownOption = {
  id: string;
  name: string;
  location?: string | null;
  warehouse_id?: string | null;
  warehouse?: { id: string; name: string } | null;
};

type GatePassRow = GatePass & {
  order_book_header_id?: string | null;
  order_book_header?: OrderBookHeader | null;
  sales_order?: (SalesOrder & { customer?: Customer | null }) | null;
};

export default function LoadingUnloading() {
  const [rows, setRows] = useState<GatePassRow[]>([]);
  const [orderBookOrders, setOrderBookOrders] = useState<OrderBookHeader[]>([]);
  const [godowns, setGodowns] = useState<GodownOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [printPass, setPrintPass] = useState<GatePassRow | null>(null);
  const [gatePrintSettings, setGatePrintSettings] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    pass_no: "",
    order_book_header_id: "",
    type: "loading" as GatePassType,
    godown_id: "",
    vehicle_no: "",
    driver_name: "",
    tare_weight: "0",
    gross_weight: "0",
    labour_contractor: "",
    pass_date: new Date().toISOString().slice(0, 10),
  });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("gate_passes")
      .select("*, sales_order:sales_orders(*, customer:customers(*)), order_book_header:order_book_headers(id,order_no,order_date,party_id,party_name,status,remarks)")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setRows((data ?? []) as GatePassRow[]);
    setLoading(false);
  }, []);

  const fetchOrderBookOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("order_book_headers")
      .select("id,order_no,order_date,party_id,party_name,status,remarks")
      .eq("order_type", "sales")
      .neq("status", "cancelled")
      .neq("status", "completed")
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
      setOrderBookOrders([]);
      return;
    }
    setOrderBookOrders((data ?? []) as OrderBookHeader[]);
  }, []);

  const fetchGodowns = useCallback(async () => {
    const { data, error } = await supabase
      .from("godowns")
      .select("id,name,location,warehouse_id,warehouse:warehouses(id,name)")
      .order("name", { ascending: true });
    if (error) {
      setError(error.message);
      setGodowns([]);
      return;
    }
    setGodowns((data ?? []) as GodownOption[]);
  }, []);

  useEffect(() => {
    void fetchRows();
    void fetchOrderBookOrders();
    void fetchGodowns();
  }, [fetchRows, fetchOrderBookOrders, fetchGodowns]);

  const netWeight =
    (parseFloat(form.gross_weight) || 0) - (parseFloat(form.tare_weight) || 0);

  const selectedOrder = useMemo(
    () => orderBookOrders.find((order) => order.id === form.order_book_header_id) ?? null,
    [orderBookOrders, form.order_book_header_id],
  );

  const selectedGodown = useMemo(
    () => godowns.find((godown) => godown.id === form.godown_id) ?? null,
    [godowns, form.godown_id],
  );

  const nextPreviewPassNo = useMemo(() => {
    const max = rows.reduce((current, row) => {
      const match = String(row.pass_no || "").match(/^GP-(\d+)$/i);
      return Math.max(current, match ? Number(match[1]) || 0 : 0);
    }, 0);
    return `GP-${String(max + 1).padStart(4, "0")}`;
  }, [rows]);

  const openCreate = () => {
    setForm({
      pass_no: nextPreviewPassNo,
      order_book_header_id: "",
      type: "loading",
      godown_id: "",
      vehicle_no: "",
      driver_name: "",
      tare_weight: "0",
      gross_weight: "0",
      labour_contractor: "",
      pass_date: new Date().toISOString().slice(0, 10),
    });
    setError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.type === "loading" && !form.order_book_header_id) {
      setError("Sales Order is required for a Loading gate pass.");
      return;
    }
    if (!selectedGodown) {
      setError("Select an approved Godown / Warehouse before creating the gate pass.");
      return;
    }
    if ((parseFloat(form.tare_weight) || 0) < 0 || (parseFloat(form.gross_weight) || 0) < 0 || netWeight < 0) {
      setError("Gross weight must be equal to or greater than tare weight.");
      return;
    }

    const payload = {
      pass_no: form.pass_no,
      sales_order_id: null,
      order_book_header_id: form.order_book_header_id || null,
      type: form.type,
      godown: selectedGodown.name,
      godown_id: selectedGodown.id,
      warehouse_id: selectedGodown.warehouse_id || null,
      vehicle_no: form.vehicle_no.trim() || null,
      driver_name: form.driver_name.trim() || null,
      tare_weight: parseFloat(form.tare_weight) || 0,
      gross_weight: parseFloat(form.gross_weight) || 0,
      net_weight: netWeight,
      labour_contractor: form.labour_contractor.trim() || null,
      status: "completed" as GatePassStatus,
      pass_date: form.pass_date,
    };
    const { error } = await supabase.from("gate_passes").insert(payload);
    if (error) {
      setError(error.message);
      return;
    }
    setModalOpen(false);
    setError(null);
    await Promise.all([fetchRows(), fetchOrderBookOrders()]);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("gate_passes").delete().eq("id", deleteId);
    if (error) setError(error.message);
    setDeleteId(null);
    void fetchRows();
  };

  const handleExportCSV = () => {
    exportToCSV(
      "gate-passes.csv",
      [
        { key: "pass_no", label: "Pass No" },
        { key: "type", label: "Type / قسم" },
        { key: "godown", label: "Godown / گودام" },
        { key: "vehicle_no", label: "Vehicle No" },
        { key: "driver_name", label: "Driver" },
        { key: "tare_weight", label: "Tare Weight" },
        { key: "gross_weight", label: "Gross Weight" },
        { key: "net_weight", label: "Net Weight" },
        { key: "labour_contractor", label: "Labour Contractor" },
        { key: "status", label: "Status / حالت" },
        { key: "pass_date", label: "Date / تاریخ" },
      ],
      rows as unknown as Record<string, unknown>[],
    );
  };

  const handleExportExcel = () => {
    exportToExcel(
      "gate-passes.xls",
      [
        { key: "pass_no", label: "Pass No" },
        { key: "type", label: "Type / قسم" },
        { key: "godown", label: "Godown / گودام" },
        { key: "vehicle_no", label: "Vehicle No" },
        { key: "driver_name", label: "Driver" },
        { key: "tare_weight", label: "Tare Weight" },
        { key: "gross_weight", label: "Gross Weight" },
        { key: "net_weight", label: "Net Weight" },
        { key: "labour_contractor", label: "Labour Contractor" },
        { key: "status", label: "Status / حالت" },
        { key: "pass_date", label: "Date / تاریخ" },
      ],
      rows as unknown as Record<string, unknown>[],
    );
  };

  const handlePrint = async (pass: GatePassRow) => {
    try {
      const settings = await loadDocumentPrintSettings("gate_pass");
      setGatePrintSettings(settings);
      setPrintPass(pass);
      setTimeout(() => {
        triggerPrint();
        setPrintPass(null);
      }, 250);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load print settings.");
    }
  };

  const handlePdf = async (pass: GatePassRow) => {
    try {
      const settings = await loadDocumentPrintSettings("gate_pass");
      const company = settings.company;
      const visibility = settings.visibility;
      const doc = new jsPDF({
        orientation: documentOrientation(company.page_orientation),
        unit: "mm",
        format: documentPageFormat(company.page_size),
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const left = 16;
      const right = pageWidth - 16;
      let y = 18;

      if (visibility.show_logo && company.logo_url) {
        try {
          const response = await fetch(company.logo_url);
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const format = blob.type.includes("jpeg") ? "JPEG" : "PNG";
          doc.addImage(dataUrl, format, left, y, 24, 18);
        } catch {
          // Continue PDF even if logo format cannot be rendered.
        }
      }

      if (visibility.show_company_name) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text(company.company_name || "Company", pageWidth / 2, y + 5, { align: "center" });
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      if (visibility.show_address && company.address) {
        y += 11;
        doc.text(company.address, pageWidth / 2, y, { align: "center" });
      }
      if (visibility.show_phone_email) {
        const contact = documentContactText(company);
        if (contact) {
          y += 5;
          doc.text(contact, pageWidth / 2, y, { align: "center" });
        }
      }
      if (visibility.show_tax_details) {
        const tax = documentTaxText(company);
        if (tax) {
          y += 5;
          doc.text(tax, pageWidth / 2, y, { align: "center" });
        }
      }
      if (visibility.show_header && company.document_header) {
        y += 7;
        doc.setFont("helvetica", "bold");
        doc.text(company.document_header, pageWidth / 2, y, { align: "center" });
      }

      y += 10;
      doc.setDrawColor(180);
      doc.line(left, y, right, y);
      y += 9;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("GATE PASS / WEIGHBRIDGE TICKET", pageWidth / 2, y, { align: "center" });
      y += 11;
      doc.setFontSize(10);

      const legacyParty = pass.sales_order?.customer;
      const partyName = pass.order_book_header?.party_name || legacyParty?.name || "—";
      const orderNo = pass.order_book_header?.order_no || pass.sales_order?.order_no || "—";
      const details: Array<[string, string]> = [
        ["Gate Pass No", pass.pass_no],
        ["Sales Order", orderNo],
        ["Date", pass.pass_date],
        ["Type", String(pass.type || "").toUpperCase()],
        ["Status", String(pass.status || "").toUpperCase()],
        ["Customer", partyName],
        ["Godown / Warehouse", pass.godown || "—"],
        ["Vehicle No", pass.vehicle_no || "—"],
        ["Driver Name", pass.driver_name || "—"],
        ["Labour / Contractor", pass.labour_contractor || "—"],
      ];

      for (const [label, value] of details) {
        doc.setFont("helvetica", "bold");
        doc.text(`${label}:`, left, y);
        doc.setFont("helvetica", "normal");
        doc.text(String(value), left + 43, y);
        y += 7;
      }

      y += 3;
      doc.setFillColor(245, 245, 245);
      doc.rect(left, y, right - left, 10, "F");
      doc.setFont("helvetica", "bold");
      doc.text("WEIGHBRIDGE DETAILS", left + 3, y + 6.5);
      y += 17;

      const weights: Array<[string, string]> = [
        ["Tare Weight", `${Number(pass.tare_weight || 0).toLocaleString()} kg`],
        ["Gross Weight", `${Number(pass.gross_weight || 0).toLocaleString()} kg`],
        ["Net Weight", `${Number(pass.net_weight || 0).toLocaleString()} kg`],
      ];
      for (const [label, value] of weights) {
        doc.setFont("helvetica", "bold");
        doc.text(`${label}:`, left, y);
        doc.setFont("helvetica", "normal");
        doc.text(value, left + 43, y);
        y += 8;
      }

      if (visibility.show_signatures) {
        y += 20;
        const prepared = company.prepared_by_label || "Weighbridge Operator";
        const approved = company.approved_by_label || "Driver Signature";
        doc.line(left, y, left + 55, y);
        doc.line(right - 55, y, right, y);
        y += 5;
        doc.setFontSize(9);
        doc.text(prepared, left + 27.5, y, { align: "center" });
        doc.text(approved, right - 27.5, y, { align: "center" });
      }
      if (visibility.show_footer && company.document_footer) {
        doc.setFontSize(8);
        doc.text(company.document_footer, pageWidth / 2, pageHeight - 14, { align: "center" });
      }
      if (visibility.show_print_datetime) {
        doc.setFontSize(7);
        doc.text(`Printed: ${new Date().toLocaleString("en-PK")}`, left, pageHeight - 8);
      }
      if (visibility.show_page_numbers) {
        doc.setFontSize(7);
        doc.text("Page 1 of 1", right, pageHeight - 8, { align: "right" });
      }
      doc.save(`${pass.pass_no}-Gate-Pass.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create Gate Pass PDF.");
    }
  };

  const columns: Column<GatePassRow>[] = [
    { key: "pass_no", label: "Pass No", render: (r) => <span className="font-medium text-primary-600">{r.pass_no}</span> },
    { key: "order", label: "Sales Order", render: (r) => r.order_book_header?.order_no || r.sales_order?.order_no || "—" },
    { key: "type", label: "Type / قسم", render: (r) => <span className="capitalize">{r.type}</span> },
    { key: "godown", label: "Godown / گودام" },
    { key: "vehicle_no", label: "Vehicle", render: (r) => r.vehicle_no ?? "—" },
    { key: "tare_weight", label: "Tare (kg)", render: (r) => Number(r.tare_weight || 0).toLocaleString() },
    { key: "gross_weight", label: "Gross (kg)", render: (r) => Number(r.gross_weight || 0).toLocaleString() },
    { key: "net_weight", label: "Net (kg)", render: (r) => <span className="font-medium">{Number(r.net_weight || 0).toLocaleString()}</span> },
    { key: "status", label: "Status / حالت", render: (r) => <StatusBadge status={r.status} /> },
    { key: "pass_date", label: "Date / تاریخ", render: (r) => formatDate(r.pass_date) },
    {
      key: "actions", label: "", className: "text-right",
      render: (r) => (
        <div className="flex gap-2 justify-end">
          <button onClick={() => void handlePrint(r)} className="text-primary-600 hover:text-primary-700 text-sm font-medium">Print / پرنٹ</button>
          <button onClick={() => void handlePdf(r)} className="text-primary-600 hover:text-primary-700 text-sm font-medium">PDF / پی ڈی ایف</button>
          <button onClick={() => setDeleteId(r.id)} className="text-error-600 hover:text-error-700 text-sm font-medium">Delete / حذف کریں</button>
        </div>
      ),
    },
  ];

  const legacyPrintParty: Customer | null = printPass?.sales_order?.customer ?? null;
  const printPartyName = printPass?.order_book_header?.party_name || legacyPrintParty?.name || "—";
  const printOrderNo = printPass?.order_book_header?.order_no || printPass?.sales_order?.order_no || "—";

  return (
    <div>
      <PageHeader
        title="Gate Pass & Weighbridge / گیٹ پاس اور وزن کانٹا"
        subtitle="Weighbridge tickets and loading/unloading gate passes / وزن کانٹا ٹکٹس اور لوڈنگ یا ان لوڈنگ گیٹ پاس"
        action={
          <div className="flex gap-2">
            <button onClick={handleExportCSV} className="btn-secondary text-sm">Export CSV / CSV ایکسپورٹ</button>
            <button onClick={handleExportExcel} className="btn-secondary text-sm">Export Excel / ایکسل ایکسپورٹ</button>
            <button onClick={openCreate} className="btn-primary">+ New Gate Pass</button>
          </div>
        }
      />
      {error && <ErrorBanner message={error} />}
      <DataTable columns={columns} rows={rows} loading={loading} emptyMessage="No gate passes yet." />

      <Modal
        open={modalOpen}
        title="New Gate Pass / Weighbridge Ticket / نیا گیٹ پاس یا وزن ٹکٹ"
        onClose={() => setModalOpen(false)}
        panelClassName="!max-w-4xl !w-[min(96vw,980px)] !p-5"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="label">Pass Number / پاس نمبر</label>
                <input className="input cursor-not-allowed bg-slate-100 font-bold text-slate-700" readOnly value={form.pass_no} />
                <div className="mt-1 text-[11px] text-slate-500">Auto generated & locked / خودکار اور لاک</div>
              </div>
              <div>
                <label className="label">Type / قسم</label>
                <SearchableSelect className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as GatePassType, order_book_header_id: e.target.value === "loading" ? form.order_book_header_id : "" })}>
                  <option value="loading">Loading / لوڈنگ</option>
                  <option value="unloading">Unloading / ان لوڈنگ</option>
                </SearchableSelect>
              </div>
              <div>
                <label className="label">Date / تاریخ</label>
                <input className="input" type="date" required value={form.pass_date} onChange={(e) => setForm({ ...form, pass_date: e.target.value })} />
              </div>
            </div>
          </div>

          {form.type === "loading" && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
              <label className="label">Link to Sales Order Book / سیلز آرڈر بک سے منسلک کریں</label>
              <SearchableSelect className="input" value={form.order_book_header_id} onChange={(e) => setForm({ ...form, order_book_header_id: e.target.value })}>
                <option value="">— Select sales order —</option>
                {orderBookOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_no} — {order.party_name} — {order.status}
                  </option>
                ))}
              </SearchableSelect>
              {selectedOrder && (
                <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-blue-100 bg-white p-3 text-sm md:grid-cols-4">
                  <div><span className="text-slate-500">Order</span><div className="font-bold">{selectedOrder.order_no}</div></div>
                  <div><span className="text-slate-500">Customer</span><div className="font-bold">{selectedOrder.party_name}</div></div>
                  <div><span className="text-slate-500">Order Date</span><div className="font-bold">{formatDate(selectedOrder.order_date)}</div></div>
                  <div><span className="text-slate-500">Status</span><div className="font-bold uppercase">{selectedOrder.status}</div></div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="label">Godown / Warehouse / گودام یا ویئرہاؤس</label>
              <SearchableSelect className="input" required value={form.godown_id} onChange={(e) => setForm({ ...form, godown_id: e.target.value })}>
                <option value="">— Select approved godown —</option>
                {godowns.map((godown) => (
                  <option key={godown.id} value={godown.id}>
                    {godown.warehouse?.name ? `${godown.warehouse.name} / ` : ""}{godown.name}{godown.location ? ` — ${godown.location}` : ""}
                  </option>
                ))}
              </SearchableSelect>
              <div className="mt-1 text-[11px] text-slate-500">Select from Godown Master only; free text is not allowed / صرف گودام ماسٹر سے انتخاب کریں</div>
              {selectedGodown && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">Selected:</span> {selectedGodown.warehouse?.name || "Warehouse"} / {selectedGodown.name}{selectedGodown.location ? ` · ${selectedGodown.location}` : ""}
                </div>
              )}
            </div>
            <div>
              <label className="label">Labour / Contractor / مزدور یا ٹھیکیدار</label>
              <input className="input" value={form.labour_contractor} onChange={(e) => setForm({ ...form, labour_contractor: e.target.value })} />
            </div>
            <div>
              <label className="label">Vehicle Number / گاڑی نمبر</label>
              <input className="input" value={form.vehicle_no} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })} placeholder="e.g. DL-01-AB-1234 / مثال" />
            </div>
            <div>
              <label className="label">Driver Name / ڈرائیور نام</label>
              <input className="input" value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-sm font-bold text-slate-800">Weighbridge Details / وزن کانٹا تفصیل</h4>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">Net = Gross − Tare</span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div><label className="label">Tare Weight (kg) / خالی وزن</label><input className="input text-right" type="number" min="0" step="0.01" required value={form.tare_weight} onChange={(e) => setForm({ ...form, tare_weight: e.target.value })} /></div>
              <div><label className="label">Gross Weight (kg) / مجموعی وزن</label><input className="input text-right" type="number" min="0" step="0.01" required value={form.gross_weight} onChange={(e) => setForm({ ...form, gross_weight: e.target.value })} /></div>
              <div>
                <label className="label">Net Weight (auto) / خالص وزن (خودکار)</label>
                <div className={`input flex items-center justify-end bg-white text-right font-black ${netWeight < 0 ? "border-rose-300 text-rose-600" : "border-blue-200 text-blue-700"}`}>{netWeight.toLocaleString()} kg</div>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 -mx-1 flex justify-end gap-3 border-t border-slate-200 bg-white/95 px-1 pt-4 backdrop-blur">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel / منسوخ کریں</button>
            <button type="submit" className="btn-primary">Create Gate Pass / گیٹ پاس بنائیں</button>
          </div>
        </form>
      </Modal>

      <ConfirmModal open={!!deleteId} title="Delete Gate Pass / گیٹ پاس حذف کریں" message="Delete this gate pass permanently? / کیا یہ گیٹ پاس مستقل حذف کرنا ہے؟" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />

      {printPass && (
        <PrintLayout
          voucherTitle="Gate Pass"
          voucherNo={printPass.pass_no}
          voucherDate={printPass.pass_date}
          company={{
            name: gatePrintSettings?.company?.company_name || "Company",
            logoUrl: gatePrintSettings?.company?.logo_url || undefined,
            address: gatePrintSettings?.company?.address || undefined,
            phone: gatePrintSettings?.company?.phone || undefined,
            email: gatePrintSettings?.company?.email || undefined,
            taxId: documentTaxText(gatePrintSettings?.company || {}) || undefined,
          }}
          visibility={{
            showCompanyName: gatePrintSettings?.visibility?.show_company_name ?? true,
            showLogo: gatePrintSettings?.visibility?.show_logo ?? true,
            showAddress: gatePrintSettings?.visibility?.show_address ?? true,
            showPhoneEmail: gatePrintSettings?.visibility?.show_phone_email ?? true,
            showTaxDetails: gatePrintSettings?.visibility?.show_tax_details ?? false,
            showHeader: gatePrintSettings?.visibility?.show_header ?? true,
            showFooter: gatePrintSettings?.visibility?.show_footer ?? true,
            showSignatures: gatePrintSettings?.visibility?.show_signatures ?? true,
            showPrintDatetime: gatePrintSettings?.visibility?.show_print_datetime ?? true,
            showPageNumbers: gatePrintSettings?.visibility?.show_page_numbers ?? true,
          }}
          documentHeader={gatePrintSettings?.company?.document_header || undefined}
          documentHeaderUrdu={gatePrintSettings?.company?.document_header_urdu || undefined}
          documentFooter={gatePrintSettings?.company?.document_footer || undefined}
          documentFooterUrdu={gatePrintSettings?.company?.document_footer_urdu || undefined}
          party={{
            name: printPartyName,
            address: legacyPrintParty?.address,
            phone: legacyPrintParty?.phone,
            email: legacyPrintParty?.email,
          }}
          items={[]}
          chargeBreakdown={[]}
          itemsTotal={0}
          chargesTotal={0}
          grandTotal={0}
          extraFields={[
            { label: "Sales Order", value: printOrderNo },
            { label: "Type / قسم", value: printPass.type },
            { label: "Godown / گودام", value: printPass.godown },
            { label: "Vehicle No", value: printPass.vehicle_no ?? "—" },
            { label: "Driver", value: printPass.driver_name ?? "—" },
            { label: "Tare Weight", value: `${printPass.tare_weight} kg` },
            { label: "Gross Weight", value: `${printPass.gross_weight} kg` },
            { label: "Net Weight", value: `${printPass.net_weight} kg` },
            { label: "Labour Contractor", value: printPass.labour_contractor ?? "—" },
          ]}
          signatureLabels={[
            gatePrintSettings?.company?.prepared_by_label || "Weighbridge Operator",
            gatePrintSettings?.company?.approved_by_label || "Driver Signature",
          ]}
        />
      )}
    </div>
  );
}
