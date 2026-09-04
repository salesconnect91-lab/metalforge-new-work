import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { PurchaseOrder, Supplier } from "@/types";
import DataTable, { Column } from "@/components/DataTable";
import { PageHeader, Modal, ErrorBanner, StatusBadge, formatCurrency, formatDate } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";
import { canPerformModule } from "@/auth/permissions";

export default function PurchaseOrderList() {
  const navigate = useNavigate();
  const { activeCompany, isPlatformOwner } = useAuth();
  const canCreate = canPerformModule(activeCompany?.membership_role, "purchase", "create", activeCompany?.permissions, isPlatformOwner);
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ order_no: "", supplier_id: "", order_date: new Date().toISOString().slice(0, 10) });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("*, supplier:suppliers(*)")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setRows(data ?? []);
    setLoading(false);
  }, []);

  const fetchSuppliers = useCallback(async () => {
    const { data } = await supabase.from("suppliers").select("*").eq("is_active", true).order("name");
    setSuppliers(data ?? []);
  }, []);

  useEffect(() => { fetchRows(); fetchSuppliers(); }, [fetchRows, fetchSuppliers]);

  const openCreate = async () => {
    setError(null);

    const { data: nextOrderNo, error: orderNoError } = await supabase.rpc(
      "next_purchase_order_no"
    );

    if (orderNoError) {
      setError(orderNoError.message);
      return;
    }

    setForm({
      order_no: nextOrderNo ?? "",
      supplier_id: "",
      order_date: new Date().toISOString().slice(0, 10),
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      order_no: form.order_no,
      supplier_id: form.supplier_id || null,
      order_date: form.order_date,
      status: "draft",
      total: 0,
    };
    const { data, error } = await supabase.from("purchase_orders").insert(payload).select().single();
    if (error) { setError(error.message); return; }
    setModalOpen(false);
    setError(null);
    navigate(`/purchase/${data.id}`);
  };

  const columns: Column<PurchaseOrder>[] = [
    { key: "order_no", label: "Order #", render: (r) => <span className="font-medium text-primary-600">{r.order_no}</span> },
    { key: "supplier", label: "Supplier / سپلائر", render: (r) => r.supplier?.name ?? "—" },
    { key: "order_date", label: "Date / تاریخ", render: (r) => formatDate(r.order_date) },
    { key: "status", label: "Status / حالت", render: (r) => <StatusBadge status={r.status} /> },
    { key: "total", label: "Total / کل", render: (r) => <span className="font-medium">{formatCurrency(r.total)}</span> },
    {
      key: "actions", label: "", className: "text-right",
      render: (r) => <button onClick={() => navigate(`/purchase/${r.id}`)} className="text-primary-600 hover:text-primary-700 text-sm font-medium">Open →</button>,
    },
  ];

  return (
    <div>
      <PageHeader title="Purchase Orders / خریداری آرڈرز" subtitle="Manage supplier orders / سپلائر آرڈرز منظم کریں" action={canCreate ? <button onClick={openCreate} className="btn-primary">+ New Purchase Order</button> : null} />
      {error && <ErrorBanner message={error} />}
      <DataTable columns={columns} rows={rows} loading={loading} emptyMessage="No purchase orders yet." />

      <Modal open={modalOpen} title="New Purchase Order / نیا خریداری آرڈر" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="label">Order Number / آرڈر نمبر</label><input className="input bg-slate-50 cursor-not-allowed" required readOnly value={form.order_no} /></div>
          <div>
            <label className="label">Supplier / سپلائر</label>
            <select className="input" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">— Select supplier —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="label">Order Date / آرڈر کی تاریخ</label><input className="input" type="date" required value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} /></div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel / منسوخ کریں</button>
            <button type="submit" className="btn-primary">Create & Open / بنائیں اور کھولیں</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
