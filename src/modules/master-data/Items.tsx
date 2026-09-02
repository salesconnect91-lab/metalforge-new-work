import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Save,
  Upload,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  Package,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type ItemType = "raw" | "component" | "finished";

type Category = {
  id: string;
  name: string;
};

type Warehouse = {
  id: string;
  name: string;
  location: string | null;
};

type Item = {
  id: string;
  sku: string;
  category_id: string | null;
  name: string;
  type: string | null;
  grade: string | null;
  size: string | null;
  unit: string | null;
  cost: number | null;
  price: number | null;
  created_at: string;
  warehouse_id: string | null;
};

type ItemForm = {
  sku: string;
  category_id: string;
  name: string;
  type: ItemType;
  grade: string;
  size: string;
  unit: string;
  cost: string;
  price: string;
  warehouse_id: string;
};

const EMPTY_FORM: ItemForm = {
  sku: "",
  category_id: "",
  name: "",
  type: "finished",
  grade: "",
  size: "",
  unit: "kg",
  cost: "0",
  price: "0",
  warehouse_id: "",
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const numberValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const skuPrefix = (type: ItemType) => {
  if (type === "raw") return "RAW";
  if (type === "component") return "CMP";
  return "FG";
};

const generateNextSku = async (type: ItemType) => {
  const prefix = skuPrefix(type);
  const { data, error } = await supabase
    .from("items")
    .select("sku")
    .ilike("sku", `${prefix}-%`);

  if (error) throw error;

  let maxNumber = 0;
  for (const row of data ?? []) {
    const value = String(row.sku ?? "").trim().toUpperCase();
    const match = value.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) maxNumber = Math.max(maxNumber, Number(match[1]));
  }

  return `${prefix}-${String(maxNumber + 1).padStart(3, "0")}`;
};

