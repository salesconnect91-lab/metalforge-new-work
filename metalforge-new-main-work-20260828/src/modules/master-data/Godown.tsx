import { Routes, Route, NavLink } from "react-router-dom";
import WarehouseStock from "../godown/WarehouseStock";
import StockMovements from "../godown/StockMovements";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import DataTable, { Column } from "@/components/DataTable";
import { Modal, ErrorBanner, ConfirmModal } from "@/components/ui";
import { Printer, FileSpreadsheet, Building2, Plus } from "lucide-react";

export default function Godown() {
  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-slate-200 overflow-x-auto">
        <TabLink to="/godown" end label="Warehouse Stock / ویئرہاؤس اسٹاک" />
        <TabLink to="/godown/movements" label="Stock Movements / اسٹاک موومنٹس" />
        <TabLink to="/godown/aging" label="Stock Aging Report / اسٹاک ایجنگ رپورٹ" />
        <TabLink to="/godown/master" label="Godowns Master / گودام ماسٹر" />
      </div>
      <Routes>
        <Route path="/" element={<WarehouseStock />} />
        <Route path="/movements" element={<StockMovements />} />
        <Route path="/aging" element={<StockAgingReport />} />
        <Route path="/master" element={<GodownsMasterPage />} />
      </Routes>
    </div>
  );
}

function TabLink({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <span
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer inline-block whitespace-nowrap ${
            isActive ? "border-primary-600 text-primary-600" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          {label}
        </span>
      )}
    </NavLink>
  );
}

// 1. Godowns Master Page Component (Naye warehouses/godowns add karne ke liye)
interface WarehouseRow {
  id: string;
  name: string;
  location: string | null;
}

interface GodownRow {
  id: string;
  name: string;
  location: string | null;
  warehouse_id: string | null;
  warehouse?: WarehouseRow | null;
  created_at: string;
}

