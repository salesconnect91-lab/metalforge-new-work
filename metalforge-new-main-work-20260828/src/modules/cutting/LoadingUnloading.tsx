import { useEffect, useState, useCallback } from "react";
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

export default function LoadingUnloading() {
  const [rows, setRows] = useState<GatePass[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [printPass, setPrintPass] = useState<GatePass | null>(null);
  const [gatePrintSettings, setGatePrintSettings] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    pass_no: "",
    sales_order_id: "",
    type: "loading" as GatePassType,
    godown: "Main",
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
      .select("*, sales_order:sales_orders(*, customer:customers(*))")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setRows(data ?? []);
    setLoading(false);
  }, []);

  const fetchSalesOrders = useCallback(async () => {
    const { data } = await supabase
      .from("sales_orders")
      .select("*, customer:customers(*)")
      .in("status", ["draft", "confirmed", "shipped"])
      .order("created_at", { ascending: false });
    setSalesOrders(data ?? []);
  }, []);

  useEffect(() => {
    fetchRows();
    fetchSalesOrders();
  }, [fetchRows, fetchSalesOrders]);

  const netWeight =
    (parseFloat(form.gross_weight) || 0) - (parseFloat(form.tare_weight) || 0);

  const openCreate = () => {
    setForm({
      pass_no: `GP-${String(rows.length + 1).padStart(4, "0")}`,
      sales_order_id: "",
      type: "loading",
      godown: "Main",
      vehicle_no: "",
      driver_name: "",
      tare_weight: "0",
      gross_weight: "0",
      labour_contractor: "",
      pass_date: new Date().toISOString().slice(0, 10),
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      pass_no: form.pass_no,
      sales_order_id: form.sales_order_id || null,
      type: form.type,
      godown: form.godown,
      vehicle_no: form.vehicle_no || null,
      driver_name: form.driver_name || null,
      tare_weight: parseFloat(form.tare_weight) || 0,
      gross_weight: parseFloat(form.gross_weight) || 0,
      net_weight: netWeight,
      labour_contractor: form.labour_contractor || null,
      status: "completed" as GatePassStatus,
      pass_date: form.pass_date,
    };
    const { error } = await supabase.from("gate_passes").insert(payload);
    if (error) { setError(error.message); return; }
    setModalOpen(false);
    setError(null);
    fetchRows();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("gate_passes").delete().eq("id", deleteId);
    if (error) setError(error.message);
    setDeleteId(null);
    fetchRows();
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

  const handlePrint = async (pass: GatePass) => {
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

  const handlePdf = async (pass: GatePass) => {
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
        doc.text(company.company_name || "Company", pageWidth / 2, y + 5, {
          align: "center",
        });
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
      doc.text("GATE PASS / WEIGHBRIDGE TICKET", pageWidth / 2, y, {
        align: "center",
      });

      y += 11;
      doc.setFontSize(10);

      const party = pass.sales_order?.customer;
      const details: Array<[string, string]> = [
        ["Gate Pass No", pass.pass_no],
        ["Date", pass.pass_date],
        ["Type", String(pass.type || "").toUpperCase()],
        ["Status", String(pass.status || "").toUpperCase()],
        ["Customer", party?.name || "—"],
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
        doc.text(company.document_footer, pageWidth / 2, pageHeight - 14, {
          align: "center",
        });
      }

      if (visibility.show_print_datetime) {
        doc.setFontSize(7);
        doc.text(
          `Printed: ${new Date().toLocaleString("en-PK")}`,
          left,
          pageHeight - 8,
        );
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

  const columns: Column<GatePass>[] = [
    { key: "pass_no", label: "Pass No", render: (r) => <span className="font-medium text-primary-600">{r.pass_no}</span> },
    { key: "type", label: "Type / قسم", render: (r) => <span className="capitalize">{r.type}</span> },
    { key: "godown", label: "Godown / گودام" },
    { key: "vehicle_no", label: "Vehicle", render: (r) => r.vehicle_no ?? "—" },
    { key: "tare_weight", label: "Tare (kg)", render: (r) => r.tare_weight.toLocaleString() },
    { key: "gross_weight", label: "Gross (kg)", render: (r) => r.gross_weight.toLocaleString() },
    { key: "net_weight", label: "Net (kg)", render: (r) => <span className="font-medium">{r.net_weight.toLocaleString()}</span> },
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

  const printParty: Customer | null = printPass?.sales_order?.customer ?? null;

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

      <Modal open={modalOpen} title="New Gate Pass / Weighbridge Ticket / نیا گیٹ پاس یا وزن ٹکٹ" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Pass Number / پاس نمبر</label><input className="input" required value={form.pass_no} onChange={(e) => setForm({ ...form, pass_no: e.target.value })} /></div>
            <div>
              <label className="label">Type / قسم</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as GatePassType })}>
                <option value="loading">Loading / لوڈنگ</option>
                <option value="unloading">Unloading / ان لوڈنگ</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Link to Sales Order / فروخت آرڈر سے منسلک کریں</label>
            <select className="input" value={form.sales_order_id} onChange={(e) => setForm({ ...form, sales_order_id: e.target.value })}>
              <option value="">— Select sales order —</option>
              {salesOrders.map((so) => (
                <option key={so.id} value={so.id}>{so.order_no} — {so.customer?.name ?? "No customer"}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Godown / Warehouse / گودام یا ویئرہاؤس</label><input className="input" required value={form.godown} onChange={(e) => setForm({ ...form, godown: e.target.value })} /></div>
            <div><label className="label">Labour / Contractor / مزدور یا ٹھیکیدار</label><input className="input" value={form.labour_contractor} onChange={(e) => setForm({ ...form, labour_contractor: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Vehicle Number / گاڑی نمبر</label><input className="input" value={form.vehicle_no} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })} placeholder="e.g. DL-01-AB-1234 / مثال" /></div>
            <div><label className="label">Driver Name / ڈرائیور نام</label><input className="input" value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} /></div>
          </div>
          <div><label className="label">Date / تاریخ</label><input className="input" type="date" required value={form.pass_date} onChange={(e) => setForm({ ...form, pass_date: e.target.value })} /></div>
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-700">Weighbridge Details / وزن کانٹا تفصیل</h4>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="label">Tare Weight (kg) / خالی وزن</label><input className="input text-right" type="number" step="0.01" required value={form.tare_weight} onChange={(e) => setForm({ ...form, tare_weight: e.target.value })} /></div>
              <div><label className="label">Gross Weight (kg) / مجموعی وزن</label><input className="input text-right" type="number" step="0.01" required value={form.gross_weight} onChange={(e) => setForm({ ...form, gross_weight: e.target.value })} /></div>
              <div>
                <label className="label">Net Weight (auto) / خالص وزن (خودکار)</label>
                <div className="input text-right font-bold text-primary-600 bg-primary-50 border-primary-200">{netWeight.toLocaleString()} kg</div>
              </div>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
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
            name: printParty?.name ?? "—",
            address: printParty?.address,
            phone: printParty?.phone,
            email: printParty?.email,
          }}
          items={[]}
          chargeBreakdown={[]}
          itemsTotal={0}
          chargesTotal={0}
          grandTotal={0}
          extraFields={[
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
