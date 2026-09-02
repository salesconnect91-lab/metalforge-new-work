import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  FileSpreadsheet,
  Printer,
  Upload,
  X,
  Save,
  Warehouse as WarehouseIcon,
  MapPin,
  RefreshCw,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type Warehouse = {
  id: string;
  name: string;
  location: string | null;
  created_at: string;
};

type FormData = {
  name: string;
  location: string;
};

type Notification = {
  type: "success" | "error";
  message: string;
};

const EMPTY_FORM: FormData = {
  name: "",
  location: "",
};

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] =
    useState<Warehouse | null>(null);

  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);

  const [notification, setNotification] =
    useState<Notification | null>(null);

  const showNotification = (
    type: "success" | "error",
    message: string
  ) => {
    setNotification({ type, message });

    window.setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // =========================================================
  // LOAD WAREHOUSES
  // =========================================================

  const fetchWarehouses = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("warehouses")
      .select("id,name,location,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      showNotification(
        "error",
        `Failed to load warehouses / گودام لوڈ نہیں ہوئے: ${error.message}`
      );
      setWarehouses([]);
      setLoading(false);
      return;
    }

    setWarehouses((data ?? []) as Warehouse[]);
    setLoading(false);
  };

  useEffect(() => {
    void fetchWarehouses();
  }, []);

  // =========================================================
  // FILTER
  // =========================================================

  const filteredWarehouses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return warehouses;

    return warehouses.filter((warehouse) => {
      return (
        warehouse.name.toLowerCase().includes(query) ||
        (warehouse.location ?? "").toLowerCase().includes(query)
      );
    });
  }, [warehouses, searchQuery]);

  // =========================================================
  // OPEN ADD
  // =========================================================

  const openAddModal = () => {
    setEditingWarehouse(null);
    setFormData(EMPTY_FORM);
    setModalOpen(true);
  };

  // =========================================================
  // OPEN EDIT
  // =========================================================

  const openEditModal = (warehouse: Warehouse) => {
    setEditingWarehouse(warehouse);

    setFormData({
      name: warehouse.name,
      location: warehouse.location ?? "",
    });

    setModalOpen(true);
  };

  // =========================================================
  // CLOSE MODAL
  // =========================================================

  const closeModal = () => {
    if (saving) return;

    setModalOpen(false);
    setEditingWarehouse(null);
    setFormData(EMPTY_FORM);
  };

  // =========================================================
  // SAVE
  // =========================================================

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    const name = formData.name.trim();
    const location = formData.location.trim();

    if (!name) {
      showNotification(
        "error",
        "Warehouse name is required / گودام کا نام ضروری ہے۔"
      );
      return;
    }

    setSaving(true);

    try {
      // -------------------------------------------------------
      // CHECK DUPLICATE NAME
      // -------------------------------------------------------

      let duplicateQuery = supabase
        .from("warehouses")
        .select("id")
        .ilike("name", name);

      if (editingWarehouse) {
        duplicateQuery = duplicateQuery.neq(
          "id",
          editingWarehouse.id
        );
      }

      const { data: duplicateData, error: duplicateError } =
        await duplicateQuery.limit(1);

      if (duplicateError) {
        throw duplicateError;
      }

      if (duplicateData && duplicateData.length > 0) {
        throw new Error(
          "A warehouse with this name already exists / اس نام کا گودام پہلے سے موجود ہے۔"
        );
      }

      // -------------------------------------------------------
      // UPDATE
      // -------------------------------------------------------

      if (editingWarehouse) {
        const { error } = await supabase
          .from("warehouses")
          .update({
            name,
            location: location || null,
          })
          .eq("id", editingWarehouse.id);

        if (error) {
          throw error;
        }

        showNotification(
          "success",
          "Warehouse updated successfully / گودام کامیابی سے اپڈیٹ ہوگیا۔"
        );
      }

      // -------------------------------------------------------
      // INSERT
      // -------------------------------------------------------

      else {
        const { error } = await supabase
          .from("warehouses")
          .insert({
            name,
            location: location || null,
          });

        if (error) {
          throw error;
        }

        showNotification(
          "success",
          "Warehouse added successfully / گودام کامیابی سے شامل ہوگیا۔"
        );
      }

      setModalOpen(false);
      setEditingWarehouse(null);
      setFormData(EMPTY_FORM);

      await fetchWarehouses();
    } catch (error: unknown) {
      const dbError =
        error && typeof error === "object"
          ? (error as { code?: string; message?: string })
          : null;

      const message =
        dbError?.code === "23505"
          ? "A warehouse with this name already exists / اس نام کا گودام پہلے سے موجود ہے۔"
          : dbError?.message ??
            (error instanceof Error ? error.message : "Unknown error");

      showNotification(
        "error",
        `Save failed / محفوظ نہیں ہوسکا: ${message}`
      );
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // DELETE
  // =========================================================

  const handleDelete = async (warehouse: Warehouse) => {
    const confirmed = window.confirm(
      `Delete warehouse "${warehouse.name}"?\n\n` +
        `"${warehouse.name}" گودام حذف کرنا ہے؟\n\n` +
        `If stock is linked to this warehouse, deletion may fail.`
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("warehouses")
      .delete()
      .eq("id", warehouse.id);

    if (error) {
      const message =
        error.code === "23503"
          ? "This warehouse is already used by items, godowns, stock, or transactions and cannot be deleted."
          : error.message;

      showNotification(
        "error",
        `Delete failed / حذف نہیں ہوسکا: ${message}`
      );
      return;
    }

    showNotification(
      "success",
      "Warehouse deleted successfully / گودام کامیابی سے حذف ہوگیا۔"
    );

    await fetchWarehouses();
  };

  // =========================================================
  // EXCEL EXPORT
  // =========================================================

  const exportToExcel = () => {
    if (warehouses.length === 0) {
      showNotification(
        "error",
        "No warehouses to export / ایکسپورٹ کرنے کے لیے کوئی گودام نہیں۔"
      );
      return;
    }

    const rows = warehouses.map((warehouse) => ({
      "Warehouse Name": warehouse.name,
      "Location / Address": warehouse.location ?? "",
      "Created At": warehouse.created_at,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Warehouses"
    );

    XLSX.writeFile(
      workbook,
      "warehouses_master.xlsx"
    );

    showNotification(
      "success",
      "Excel exported successfully / ایکسل کامیابی سے ایکسپورٹ ہوگئی۔"
    );
  };

  // =========================================================
  // EXCEL IMPORT
  // =========================================================

  const handleExcelImport = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (loadEvent) => {
      try {
        const result = loadEvent.target?.result;

        if (!result) {
          throw new Error("Could not read Excel file.");
        }

        const workbook = XLSX.read(result, {
          type: "array",
        });

        const firstSheetName = workbook.SheetNames[0];

        if (!firstSheetName) {
          throw new Error(
            "Excel file contains no worksheet."
          );
        }

        const worksheet =
          workbook.Sheets[firstSheetName];

        const rawRows = XLSX.utils.sheet_to_json<
          Record<string, unknown>
        >(worksheet);

        if (rawRows.length === 0) {
          throw new Error(
            "Excel file is empty / ایکسل فائل خالی ہے۔"
          );
        }

        const normalizedRows = rawRows
          .map((row) => {
            const normalized: Record<string, unknown> = {};

            Object.entries(row).forEach(
              ([key, value]) => {
                normalized[
                  key.trim().toLowerCase().replace(/\s+/g, "_")
                ] = value;
              }
            );

            return normalized;
          })
          .map((row) => ({
            name: String(
              row.warehouse_name ??
                row.name ??
                ""
            ).trim(),

            location: String(
              row.location ??
                row.address ??
                ""
            ).trim(),
          }))
          .filter((row) => row.name);

        if (normalizedRows.length === 0) {
          throw new Error(
            "No valid warehouse rows found. Use Warehouse Name and Location columns."
          );
        }

        // Remove duplicates inside imported file
        const uniqueRows = Array.from(
          new Map(
            normalizedRows.map((row) => [
              row.name.toLowerCase(),
              row,
            ])
          ).values()
        );

        // Existing names
        const existingNames = new Set(
          warehouses.map((warehouse) =>
            warehouse.name.trim().toLowerCase()
          )
        );

        const rowsToInsert = uniqueRows
          .filter(
            (row) =>
              !existingNames.has(
                row.name.toLowerCase()
              )
          )
          .map((row) => ({
            name: row.name,
            location: row.location || null,
          }));

        if (rowsToInsert.length === 0) {
          throw new Error(
            "All imported warehouses already exist / تمام گودام پہلے سے موجود ہیں۔"
          );
        }

        const { error } = await supabase
          .from("warehouses")
          .insert(rowsToInsert);

        if (error) {
          throw error;
        }

        showNotification(
          "success",
          `${rowsToInsert.length} warehouse(s) imported successfully / ${rowsToInsert.length} گودام کامیابی سے امپورٹ ہوگئے۔`
        );

        await fetchWarehouses();
      } catch (error: unknown) {
        const dbError =
          error && typeof error === "object"
            ? (error as { code?: string; message?: string })
            : null;

        const message =
          dbError?.code === "23505"
            ? "One or more warehouse names already exist. Refresh the page and try the import again."
            : dbError?.message ??
              (error instanceof Error
                ? error.message
                : "Import failed.");

        showNotification(
          "error",
          `Import failed / امپورٹ ناکام: ${message}`
        );
      } finally {
        event.target.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // =========================================================
  // DOWNLOAD TEMPLATE
  // =========================================================

  const downloadTemplate = () => {
    const rows = [
      {
        "Warehouse Name": "Main Godown",
        "Location / Address": "Lahore",
      },
      {
        "Warehouse Name": "Cutting Godown",
        "Location / Address": "Lahore",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Warehouses"
    );

    XLSX.writeFile(
      workbook,
      "warehouse_import_template.xlsx"
    );

    showNotification(
      "success",
      "Template downloaded / ٹیمپلیٹ ڈاؤن لوڈ ہوگیا۔"
    );
  };

  // =========================================================
  // FORMAT DATE
  // =========================================================

  const formatDate = (value: string) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-5">
      {/* =====================================================
          NOTIFICATION
          ===================================================== */}

      {notification && (
        <div
          className={`fixed right-5 top-5 z-[100] max-w-md rounded-xl border px-4 py-3 text-sm font-medium shadow-xl ${
            notification.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <WarehouseIcon className="h-6 w-6 text-slate-700" />

            <h1 className="text-xl font-bold text-slate-900">
              Warehouses / گودام
            </h1>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            Manage warehouses and godowns / گوداموں کا انتظام
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />

          Add Warehouse
          <span className="font-normal">
            / گودام شامل کریں
          </span>
        </button>
      </div>

      {/* =====================================================
          SUMMARY
          ===================================================== */}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Total Warehouses
              </p>

              <p className="mt-1 text-2xl font-bold text-slate-900">
                {warehouses.length}
              </p>

              <p className="text-xs text-slate-500">
                کل گودام
              </p>
            </div>

            <div className="rounded-xl bg-slate-100 p-3">
              <WarehouseIcon className="h-5 w-5 text-slate-600" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Search Results
            </p>

            <p className="mt-1 text-2xl font-bold text-slate-900">
              {filteredWarehouses.length}
            </p>

            <p className="text-xs text-slate-500">
              تلاش کے نتائج
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Current Module
            </p>

            <p className="mt-1 text-lg font-bold text-slate-900">
              Warehouse Master
            </p>

            <p className="text-xs text-slate-500">
              گودام ماسٹر
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================
          TOOLBAR
          ===================================================== */}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          {/* Search */}

          <div className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />

            <input
              type="text"
              value={searchQuery}
              onChange={(event) =>
                setSearchQuery(event.target.value)
              }
              placeholder="Search warehouse or location / گودام یا مقام تلاش کریں..."
              className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />

            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Actions */}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void fetchWarehouses()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />Refresh / تازہ کریں</button>

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">
              <Upload className="h-4 w-4" />
              Import Excel
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelImport}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Template
            </button>

            <button
              type="button"
              onClick={exportToExcel}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              <Printer className="h-4 w-4" />
              Print / PDF
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================
          TABLE
          ===================================================== */}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-bold text-slate-900">
              Warehouse List / گوداموں کی فہرست
            </h2>

            <p className="mt-0.5 text-xs text-slate-500">
              {filteredWarehouses.length} record(s)
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-14 text-center text-sm text-slate-400">
            Loading warehouses...
            <br />
            گودام لوڈ ہو رہے ہیں...
          </div>
        ) : filteredWarehouses.length === 0 ? (
          <div className="p-14 text-center">
            <WarehouseIcon className="mx-auto h-10 w-10 text-slate-300" />

            <h3 className="mt-3 font-bold text-slate-700">
              No warehouses found
            </h3>

            <p className="mt-1 text-sm text-slate-400">
              کوئی گودام موجود نہیں
            </p>

            <button
              type="button"
              onClick={openAddModal}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white"
            >
              <Plus className="h-4 w-4" />
              Add Warehouse / گودام شامل کریں
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-500">
                    #
                  </th>

                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Warehouse / گودام
                  </th>

                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Location / مقام
                  </th>

                  <th className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Created / تاریخ
                  </th>

                  <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wide text-slate-500">
                    Actions / ایکشن
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredWarehouses.map(
                  (warehouse, index) => (
                    <tr
                      key={warehouse.id}
                      className="transition-colors hover:bg-slate-50"
                    >
                      <td className="px-5 py-4 text-slate-400">
                        {index + 1}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-slate-100 p-2">
                            <WarehouseIcon className="h-4 w-4 text-slate-600" />
                          </div>

                          <div>
                            <div className="font-bold text-slate-800">
                              {warehouse.name}
                            </div>

                            <div className="text-xs text-slate-400">
                              ID: {warehouse.id.slice(0, 8)}...
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 text-slate-600">
                          <MapPin className="h-4 w-4 text-slate-400" />

                          {warehouse.location || "—"}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {formatDate(warehouse.created_at)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              openEditModal(warehouse)
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />Edit / ترمیم</button>

                          <button
                            type="button"
                            onClick={() =>
                              void handleDelete(warehouse)
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />Delete / حذف کریں</button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =====================================================
          ADD / EDIT MODAL
          ===================================================== */}

      {modalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Modal Header */}

            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="font-bold text-slate-900">
                  {editingWarehouse
                    ? "Edit Warehouse / گودام میں ترمیم"
                    : "Add Warehouse / نیا گودام"}
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  {editingWarehouse
                    ? "Update warehouse information / گودام کی معلومات اپڈیٹ کریں"
                    : "Create a new warehouse / نیا گودام بنائیں"}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form */}

            <form
              onSubmit={handleSubmit}
              className="space-y-5 p-5"
            >
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  Warehouse Name / گودام کا نام
                  <span className="ml-1 text-rose-500">
                    *
                  </span>
                </label>

                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="e.g. Main Godown / مین گودام"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  Location / Address / مقام
                </label>

                <input
                  type="text"
                  value={formData.location}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      location: event.target.value,
                    }))
                  }
                  placeholder="e.g. Lahore / لاہور"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                />
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                <strong>Note / نوٹ:</strong>{" "}
                Warehouse creation only creates the
                warehouse master record. Stock quantity will
                be handled separately.
                <br />
                گودام بنانے سے صرف ماسٹر ریکارڈ بنے گا؛ اسٹاک
                کی مقدار الگ سے مینج ہوگی۔
              </div>

              {/* Buttons */}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  Cancel / منسوخ
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />

                  {saving
                    ? "Saving..."
                    : editingWarehouse
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