function GodownsMasterPage() {
  const [rows, setRows] = useState<GodownRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GodownRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [form, setForm] = useState({
    name: "",
    location: "",
    warehouse_id: "",
  });

  const fetchGodowns = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Fetch godowns and warehouses separately. This avoids relying on
    // Supabase's embedded-relation response shape.
    const [godownRes, warehouseRes] = await Promise.all([
      supabase
        .from("godowns")
        .select("id, name, location, warehouse_id, created_at")
        .order("name", { ascending: true }),
      supabase
        .from("warehouses")
        .select("id, name, location")
        .order("name", { ascending: true }),
    ]);

    if (godownRes.error) {
      setError(`Unable to load godowns: ${godownRes.error.message}`);
      setRows([]);
      setLoading(false);
      return;
    }

    if (warehouseRes.error) {
      setError(`Unable to load warehouses: ${warehouseRes.error.message}`);
      setRows([]);
      setWarehouses([]);
      setLoading(false);
      return;
    }

    const warehouseRows = (warehouseRes.data ?? []) as unknown as WarehouseRow[];

    const warehouseMap = new Map(
      warehouseRows.map((warehouse) => [
        String(warehouse.id),
        warehouse,
      ])
    );

    const normalizedRows: GodownRow[] = (
      (godownRes.data ?? []) as unknown as Array<{
        id: string;
        name: string;
        location: string | null;
        warehouse_id: string | null;
        created_at: string;
      }>
    ).map((row) => ({
      id: String(row.id),
      name: row.name,
      location: row.location ?? null,
      warehouse_id: row.warehouse_id
        ? String(row.warehouse_id)
        : null,
      warehouse: row.warehouse_id
        ? warehouseMap.get(String(row.warehouse_id)) ?? null
        : null,
      created_at: row.created_at,
    }));

    setWarehouses(warehouseRows);
    setRows(normalizedRows);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGodowns();
  }, [fetchGodowns]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", location: "", warehouse_id: "" });
    setModalOpen(true);
  };

  const openEdit = (row: GodownRow) => {
    setEditing(row);
    setForm({
      name: row.name,
      location: row.location ?? "",
      warehouse_id: row.warehouse_id ?? "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = form.name.trim();

    if (!name) {
      setError("Godown name is required.");
      return;
    }

    if (!form.warehouse_id) {
      setError("Please select a warehouse for this godown.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let duplicateQuery = supabase
        .from("godowns")
        .select("id")
        .eq("warehouse_id", form.warehouse_id)
        .ilike("name", name)
        .limit(1);

      if (editing) {
        duplicateQuery = duplicateQuery.neq("id", editing.id);
      }

      const { data: duplicate, error: duplicateError } =
        await duplicateQuery;

      if (duplicateError) throw duplicateError;

      if ((duplicate ?? []).length > 0) {
        throw new Error(
          `Godown "${name}" already exists in this warehouse.`
        );
      }

      const payload = {
        name,
        location: form.location.trim() || null,
        warehouse_id: form.warehouse_id,
      };

      if (editing) {
        const { error } = await supabase
          .from("godowns")
          .update(payload)
          .eq("id", editing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("godowns")
          .insert(payload);

        if (error) throw error;
      }

      setModalOpen(false);
      setEditing(null);
      setForm({
        name: "",
        location: "",
        warehouse_id: "",
      });

      await fetchGodowns();
    } catch (error: unknown) {
      const dbError =
        error && typeof error === "object"
          ? (error as { code?: string; message?: string })
          : null;

      if (dbError?.code === "23505") {
        setError(
          "A godown with this name already exists in the selected warehouse."
        );
      } else {
        setError(
          dbError?.message ??
            (error instanceof Error
              ? error.message
              : "Unable to save godown.")
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    setSaving(true);
    setError(null);

    try {
      const { error } = await supabase
        .from("godowns")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;

      setDeleteId(null);
      await fetchGodowns();
    } catch (error: unknown) {
      const dbError =
        error && typeof error === "object"
          ? (error as { code?: string; message?: string })
          : null;

      if (dbError?.code === "23503") {
        setError(
          "This godown is already used in stock or transactions and cannot be deleted."
        );
      } else {
        setError(
          dbError?.message ??
            (error instanceof Error
              ? error.message
              : "Unable to delete godown.")
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<GodownRow>[] = [
    { key: "name", label: "Godown Name / گودام نام", render: (r) => (
      <div className="flex items-center gap-2 font-medium text-slate-900">
        <Building2 className="w-4 h-4 text-primary-600" />
        {r.name}
      </div>
    )},
    {
      key: "warehouse",
      label: "Warehouse / ویئرہاؤس",
      render: (r) => (
        <span className="font-medium text-primary-700">
          {r.warehouse?.name ?? "—"}
        </span>
      ),
    },
    { key: "location", label: "Location / Address", render: (r) => r.location || "—" },
    { key: "created_at", label: "Added Date", render: (r) => new Date(r.created_at).toLocaleDateString() },
    {
      key: "actions", label: "", className: "text-right",
      render: (r) => (
        <div className="flex gap-2 justify-end">
          <button onClick={() => openEdit(r)} className="text-primary-600 hover:text-primary-700 text-sm font-medium">Edit / ترمیم</button>
          <button onClick={() => setDeleteId(r.id)} className="text-error-600 hover:text-error-700 text-sm font-medium">Delete / حذف کریں</button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Godowns Master / گودام ماسٹر</h1>
          <p className="text-sm text-slate-500 mt-1">Manage godowns and assign each godown to a warehouse / گودام منظم کریں اور ویئرہاؤس سے منسلک کریں</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Godown
        </button>
      </div>

      {error && <ErrorBanner message={error} />}
      <DataTable columns={columns} rows={rows} loading={loading} emptyMessage="No godowns found. Add your first godown." />

      <Modal open={modalOpen} title={editing ? "Edit Godown" : "Add New Godown"} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Warehouse / ویئرہاؤس</label>
            <select
              className="input"
              required
              value={form.warehouse_id}
              onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
            >
              <option value="">— Select Warehouse —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}{w.location ? ` — ${w.location}` : ""}
                </option>
              ))}
            </select>
            {warehouses.length === 0 && (
              <p className="mt-1 text-xs text-rose-600">
                No warehouses found. Create a Warehouse first.
              </p>
            )}
          </div>
          <div>
            <label className="label">Godown Name / گودام نام</label>
            <input 
              className="input" 
              required 
              value={form.name} 
              onChange={(e) => setForm({ ...form, name: e.target.value })} 
              placeholder="e.g. Godown C / مثال: گودام C" 
            />
          </div>
          <div>
            <label className="label">Location / Address (Optional) / مقام یا پتہ (اختیاری)</label>
            <input 
              className="input" 
              value={form.location} 
              onChange={(e) => setForm({ ...form, location: e.target.value })} 
              placeholder="e.g. Industrial Zone / مثال: صنعتی علاقہ" 
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel / منسوخ کریں</button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : editing
                  ? "Save Changes"
                  : "Add Godown"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal open={!!deleteId} title="Delete Godown / گودام حذف کریں" message="Are you sure you want to delete this godown? / کیا آپ یہ گودام حذف کرنا چاہتے ہیں؟" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}

// 2. Stock Aging Report Component (Aapka purana code)
interface AgingRow {
  id: string;
  item_name: string;
  sku: string;
  godown: string;
  quantity: number;
  updated_at: string;
  aging_days: number;
}

function StockAgingReport() {
  const [rows, setRows] = useState<AgingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAging() {
      setLoading(true);
      const { data } = await supabase
        .from("warehouse_stock")
        .select("*, item:items(*)")
        .order("updated_at", { ascending: true });

      if (data) {
        const now = new Date().getTime();
        const mapped = data.map((r: any) => {
          const updatedAt = new Date(r.updated_at || r.created_at).getTime();
          const diffDays = Math.floor((now - updatedAt) / (1000 * 3600 * 24));
          return {
            id: r.id,
            item_name: r.item?.name ?? "—",
            sku: r.item?.sku ?? "—",
            godown: r.godown,
            quantity: r.quantity,
            updated_at: r.updated_at,
            aging_days: diffDays >= 0 ? diffDays : 0,
          };
        });
        setRows(mapped);
      }
      setLoading(false);
    }
    fetchAging();
  }, []);

  const totalStockQty = rows.reduce((sum, r) => sum + r.quantity, 0);

  const handlePrint = () => { window.print(); };

  const handleExportExcel = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Item Name,SKU,Godown,Quantity (kg),Aging (Days)\r\n";

    rows.forEach((row) => {
      csvContent += `"${row.item_name}","${row.sku}","${row.godown}",${row.quantity},${row.aging_days}\r\n`;
    });
    csvContent += `Total Stock,,,${totalStockQty},\r\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Stock_Aging_Report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns: Column<AgingRow>[] = [
    { key: "item_name", label: "Item Name", render: (r) => <span className="font-medium text-slate-900">{r.item_name}</span> },
    { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs">{r.sku}</span> },
    { key: "godown", label: "Godown / گودام", render: (r) => <span className="badge bg-primary-100 text-primary-700">{r.godown}</span> },
    { key: "quantity", label: "Quantity (kg)", render: (r) => <span className="font-semibold">{r.quantity.toLocaleString()}</span> },
    { key: "aging_days", label: "Aging (Days)", render: (r) => (
      <span className={`badge ${r.aging_days > 90 ? "bg-rose-100 text-rose-700" : r.aging_days > 30 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
        {r.aging_days} Days
      </span>
    )},
  ];

  return (
    <div className="space-y-6">
      <div id="printable-aging" className="space-y-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Stock Aging & Total Report / اسٹاک ایجنگ اور کل رپورٹ</h1>
            <p className="text-sm text-slate-500 mt-1">Total Inventory Stock Across All Godowns: / تمام گوداموں کا کل اسٹاک:<span className="font-bold text-slate-800">{totalStockQty.toLocaleString()} kg</span></p>
          </div>
          <div className="flex items-center gap-2 no-print">
            <button onClick={handleExportExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition">
              <FileSpreadsheet className="w-4 h-4" /> Export Excel
            </button>
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 transition">
              <Printer className="w-4 h-4" />Print / پرنٹ</button>
          </div>
        </div>

        <DataTable columns={columns} rows={rows} loading={loading} emptyMessage="No stock records found for aging report." />
      </div>
    </div>
  );
}