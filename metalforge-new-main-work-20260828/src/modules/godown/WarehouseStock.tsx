import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Package,
  Warehouse as WarehouseIcon,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  SlidersHorizontal,
  X,
  Save,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type Item = {
  id: string;
  sku: string;
  name: string;
  grade: string | null;
  size: string | null;
  unit: string | null;
};

type Warehouse = {
  id: string;
  name: string;
  location: string | null;
};

type Godown = {
  id: string;
  name: string;
  location: string | null;
  warehouse_id: string;
};

type StockRow = {
  id: string;
  user_id: string;
  item_id: string | null;
  warehouse_id: string | null;
  godown_id: string | null;
  godown: string;
  quantity: number;
  updated_at: string;
  item: Item | null;
};

type MovementType = "in" | "out" | "adjust";

type AdjustmentForm = {
  item_id: string;
  warehouse_id: string;
  godown_id: string;
  type: MovementType;
  qty: string;
  reference: string;
};

const EMPTY_FORM: AdjustmentForm = {
  item_id: "",
  warehouse_id: "",
  godown_id: "",
  type: "in",
  qty: "",
  reference: "",
};

export default function WarehouseStock() {
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [godownFilter, setGodownFilter] = useState("all");
  const [itemFilter, setItemFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<AdjustmentForm>(EMPTY_FORM);

  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const notify = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4500);
  };

  const fetchData = async () => {
    setLoading(true);

    const [itemsRes, warehousesRes, godownsRes, stockRes] =
      await Promise.all([
        supabase
          .from("items")
          .select("id,sku,name,grade,size,unit")
          .order("name", { ascending: true }),
        supabase
          .from("warehouses")
          .select("id,name,location")
          .order("name", { ascending: true }),
        supabase
          .from("godowns")
          .select("id,name,location,warehouse_id")
          .order("name", { ascending: true }),
        supabase
          .from("warehouse_stock")
          .select(
            "id,user_id,item_id,warehouse_id,godown_id,godown,quantity,updated_at"
          )
          .order("updated_at", { ascending: false }),
      ]);

    if (itemsRes.error) {
      notify("error", `Items load failed: ${itemsRes.error.message}`);
      setItems([]);
    } else {
      setItems((itemsRes.data ?? []) as Item[]);
    }

    if (warehousesRes.error) {
      notify("error", `Warehouses load failed: ${warehousesRes.error.message}`);
      setWarehouses([]);
    } else {
      setWarehouses((warehousesRes.data ?? []) as Warehouse[]);
    }

    if (godownsRes.error) {
      notify("error", `Godowns load failed: ${godownsRes.error.message}`);
      setGodowns([]);
    } else {
      setGodowns((godownsRes.data ?? []) as Godown[]);
    }

    if (stockRes.error) {
      notify("error", `Stock load failed: ${stockRes.error.message}`);
      setStock([]);
    } else {
      const itemMap = new Map(
        (itemsRes.data ?? []).map((item: any) => [item.id, item])
      );
      setStock(
        ((stockRes.data ?? []) as any[]).map((row) => ({
          ...row,
          item: itemMap.get(row.item_id) ?? null,
        })) as StockRow[]
      );
    }

    setLoading(false);
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const filteredGodownsForFilter = useMemo(
    () =>
      warehouseFilter === "all"
        ? godowns
        : godowns.filter((g) => g.warehouse_id === warehouseFilter),
    [godowns, warehouseFilter]
  );

  const modalGodowns = useMemo(
    () =>
      form.warehouse_id
        ? godowns.filter((g) => g.warehouse_id === form.warehouse_id)
        : [],
    [godowns, form.warehouse_id]
  );

  const warehouseName = (id: string | null) =>
    warehouses.find((w) => w.id === id)?.name ?? "—";

  const godownName = (id: string | null, fallback?: string) =>
    godowns.find((g) => g.id === id)?.name ?? fallback ?? "—";

  const filteredStock = useMemo(() => {
    const query = search.trim().toLowerCase();

    return stock.filter((row) => {
      const item = row.item;
      const searchable =
        `${item?.sku ?? ""} ${item?.name ?? ""} ${item?.grade ?? ""} ${
          item?.size ?? ""
        } ${warehouseName(row.warehouse_id)} ${godownName(
          row.godown_id,
          row.godown
        )}`.toLowerCase();

      return (
        (!query || searchable.includes(query)) &&
        (warehouseFilter === "all" ||
          row.warehouse_id === warehouseFilter) &&
        (godownFilter === "all" || row.godown_id === godownFilter) &&
        (itemFilter === "all" || row.item_id === itemFilter)
      );
    });
  }, [
    stock,
    search,
    warehouseFilter,
    godownFilter,
    itemFilter,
    warehouses,
    godowns,
  ]);

  const totalQuantity = useMemo(
    () => filteredStock.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
    [filteredStock]
  );

  const totalPositiveItems = useMemo(
    () => filteredStock.filter((row) => Number(row.quantity) > 0).length,
    [filteredStock]
  );

  const openAdjustment = (type: MovementType = "in") => {
    const warehouseId = warehouses[0]?.id ?? "";
    const firstGodown =
      godowns.find((g) => g.warehouse_id === warehouseId)?.id ?? "";

    setForm({
      ...EMPTY_FORM,
      type,
      warehouse_id: warehouseId,
      godown_id: firstGodown,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setForm(EMPTY_FORM);
  };

  const saveAdjustment = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!form.item_id) {
      notify("error", "Select an item / آئٹم منتخب کریں۔");
      return;
    }
    if (!form.warehouse_id) {
      notify("error", "Select a warehouse / Warehouse منتخب کریں۔");
      return;
    }
    if (!form.godown_id) {
      notify("error", "Select a godown / گودام منتخب کریں۔");
      return;
    }

    const selectedGodown = godowns.find((g) => g.id === form.godown_id);
    if (!selectedGodown || selectedGodown.warehouse_id !== form.warehouse_id) {
      notify("error", "Selected godown does not belong to selected warehouse.");
      return;
    }

    const qty = Number(form.qty);
    const invalidQuantity =
      !Number.isFinite(qty) ||
      (form.type === "adjust" ? qty < 0 : qty <= 0);

    if (invalidQuantity) {
      notify(
        "error",
        form.type === "adjust"
          ? "New quantity cannot be negative."
          : "Enter a quantity greater than zero."
      );
      return;
    }

    if (form.type === "adjust" && !form.reference.trim()) {
      notify("error", "Enter adjustment reason.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.rpc("apply_stock_movement", {
        p_item_id: form.item_id,
        p_warehouse_id: form.warehouse_id,
        p_godown_id: form.godown_id,
        p_type: form.type,
        p_qty: Number(qty.toFixed(3)),
        p_reference:
          form.reference.trim() ||
          (form.type === "in"
            ? "Manual Stock In"
            : form.type === "out"
            ? "Manual Stock Out"
            : "Stock Adjustment"),
      });

      if (error) throw error;

      notify(
        "success",
        `${
          form.type === "in"
            ? "Stock IN"
            : form.type === "out"
            ? "Stock OUT"
            : "Stock adjustment"
        } saved successfully.`
      );

      setModalOpen(false);
      setForm(EMPTY_FORM);
      await fetchData();
    } catch (error) {
      notify(
        "error",
        `Stock update failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setSaving(false);
    }
  };

  const exportExcel = () => {
    if (!filteredStock.length) {
      notify("error", "No stock to export.");
      return;
    }

    const rows = filteredStock.map((row) => ({
      Warehouse: warehouseName(row.warehouse_id),
      Godown: godownName(row.godown_id, row.godown),
      SKU: row.item?.sku ?? "Unknown",
      "Item Name": row.item?.name ?? "Unknown Item",
      Grade: row.item?.grade ?? "",
      Size: row.item?.size ?? "",
      Unit: row.item?.unit ?? "kg",
      Quantity: Number(row.quantity ?? 0),
      "Last Updated": row.updated_at,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Warehouse Stock");
    XLSX.writeFile(workbook, "warehouse_stock.xlsx");
    notify("success", "Stock exported successfully.");
  };

  const handleWarehouseFilter = (value: string) => {
    setWarehouseFilter(value);
    setGodownFilter("all");
  };

  return (
    <div className="space-y-5">
      {message && (
        <div
          className={`fixed right-5 top-5 z-[100] max-w-lg rounded-xl border px-4 py-3 text-sm font-medium shadow-xl ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-slate-100 p-3">
            <Package className="h-6 w-6 text-slate-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Warehouse Stock / گودام اسٹاک
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              View stock by warehouse, godown and item.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openAdjustment("in")}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
          >
            <ArrowDownToLine className="h-4 w-4" />
            Stock IN / اسٹاک ان
          </button>
          <button
            type="button"
            onClick={() => openAdjustment("out")}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700"
          >
            <ArrowUpFromLine className="h-4 w-4" />
            Stock OUT / اسٹاک آؤٹ
          </button>
          <button
            type="button"
            onClick={() => openAdjustment("adjust")}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-700"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Adjust / ایڈجسٹ
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Stock Records
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {filteredStock.length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Positive Stock
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {totalPositiveItems}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Total Quantity
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {totalQuantity.toLocaleString(undefined, {
              maximumFractionDigits: 3,
            })}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 xl:col-span-1">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search item, SKU... / آئٹم یا SKU تلاش کریں..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>

          <select
            value={warehouseFilter}
            onChange={(event) => handleWarehouseFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
          >
            <option value="all">All Warehouses / تمام Warehouse</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>

          <select
            value={godownFilter}
            onChange={(event) => setGodownFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
          >
            <option value="all">All Godowns / تمام گودام</option>
            {filteredGodownsForFilter.map((godown) => (
              <option key={godown.id} value={godown.id}>
                {godown.name}
              </option>
            ))}
          </select>

          <select
            value={itemFilter}
            onChange={(event) => setItemFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
          >
            <option value="all">All Items / تمام آئٹمز</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku} — {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void fetchData()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />Refresh / تازہ کریں</button>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
          >
            <Printer className="h-3.5 w-3.5" />
            Print / PDF
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-bold text-slate-900">Current Stock / موجودہ اسٹاک</h2>
            <p className="mt-1 text-xs text-slate-500">
              Stock is maintained by Warehouse → Godown → Item.
            </p>
          </div>
          <WarehouseIcon className="h-5 w-5 text-slate-400" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-xs font-bold uppercase text-slate-500">Warehouse / ویئرہاؤس</th>
                <th className="px-5 py-3 text-xs font-bold uppercase text-slate-500">Godown / گودام</th>
                <th className="px-5 py-3 text-xs font-bold uppercase text-slate-500">Item / آئٹم</th>
                <th className="px-5 py-3 text-xs font-bold uppercase text-slate-500">Grade / گریڈ</th>
                <th className="px-5 py-3 text-xs font-bold uppercase text-slate-500">Size / سائز</th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase text-slate-500">Quantity / مقدار</th>
                <th className="px-5 py-3 text-xs font-bold uppercase text-slate-500">Unit / اکائی</th>
                <th className="px-5 py-3 text-xs font-bold uppercase text-slate-500">Updated / تازہ کاری</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-400">Loading stock... / اسٹاک لوڈ ہو رہا ہے...</td></tr>
              ) : filteredStock.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-14 text-center text-slate-400">No stock records found. / کوئی اسٹاک ریکارڈ نہیں ملا۔</td></tr>
              ) : (
                filteredStock.map((row) => {
                  const quantity = Number(row.quantity ?? 0);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-semibold text-slate-700">{warehouseName(row.warehouse_id)}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          <WarehouseIcon className="h-3.5 w-3.5" />
                          {godownName(row.godown_id, row.godown)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-800">{row.item?.name ?? "Unknown Item"}</div>
                        <div className="text-xs text-slate-400">{row.item?.sku ?? "—"}</div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{row.item?.grade || "—"}</td>
                      <td className="px-5 py-4 text-slate-600">{row.item?.size || "—"}</td>
                      <td className={`px-5 py-4 text-right font-bold ${quantity > 0 ? "text-emerald-700" : quantity < 0 ? "text-rose-700" : "text-slate-500"}`}>
                        {quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{row.item?.unit || "kg"}</td>
                      <td className="px-5 py-4 text-xs text-slate-500">
                        {new Date(row.updated_at).toLocaleString("en-GB", {
                          day: "2-digit", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="font-bold text-slate-900">
                  {form.type === "in" ? "Stock IN / اسٹاک ان" : form.type === "out" ? "Stock OUT / اسٹاک آؤٹ" : "Stock Adjustment / اسٹاک ایڈجسٹمنٹ"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">Select Warehouse first, then its Godown. / پہلے ویئرہاؤس پھر اس کا گودام منتخب کریں۔</p>
              </div>
              <button type="button" onClick={closeModal} disabled={saving} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={saveAdjustment} className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">Item / آئٹم *</label>
                <select
                  required
                  value={form.item_id}
                  onChange={(event) => setForm((current) => ({ ...current, item_id: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                >
                  <option value="">Select item / آئٹم منتخب کریں</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} — {item.name}{item.grade ? ` — ${item.grade}` : ""}{item.size ? ` — ${item.size}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">Warehouse / Warehouse *</label>
                <select
                  required
                  value={form.warehouse_id}
                  onChange={(event) => {
                    const warehouseId = event.target.value;
                    const firstGodown = godowns.find((g) => g.warehouse_id === warehouseId);
                    setForm((current) => ({
                      ...current,
                      warehouse_id: warehouseId,
                      godown_id: firstGodown?.id ?? "",
                    }));
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                >
                  <option value="">Select warehouse / ویئرہاؤس منتخب کریں</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">Godown / گودام *</label>
                <select
                  required
                  value={form.godown_id}
                  disabled={!form.warehouse_id}
                  onChange={(event) => setForm((current) => ({ ...current, godown_id: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none disabled:bg-slate-100"
                >
                  <option value="">
                    {form.warehouse_id ? "Select godown" : "Select warehouse first"}
                  </option>
                  {modalGodowns.map((godown) => (
                    <option key={godown.id} value={godown.id}>{godown.name}</option>
                  ))}
                </select>
                {form.warehouse_id && modalGodowns.length === 0 && (
                  <p className="mt-1 text-xs text-rose-600">No godown is assigned to this warehouse. / اس ویئرہاؤس کے ساتھ کوئی گودام منسلک نہیں۔</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">Type / قسم</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
                    value={form.type}
                    onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as MovementType }))}
                  >
                    <option value="in">Stock In / اسٹاک اِن</option>
                    <option value="out">Stock Out / اسٹاک آؤٹ</option>
                    <option value="adjust">Adjustment / ایڈجسٹمنٹ</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    {form.type === "adjust" ? "New Quantity" : "Quantity"} *
                  </label>
                  <input
                    required
                    type="number"
                    min={form.type === "adjust" ? "0" : "0.001"}
                    step="0.001"
                    value={form.qty}
                    onChange={(event) => setForm((current) => ({ ...current, qty: event.target.value }))}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">Reference / حوالہ</label>
                <input
                  value={form.reference}
                  onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))}
                  placeholder={form.type === "adjust" ? "e.g. Physical stock count" : "e.g. Purchase receipt / manual entry"}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
                />
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                <strong>Location: / مقام:</strong> {warehouses.find((w) => w.id === form.warehouse_id)?.name ?? "—"} → {godowns.find((g) => g.id === form.godown_id)?.name ?? "—"}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={closeModal} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700">
                  <X className="h-4 w-4" />Cancel / منسوخ کریں</button>
                <button type="submit" disabled={saving || !form.warehouse_id || !form.godown_id} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                  <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
