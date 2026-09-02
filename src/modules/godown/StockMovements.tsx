import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { StockMovement, Item, StockMovementType } from "@/types";
import DataTable, { Column } from "@/components/DataTable";
import {
  PageHeader,
  Modal,
  ErrorBanner,
  formatDate,
} from "@/components/ui";
import {
  Printer,
  FileSpreadsheet,
  ArrowRightLeft,
} from "lucide-react";

interface WarehouseOption {
  id: string;
  name: string;
}

interface GodownOption {
  id: string;
  name: string;
  warehouse_id: string;
}

type ExtendedMovementType =
  | StockMovementType
  | "purchase_return"
  | "sale_return";

type MovementRow = StockMovement & {
  warehouse_id?: string | null;
  godown_id?: string | null;
  item?: Item | null;
};

export default function StockMovements() {
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [godowns, setGodowns] = useState<GodownOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  const [form, setForm] = useState({
    item_id: "",
    warehouse_id: "",
    godown_id: "",
    type: "in" as ExtendedMovementType,
    qty: "0",
    reference: "",
  });

  const [transferForm, setTransferForm] = useState({
    item_id: "",
    warehouse_id: "",
    from_godown_id: "",
    to_godown_id: "",
    qty: "0",
    reference: "",
  });

  const fetchRows = useCallback(async () => {
    setLoading(true);

    const [movementRes, itemRes, warehouseRes, godownRes] = await Promise.all([
      supabase.from("stock_movements").select("*").order("created_at", { ascending: false }),
      supabase.from("items").select("*").order("name"),
      supabase.from("warehouses").select("id,name").order("name"),
      supabase.from("godowns").select("id,name,warehouse_id").order("name"),
    ]);

    if (movementRes.error) {
      setError(movementRes.error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    if (itemRes.error) {
      setError(`Unable to load item details: ${itemRes.error.message}`);
      setRows((movementRes.data ?? []) as MovementRow[]);
      setLoading(false);
      return;
    }

    if (warehouseRes.error) {
      setError(`Unable to load warehouses: ${warehouseRes.error.message}`);
      setLoading(false);
      return;
    }

    if (godownRes.error) {
      setError(`Unable to load godowns: ${godownRes.error.message}`);
      setLoading(false);
      return;
    }

    const itemMap = new Map((itemRes.data ?? []).map((item: any) => [item.id, item]));
    setItems((itemRes.data ?? []) as Item[]);

    const warehouseList: WarehouseOption[] = (warehouseRes.data ?? []).map((w: any) => ({
      id: String(w.id),
      name: String(w.name ?? ""),
    }));

    const godownList: GodownOption[] = (godownRes.data ?? []).map((g: any) => ({
      id: String(g.id),
      name: String(g.name ?? ""),
      warehouse_id: String(g.warehouse_id ?? ""),
    }));

    setWarehouses(warehouseList);
    setGodowns(godownList);

    setRows(
      (movementRes.data ?? []).map((row: any) => ({
        ...row,
        item: itemMap.get(row.item_id) ?? null,
      })) as MovementRow[]
    );

    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const warehouseGodowns = (warehouseId: string) =>
    godowns.filter(
      (g) => String(g.warehouse_id) === String(warehouseId)
    );

  function openCreate() {
    setError(null);
    const warehouseId = warehouses[0]?.id ?? "";
    const availableGodowns = warehouseGodowns(warehouseId);
    const godownId = availableGodowns[0]?.id ?? "";

    setForm({
      item_id: "",
      warehouse_id: warehouseId,
      godown_id: godownId,
      type: "in",
      qty: "0",
      reference: "",
    });
    setModalOpen(true);
  }

  function openTransfer() {
    if (warehouses.length === 0) {
      setError("No warehouse is available.");
      return;
    }

    const warehouseId = warehouses[0].id;
    const availableGodowns = warehouseGodowns(warehouseId);

    if (availableGodowns.length < 2) {
      setError("At least two godowns are required in the selected warehouse for transfer.");
      return;
    }

    setError(null);
    setTransferForm({
      item_id: "",
      warehouse_id: warehouseId,
      from_godown_id: availableGodowns[0].id,
      to_godown_id: availableGodowns[1].id,
      qty: "0",
      reference: "",
    });
    setTransferModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const qty = Number(form.qty);

    if (!form.item_id) return setError("Please select an item.");
    if (!form.warehouse_id) return setError("Please select a warehouse.");
    if (!form.godown_id) return setError("Please select a godown.");

    const godown = godowns.find((g) => g.id === form.godown_id);
    if (!godown || godown.warehouse_id !== form.warehouse_id) {
      return setError("Selected godown does not belong to selected warehouse.");
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      return setError("Quantity must be greater than zero.");
    }

    if (
      form.type === "out" ||
      form.type === "purchase_return"
    ) {
      const { data: stockRow, error: stockError } = await supabase
        .from("warehouse_stock")
        .select("quantity")
        .eq("item_id", form.item_id)
        .eq("warehouse_id", form.warehouse_id)
        .eq("godown_id", form.godown_id)
        .maybeSingle();

      if (stockError) return setError(stockError.message);

      const availableQty = Number(stockRow?.quantity ?? 0);
      if (qty > availableQty) {
        return setError(`Insufficient stock. Available quantity: ${availableQty.toLocaleString()}`);
      }
    }

    const rpcType =
      form.type === "sale_return"
        ? "in"
        : form.type === "purchase_return"
          ? "out"
          : form.type;

    const reference =
      form.reference.trim() ||
      (form.type === "purchase_return"
        ? "Purchase Return"
        : form.type === "sale_return"
          ? "Sale Return"
          : null);

    const { error: movementError } = await supabase.rpc(
      "apply_stock_movement",
      {
        p_item_id: form.item_id,
        p_warehouse_id: form.warehouse_id,
        p_godown_id: form.godown_id,
        p_type: rpcType,
        p_qty: Number(qty.toFixed(3)),
        p_reference: reference,
      }
    );

    if (movementError) return setError(movementError.message);

    setModalOpen(false);
    await fetchRows();
  }

  async function handleTransferSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const qty = Number(transferForm.qty);
    const from = godowns.find((g) => g.id === transferForm.from_godown_id);
    const to = godowns.find((g) => g.id === transferForm.to_godown_id);

    if (!transferForm.item_id) return setError("Please select an item.");
    if (!transferForm.warehouse_id) return setError("Please select a warehouse.");
    if (!from || !to) return setError("Please select valid source and destination godowns.");
    if (from.warehouse_id !== transferForm.warehouse_id || to.warehouse_id !== transferForm.warehouse_id) {
      return setError("Both godowns must belong to the selected warehouse.");
    }
    if (from.id === to.id) return setError("Source and destination godown cannot be the same.");
    if (!Number.isFinite(qty) || qty <= 0) return setError("Transfer quantity must be greater than zero.");

    const { data: sourceStock, error: stockError } = await supabase
      .from("warehouse_stock")
      .select("quantity")
      .eq("item_id", transferForm.item_id)
      .eq("warehouse_id", transferForm.warehouse_id)
      .eq("godown_id", from.id)
      .maybeSingle();

    if (stockError) return setError(stockError.message);

    const available = Number(sourceStock?.quantity ?? 0);
    if (qty > available) {
      return setError(`Insufficient stock in source godown. Available: ${available.toLocaleString()}`);
    }

    /*
     * This RPC must insert two stock movements in one database transaction:
     * source OUT + destination IN, including warehouse_id/godown_id.
     * Run the SQL migration supplied with this update before using Transfer.
     */
    const { error: transferError } = await supabase.rpc("transfer_stock_v2", {
      p_item_id: transferForm.item_id,
      p_warehouse_id: transferForm.warehouse_id,
      p_from_godown_id: from.id,
      p_to_godown_id: to.id,
      p_qty: Number(qty.toFixed(2)),
      p_reference: transferForm.reference.trim() || null,
    });

    if (transferError) return setError(transferError.message);

    setTransferModalOpen(false);
    await fetchRows();
  }

  function handlePrint() {
    window.print();
  }

  function handleExportExcel() {
    let csv = "Date,Warehouse,Godown,Item,Type,Quantity,Reference\r\n";

    rows.forEach((row: any) => {
      const date = row.created_at ? new Date(row.created_at).toLocaleDateString() : "";
      const warehouse = warehouses.find((w) => w.id === row.warehouse_id)?.name ?? "";
      const godown = godowns.find((g) => g.id === row.godown_id)?.name ?? row.godown ?? "";
      const item = row.item?.name ?? "";

      csv += `"${date}","${warehouse}","${godown}","${item}","${row.type}",${row.qty},"${row.reference ?? ""}"\r\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Stock_Movements.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const typeColors: Record<string, string> = {
    in: "bg-success-100 text-success-700",
    out: "bg-error-100 text-error-700",
    adjust: "bg-warning-100 text-warning-700",
    purchase_return: "bg-purple-100 text-purple-700",
    sale_return: "bg-blue-100 text-blue-700",
  };

  const columns: Column<MovementRow>[] = [
    {
      key: "created_at",
      label: "Date / تاریخ",
      render: (r) => formatDate(r.created_at),
    },
    {
      key: "warehouse_id",
      label: "Warehouse / ویئرہاؤس",
      render: (r: any) =>
        warehouses.find((w) => w.id === r.warehouse_id)?.name ?? "—",
    },
    {
      key: "godown",
      label: "Godown / گودام",
      render: (r: any) => (
        <span className="badge bg-primary-100 text-primary-700">
          {godowns.find((g) => g.id === r.godown_id)?.name ?? r.godown ?? "—"}
        </span>
      ),
    },
    {
      key: "item",
      label: "Item / آئٹم",
      render: (r: any) => (
        <span className="font-medium text-slate-900">
          {r.item?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "type",
      label: "Type / قسم",
      render: (r: any) => (
        <span className={`badge ${typeColors[r.type] ?? "bg-slate-100 text-slate-700"}`}>
          {String(r.type).replace("_", " ")}
        </span>
      ),
    },
    {
      key: "qty",
      label: "Quantity / مقدار",
      render: (r: any) => {
        const negative = r.type === "out" || r.type === "purchase_return";
        return (
          <span className={negative ? "font-medium text-error-600" : "font-medium text-success-600"}>
            {negative ? "-" : "+"}{Number(r.qty).toLocaleString()}
          </span>
        );
      },
    },
    {
      key: "reference",
      label: "Reference / حوالہ",
      render: (r: any) => r.reference ?? "—",
    },
  ];

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-movements, #printable-movements * { visibility: visible; }
          #printable-movements { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div id="printable-movements" className="space-y-6">
        <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
          <PageHeader
            title="Stock Movements / اسٹاک موومنٹس"
            subtitle="Stock in, stock out, returns, adjustments and godown transfers / اسٹاک اِن، آؤٹ، واپسی، ایڈجسٹمنٹ اور گودام ٹرانسفر"
          />
          <div className="no-print flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleExportExcel} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              <FileSpreadsheet className="h-4 w-4" /> Export Excel
            </button>
            <button type="button" onClick={handlePrint} className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
              <Printer className="h-4 w-4" />Print / پرنٹ</button>
            <button type="button" onClick={openTransfer} className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
              <ArrowRightLeft className="h-4 w-4" />Transfer Stock / اسٹاک منتقل کریں</button>
            <button type="button" onClick={openCreate} className="btn-primary">
              + New Movement
            </button>
          </div>
        </div>

        {error && <ErrorBanner message={error} />}

        <DataTable columns={columns} rows={rows} loading={loading} emptyMessage="No stock movements yet." />
      </div>

      <Modal open={modalOpen} title="New Stock Movement / نئی اسٹاک موومنٹ" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Item / آئٹم</label>
            <select className="input" required value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
              <option value="">— Select item —</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Warehouse / ویئرہاؤس</label>
            <select
              className="input"
              required
              value={form.warehouse_id}
              onChange={(e) => {
                const warehouseId = e.target.value;
                const first = warehouseGodowns(warehouseId)[0];
                setForm({ ...form, warehouse_id: warehouseId, godown_id: first?.id ?? "" });
              }}
            >
              <option value="">— Select warehouse —</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Godown / گودام</label>
            <select
              className="input"
              required
              disabled={!form.warehouse_id}
              value={form.godown_id}
              onChange={(e) => setForm({ ...form, godown_id: e.target.value })}
            >
              <option value="">— Select godown —</option>
              {warehouseGodowns(form.warehouse_id).map((godown) => (
                <option key={godown.id} value={godown.id}>{godown.name}</option>
              ))}
            </select>
            {form.warehouse_id && warehouseGodowns(form.warehouse_id).length === 0 && (
              <p className="mt-1 text-xs text-amber-600">
                No godowns are mapped to this warehouse.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Type / قسم</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ExtendedMovementType })}>
                <option value="in">Stock In / اسٹاک اِن</option>
                <option value="out">Stock Out / اسٹاک آؤٹ</option>
                <option value="purchase_return">Purchase Return / خریداری واپسی</option>
                <option value="sale_return">Sale Return / فروخت واپسی</option>
                <option value="adjust">Adjustment / ایڈجسٹمنٹ</option>
              </select>
            </div>
            <div>
              <label className="label">Quantity / مقدار</label>
              <input className="input" type="number" min="0.01" step="0.01" required value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">Reference / حوالہ</label>
            <input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Invoice / GRN / adjustment reference / انوائس، GRN یا ایڈجسٹمنٹ حوالہ" />
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
            Location: {warehouses.find((w) => w.id === form.warehouse_id)?.name ?? "—"} → {godowns.find((g) => g.id === form.godown_id)?.name ?? "—"}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel / منسوخ کریں</button>
            <button type="submit" className="btn-primary">Save Movement / موومنٹ محفوظ کریں</button>
          </div>
        </form>
      </Modal>

      <Modal open={transferModalOpen} title="Transfer Stock Between Godowns / گوداموں کے درمیان اسٹاک منتقل کریں" onClose={() => setTransferModalOpen(false)}>
        <form onSubmit={handleTransferSubmit} className="space-y-4">
          <div>
            <label className="label">Item / آئٹم</label>
            <select className="input" required value={transferForm.item_id} onChange={(e) => setTransferForm({ ...transferForm, item_id: e.target.value })}>
              <option value="">— Select item —</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Warehouse / ویئرہاؤس</label>
            <select
              className="input"
              required
              value={transferForm.warehouse_id}
              onChange={(e) => {
                const warehouseId = e.target.value;
                const list = warehouseGodowns(warehouseId);
                setTransferForm({
                  ...transferForm,
                  warehouse_id: warehouseId,
                  from_godown_id: list[0]?.id ?? "",
                  to_godown_id: list[1]?.id ?? "",
                });
              }}
            >
              <option value="">— Select warehouse —</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">From Godown / گودام سے</label>
              <select className="input" required value={transferForm.from_godown_id} onChange={(e) => setTransferForm({ ...transferForm, from_godown_id: e.target.value })}>
                <option value="">— Select —</option>
                {warehouseGodowns(transferForm.warehouse_id).map((godown) => (
                  <option key={godown.id} value={godown.id}>{godown.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">To Godown / گودام تک</label>
              <select className="input" required value={transferForm.to_godown_id} onChange={(e) => setTransferForm({ ...transferForm, to_godown_id: e.target.value })}>
                <option value="">— Select —</option>
                {warehouseGodowns(transferForm.warehouse_id).map((godown) => (
                  <option key={godown.id} value={godown.id}>{godown.name}</option>
                ))}
              </select>
            </div>
          </div>

          {transferForm.warehouse_id && warehouseGodowns(transferForm.warehouse_id).length === 0 && (
            <p className="text-xs text-amber-600">
              No godowns are mapped to this warehouse.
            </p>
          )}

          <div>
            <label className="label">Quantity / مقدار</label>
            <input className="input" type="number" min="0.01" step="0.01" required value={transferForm.qty} onChange={(e) => setTransferForm({ ...transferForm, qty: e.target.value })} />
          </div>

          <div>
            <label className="label">Reference / حوالہ</label>
            <input className="input" value={transferForm.reference} onChange={(e) => setTransferForm({ ...transferForm, reference: e.target.value })} placeholder="Transfer memo / reference / ٹرانسفر میمو یا حوالہ" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setTransferModalOpen(false)} className="btn-secondary">Cancel / منسوخ کریں</button>
            <button type="submit" className="btn-primary">Transfer Stock / اسٹاک منتقل کریں</button>
          </div>
        </form>
      </Modal>
</div>
  );
}
