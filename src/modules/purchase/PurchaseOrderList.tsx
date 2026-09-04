import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { PurchaseOrder } from "@/types";
import DataTable, { Column } from "@/components/DataTable";
import { PageHeader, ErrorBanner, StatusBadge, formatCurrency, formatDate } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";
import { canPerformModule } from "@/auth/permissions";

export default function PurchaseOrderList() {
  const navigate = useNavigate();
  const { activeCompany, isPlatformOwner } = useAuth();
  const canCreate = canPerformModule(activeCompany?.membership_role, "purchase", "create", activeCompany?.permissions, isPlatformOwner);
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("purchase_orders")
      .select("*, supplier:suppliers(*)")
      .order("created_at", { ascending: false });
    if (loadError) setError(loadError.message);
    else setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  const columns: Column<PurchaseOrder>[] = [
    { key: "order_no", label: "Invoice # / انوائس", render: (r) => <span className="font-medium text-primary-600">{r.order_no}</span> },
    { key: "supplier", label: "Supplier / سپلائر", render: (r) => r.supplier?.name ?? "—" },
    { key: "order_date", label: "Date / تاریخ", render: (r) => formatDate(r.order_date) },
    { key: "invoice_type", label: "Type / قسم", render: (r) => r.invoice_type === "Tax Invoice" ? "With Tax / ٹیکس کے ساتھ" : "Without Tax / بغیر ٹیکس" },
    { key: "status", label: "Status / حالت", render: (r) => <StatusBadge status={r.status} /> },
    { key: "total", label: "Total / کل", render: (r) => <span className="font-medium">{formatCurrency(r.total)}</span> },
    { key: "actions", label: "", className: "text-right", render: (r) => <button onClick={() => navigate(`/purchase/${r.id}`)} className="text-primary-600 hover:text-primary-700 text-sm font-medium">Open →</button> },
  ];

  return (
    <div>
      <PageHeader
        title="Purchase Invoices / خریداری انوائسز"
        subtitle="Main Purchase Invoices and separate Consolidated Purchase receiving workflow"
        action={canCreate ? (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigate("/purchase/consolidated")} className="btn-secondary">Consolidated Purchase / کنسولیڈیٹڈ</button>
            <button onClick={() => navigate("/purchase/new")} className="btn-primary">+ Main Purchase Invoice</button>
          </div>
        ) : null}
      />
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <strong>Main Purchase Invoice</strong> is the supplier/accounting invoice. <strong>Consolidated Purchase</strong> stays separate, receives stock first, and can be added later to a Main Purchase Invoice without receiving the same stock twice.
      </div>
      {error && <ErrorBanner message={error} />}
      <DataTable columns={columns} rows={rows} loading={loading} emptyMessage="No Main Purchase Invoices yet." />
    </div>
  );
}