export default function Items() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ItemType>("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);

  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const notify = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4500);
  };

  const fetchAll = async () => {
    setLoading(true);

    const [itemsRes, categoriesRes, warehousesRes] = await Promise.all([
      supabase
        .from("items")
        .select(
          "id,sku,category_id,name,type,grade,size,unit,cost,price,created_at,warehouse_id"
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("categories")
        .select("id,name")
        .order("name", { ascending: true }),

      supabase
        .from("warehouses")
        .select("id,name,location")
        .order("name", { ascending: true }),
    ]);

    if (itemsRes.error) {
      notify(
        "error",
        `Items load failed / آئٹمز لوڈ نہیں ہوئے: ${itemsRes.error.message}`
      );
      setItems([]);
    } else {
      setItems((itemsRes.data ?? []) as Item[]);
    }

    if (categoriesRes.error) {
      notify(
        "error",
        `Categories load failed / کیٹیگریز لوڈ نہیں ہوئیں: ${categoriesRes.error.message}`
      );
      setCategories([]);
    } else {
      setCategories((categoriesRes.data ?? []) as Category[]);
    }

    if (warehousesRes.error) {
      notify(
        "error",
        `Warehouses load failed / گودام لوڈ نہیں ہوئے: ${warehousesRes.error.message}`
      );
      setWarehouses([]);
    } else {
      setWarehouses((warehousesRes.data ?? []) as Warehouse[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  const filteredItems = useMemo(() => {
    const query = normalize(searchQuery);

    return items.filter((item) => {
      const matchesSearch =
        !query ||
        normalize(item.sku).includes(query) ||
        normalize(item.name).includes(query) ||
        normalize(item.grade).includes(query) ||
        normalize(item.size).includes(query);

      const matchesType =
        typeFilter === "all" || normalize(item.type) === typeFilter;

      const matchesWarehouse =
        warehouseFilter === "all" ||
        item.warehouse_id === warehouseFilter;

      const matchesCategory =
        categoryFilter === "all" ||
        item.category_id === categoryFilter;

      return (
        matchesSearch &&
        matchesType &&
        matchesWarehouse &&
        matchesCategory
      );
    });
  }, [
    items,
    searchQuery,
    typeFilter,
    warehouseFilter,
    categoryFilter,
  ]);

  const totalCost = useMemo(
    () =>
      filteredItems.reduce(
        (sum, item) => sum + numberValue(String(item.cost ?? 0)),
        0
      ),
    [filteredItems]
  );

  const openAdd = async () => {
    setEditingItem(null);
    try {
      const sku = await generateNextSku("finished");
      setForm({
        ...EMPTY_FORM,
        sku,
        warehouse_id: warehouses[0]?.id ?? "",
      });
      setModalOpen(true);
    } catch (error) {
      notify(
        "error",
        `Could not generate SKU / SKU generate نہیں ہو سکا: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  const changeItemType = async (type: ItemType) => {
    setForm((current) => ({ ...current, type }));

    if (!editingItem) {
      try {
        const sku = await generateNextSku(type);
        setForm((current) => ({ ...current, type, sku }));
      } catch (error) {
        notify(
          "error",
          `Could not generate SKU / SKU generate نہیں ہو سکا: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }
  };

  const openEdit = (item: Item) => {
    setEditingItem(item);
    setForm({
      sku: item.sku,
      category_id: item.category_id ?? "",
      name: item.name,
      type:
        item.type === "raw" ||
        item.type === "component" ||
        item.type === "finished"
          ? item.type
          : "finished",
      grade: item.grade ?? "",
      size: item.size ?? "",
      unit: item.unit ?? "kg",
      cost: String(item.cost ?? 0),
      price: String(item.price ?? 0),
      warehouse_id: item.warehouse_id ?? "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingItem(null);
    setForm(EMPTY_FORM);
  };

  const saveItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    let sku = form.sku.trim().toUpperCase();
    const name = form.name.trim();

    if (!editingItem && !sku) {
      try {
        sku = await generateNextSku(form.type);
      } catch (error) {
        notify(
          "error",
          `Could not generate SKU / SKU generate نہیں ہو سکا: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        return;
      }
    }

    if (!sku) {
      notify("error", "SKU could not be generated / SKU generate نہیں ہو سکا۔");
      return;
    }

    if (!name) {
      notify("error", "Item name is required / آئٹم کا نام ضروری ہے۔");
      return;
    }

    if (numberValue(form.cost) < 0 || numberValue(form.price) < 0) {
      notify(
        "error",
        "Cost and price cannot be negative / لاگت اور قیمت منفی نہیں ہو سکتی۔"
      );
      return;
    }

    setSaving(true);

    try {
      const duplicateQuery = supabase
        .from("items")
        .select("id")
        .ilike("sku", sku)
        .limit(1);

      const { data: duplicate, error: duplicateError } =
        editingItem
          ? await duplicateQuery.neq("id", editingItem.id)
          : await duplicateQuery;

      if (duplicateError) throw duplicateError;

      if ((duplicate ?? []).length > 0) {
        throw new Error(
          "SKU already exists / یہ SKU پہلے سے موجود ہے۔"
        );
      }

      const payload = {
        sku: sku.toUpperCase(),
        category_id: form.category_id || null,
        name,
        type: form.type,
        grade: form.grade.trim() || null,
        size: form.size.trim() || null,
        unit: form.unit.trim() || "kg",
        cost: numberValue(form.cost),
        price: numberValue(form.price),
        warehouse_id: form.warehouse_id || null,
      };

      if (editingItem) {
        const { error } = await supabase
          .from("items")
          .update(payload)
          .eq("id", editingItem.id);

        if (error) throw error;

        notify(
          "success",
          "Item updated successfully / آئٹم کامیابی سے اپڈیٹ ہوگیا۔"
        );
      } else {
        const { error } = await supabase
          .from("items")
          .insert(payload);

        if (error) throw error;

        notify(
          "success",
          "Item added successfully / آئٹم کامیابی سے شامل ہوگیا۔"
        );
      }

      setModalOpen(false);
      setEditingItem(null);
      setForm(EMPTY_FORM);

      await fetchAll();
    } catch (error: unknown) {
      const dbError =
        error && typeof error === "object"
          ? (error as { code?: string; message?: string })
          : null;

      const message =
        dbError?.code === "23505"
          ? "SKU already exists / یہ SKU پہلے سے موجود ہے۔"
          : dbError?.message ??
            (error instanceof Error ? error.message : "Unknown error");

      notify(
        "error",
        `Save failed / محفوظ نہیں ہوسکا: ${message}`
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item: Item) => {
    const confirmed = window.confirm(
      `Delete item "${item.name}"?\n\n"${item.name}" آئٹم حذف کرنا ہے؟`
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("items")
      .delete()
      .eq("id", item.id);

    if (error) {
      notify(
        "error",
        `Delete failed / حذف نہیں ہوسکا: ${error.message}`
      );
      return;
    }

    notify(
      "success",
      "Item deleted successfully / آئٹم کامیابی سے حذف ہوگیا۔"
    );

    await fetchAll();
  };

  const categoryName = (id: string | null) =>
    categories.find((category) => category.id === id)?.name ?? "—";

  const warehouseName = (id: string | null) =>
    warehouses.find((warehouse) => warehouse.id === id)?.name ?? "—";

  const exportExcel = () => {
    if (!filteredItems.length) {
      notify(
        "error",
        "No items to export / ایکسپورٹ کرنے کے لیے کوئی آئٹم نہیں۔"
      );
      return;
    }

    const rows = filteredItems.map((item) => ({
      SKU: item.sku,
      "Item Name": item.name,
      Type: item.type ?? "",
      Category: categoryName(item.category_id),
      Grade: item.grade ?? "",
      Size: item.size ?? "",
      Unit: item.unit ?? "",
      Cost: item.cost ?? 0,
      "Sale Price": item.price ?? 0,
      Warehouse: warehouseName(item.warehouse_id),
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Items");
    XLSX.writeFile(workbook, "items_master.xlsx");

    notify(
      "success",
      "Excel exported successfully / ایکسل کامیابی سے ایکسپورٹ ہوگئی۔"
    );
  };

  const downloadTemplate = () => {
    const rows = [
      {
        SKU: "",
        "Item Name": "MS Scrap",
        Type: "raw",
        Category: categories[0]?.name ?? "",
        Grade: "A",
        Size: "",
        Unit: "kg",
        Cost: 0,
        "Sale Price": 0,
        Warehouse: warehouses[0]?.name ?? "",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Items");
    XLSX.writeFile(workbook, "items_import_template.xlsx");

    notify(
      "success",
      "Template downloaded / ٹیمپلیٹ ڈاؤن لوڈ ہوگیا۔"
    );
  };

  const importExcel = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (loadEvent) => {
      try {
        const result = loadEvent.target?.result;

        if (!result) {
          throw new Error("Could not read the file.");
        }

        const workbook = XLSX.read(result, { type: "array" });
        const sheetName = workbook.SheetNames[0];

        if (!sheetName) {
          throw new Error("No worksheet found.");
        }

        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          workbook.Sheets[sheetName]
        );

        if (!rows.length) {
          throw new Error("Excel file is empty / ایکسل فائل خالی ہے۔");
        }

        const normalizedRows = rows
          .map((row) => {
            const normalized: Record<string, unknown> = {};

            Object.entries(row).forEach(([key, value]) => {
              normalized[
                key.trim().toLowerCase().replace(/[\s_-]+/g, "")
              ] = value;
            });

            const warehouseText = String(
              normalized.warehouse ?? ""
            ).trim();

            const categoryText = String(
              normalized.category ?? ""
            ).trim();

            const warehouse = warehouses.find(
              (value) =>
                normalize(value.name) === normalize(warehouseText)
            );

            const category = categories.find(
              (value) =>
                normalize(value.name) === normalize(categoryText)
            );

            return {
              sku: String(normalized.sku ?? "").trim(),
              name: String(
                normalized.itemname ?? normalized.name ?? ""
              ).trim(),
              type: normalize(normalized.type) || "finished",
              category_id: category?.id ?? null,
              grade: String(normalized.grade ?? "").trim() || null,
              size: String(normalized.size ?? "").trim() || null,
              unit: String(normalized.unit ?? "kg").trim() || "kg",
              cost: numberValue(String(normalized.cost ?? 0)),
              price: numberValue(
                String(normalized.saleprice ?? normalized.price ?? 0)
              ),
              warehouse_id: warehouse?.id ?? null,
            };
          })
          .filter((row) => row.name);

        if (!normalizedRows.length) {
          throw new Error(
            "No valid rows found. Item Name is required."
          );
        }

        const generatedImportRows = [];
        const reservedSkus = new Set(
          items.map((item) => normalize(item.sku))
        );

        const nextNumbers: Record<ItemType, number> = {
          raw: 0,
          component: 0,
          finished: 0,
        };

        const prefixes: Record<ItemType, string> = {
          raw: "RAW",
          component: "CMP",
          finished: "FG",
        };

        for (const item of items) {
          const sku = String(item.sku ?? "").trim().toUpperCase();

          for (const type of ["raw", "component", "finished"] as ItemType[]) {
            const prefix = prefixes[type];
            const match = sku.match(new RegExp(`^${prefix}-(\\d+)$`));

            if (match) {
              nextNumbers[type] = Math.max(
                nextNumbers[type],
                Number(match[1]) || 0
              );
            }
          }
        }

        for (const row of normalizedRows) {
          const rowType: ItemType =
            row.type === "raw" ||
            row.type === "component" ||
            row.type === "finished"
              ? row.type
              : "finished";

          if (!row.sku || normalize(row.sku) === "auto") {
            let candidate = "";

            do {
              nextNumbers[rowType] += 1;
              candidate = `${prefixes[rowType]}-${String(
                nextNumbers[rowType]
              ).padStart(3, "0")}`;
            } while (reservedSkus.has(normalize(candidate)));

            row.sku = candidate;
          } else {
            row.sku = row.sku.trim().toUpperCase();
          }

          const key = normalize(row.sku);

          if (reservedSkus.has(key)) {
            continue;
          }

          reservedSkus.add(key);
          generatedImportRows.push(row);
        }

        if (!generatedImportRows.length) {
          throw new Error(
            "All imported SKUs already exist / تمام SKUs پہلے سے موجود ہیں۔"
          );
        }

        const { error } = await supabase
          .from("items")
          .insert(generatedImportRows);

        if (error) throw error;

        notify(
          "success",
          `${generatedImportRows.length} item(s) imported successfully / ${generatedImportRows.length} آئٹمز کامیابی سے امپورٹ ہوگئے۔`
        );

        await fetchAll();
      } catch (error) {
        notify(
          "error",
          `Import failed / امپورٹ ناکام: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      } finally {
        event.target.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
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

      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-slate-100 p-3">
            <Package className="h-6 w-6 text-slate-700" />
          </div>

          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Items Master / آئٹم ماسٹر
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage raw materials, components and finished goods /
              خام مال، اجزاء اور تیار مال کا انتظام
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Download Template / ٹیمپلیٹ
          </button>

          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200">
            <Upload className="h-4 w-4" />
            Import Excel / ایکسل امپورٹ
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={importExcel}
            />
          </label>

          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            Add Item / آئٹم شامل کریں
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Total Items", items.length, "کل آئٹمز"],
          [
            "Raw Materials",
            items.filter((item) => item.type === "raw").length,
            "خام مال",
          ],
          [
            "Components",
            items.filter((item) => item.type === "component").length,
            "اجزاء",
          ],
          [
            "Finished Goods",
            items.filter((item) => item.type === "finished").length,
            "تیار مال",
          ],
        ].map(([label, value, urdu]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {label}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {value}
            </p>
            <p className="text-xs text-slate-500">{urdu}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 xl:col-span-2">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search SKU, item, grade, size / تلاش..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(event) =>
              setTypeFilter(event.target.value as "all" | ItemType)
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
          >
            <option value="all">All Types / تمام اقسام</option>
            <option value="raw">Raw / خام مال</option>
            <option value="component">Component / جزو</option>
            <option value="finished">Finished / تیار مال</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
          >
            <option value="all">All Categories / تمام کیٹیگریز</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <select
            value={warehouseFilter}
            onChange={(event) => setWarehouseFilter(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none"
          >
            <option value="all">All Warehouses / تمام گودام</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            Showing {filteredItems.length} of {items.length} items
            {" / "}
            {filteredItems.length} میں سے {items.length} آئٹمز
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void fetchAll()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />Refresh / تازہ کریں</button>

            <button
              type="button"
              onClick={exportExcel}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />Export / ایکسپورٹ</button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-3.5 w-3.5" />
              Print / PDF
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">
                  Item / آئٹم
                </th>
                <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">
                  Type / قسم
                </th>
                <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">
                  Category / کیٹیگری
                </th>
                <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">
                  Grade / گریڈ
                </th>
                <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">
                  Size / سائز
                </th>
                <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">
                  Unit / یونٹ
                </th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                  Cost / لاگت
                </th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                  Price / قیمت
                </th>
                <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500">
                  Warehouse / گودام
                </th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                  Actions / ایکشن
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-12 text-center text-slate-400"
                  >
                    Loading items... / آئٹمز لوڈ ہو رہے ہیں...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-14 text-center"
                  >
                    <Package className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-3 font-bold text-slate-700">
                      No items found / کوئی آئٹم نہیں ملا
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Add an item or import Excel.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800">
                        {item.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {item.sku}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-700">
                        {item.type ?? "finished"}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {categoryName(item.category_id)}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {item.grade || "—"}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {item.size || "—"}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {item.unit || "kg"}
                    </td>

                    <td className="px-4 py-3 text-right font-medium">
                      {Number(item.cost ?? 0).toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-right font-medium">
                      {Number(item.price ?? 0).toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {warehouseName(item.warehouse_id)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-100"
                          title="Edit / ترمیم"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => void deleteItem(item)}
                          className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-700 hover:bg-rose-100"
                          title="Delete / حذف"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer summary */}
      <div className="flex justify-end text-xs text-slate-500">
        Filtered cost total / فلٹر شدہ لاگت:
        <span className="ml-2 font-bold text-slate-800">
          {totalCost.toLocaleString()}
        </span>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="font-bold text-slate-900">
                  {editingItem
                    ? "Edit Item / آئٹم میں ترمیم"
                    : "Add Item / نیا آئٹم"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Item master information / آئٹم کی بنیادی معلومات
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={saveItem}
              className="space-y-4 p-5"
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    SKU / آئٹم کوڈ *
                  </label>
                  <input
                    value={form.sku}
                    readOnly
                    disabled
                    placeholder="Auto generated / خودکار"
                    className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Auto-generated / خودکار بنے گا
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    Item Name / آئٹم کا نام *
                  </label>
                  <input
                    required
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="e.g. MS Scrap / مثال"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    Type / قسم
                  </label>
                  <select
                    value={form.type}
                    onChange={(event) =>
                      void changeItemType(event.target.value as ItemType)
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
                  >
                    <option value="raw">
                      Raw Material / خام مال
                    </option>
                    <option value="component">
                      Component / جزو
                    </option>
                    <option value="finished">
                      Finished Goods / تیار مال
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    Category / کیٹیگری
                  </label>
                  <select
                    value={form.category_id}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        category_id: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
                  >
                    <option value="">
                      No Category / کوئی کیٹیگری نہیں
                    </option>
                    {categories.map((category) => (
                      <option
                        key={category.id}
                        value={category.id}
                      >
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    Grade / گریڈ
                  </label>
                  <input
                    value={form.grade}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        grade: event.target.value,
                      }))
                    }
                    placeholder="e.g. A / B / Prime / مثال"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    Size / سائز
                  </label>
                  <input
                    value={form.size}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        size: event.target.value,
                      }))
                    }
                    placeholder="e.g. 10mm / مثال"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    Unit / یونٹ
                  </label>
                  <input
                    value={form.unit}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        unit: event.target.value,
                      }))
                    }
                    placeholder="kg"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    Warehouse / گودام
                  </label>
                  <select
                    value={form.warehouse_id}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        warehouse_id: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
                  >
                    <option value="">
                      No Default Warehouse / کوئی ڈیفالٹ گودام نہیں
                    </option>
                    {warehouses.map((warehouse) => (
                      <option
                        key={warehouse.id}
                        value={warehouse.id}
                      >
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    Cost / لاگت
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        cost: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    Sale Price / فروخت قیمت
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        price: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                <strong>Note / نوٹ:</strong> Default Warehouse only
                identifies the item's preferred warehouse. Actual
                stock quantities will be maintained in Warehouse
                Stock and Stock Movements.
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700"
                >
                  <X className="h-4 w-4" />
                  Cancel / منسوخ
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {saving
                    ? "Saving..."
                    : editingItem
                    ? "Update / اپڈیٹ"
                    : "Save / محفوظ کریں"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
