import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type UomRow = {
  id: string;
  name: string;
  symbol: string;
  created_at: string;
};

type UomForm = {
  name: string;
  symbol: string;
};

type Notification = {
  type: "success" | "error";
  message: string;
};

const EMPTY_FORM: UomForm = {
  name: "",
  symbol: "",
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const readCell = (
  row: Record<string, unknown>,
  possibleKeys: string[]
): string => {
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalize(key).replace(/[\s_-]+/g, "");

    if (
      possibleKeys.some(
        (candidate) =>
          normalizedKey === normalize(candidate).replace(/[\s_-]+/g, "")
      )
    ) {
      return String(value ?? "").trim();
    }
  }

  return "";
};

export default function Uom() {
  const [rows, setRows] = useState<UomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [notification, setNotification] =
    useState<Notification | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UomRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<UomRow | null>(null);
  const [form, setForm] = useState<UomForm>(EMPTY_FORM);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showNotification = (
    type: Notification["type"],
    message: string
  ) => {
    setNotification({ type, message });

    window.setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const fetchData = async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("uom")
        .select("id,name,symbol,created_at")
        .order("name", { ascending: true });

      if (error) throw error;

      setRows((data ?? []) as UomRow[]);
    } catch (error) {
      console.error(error);

      showNotification(
        "error",
        error instanceof Error
          ? error.message
          : "Unable to load units of measure."
      );

      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const filteredRows = useMemo(() => {
    const query = normalize(searchQuery);

    if (!query) return rows;

    return rows.filter(
      (row) =>
        normalize(row.name).includes(query) ||
        normalize(row.symbol).includes(query)
    );
  }, [rows, searchQuery]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (row: UomRow) => {
    setEditing(row);
    setForm({
      name: row.name,
      symbol: row.symbol,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;

    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const validateForm = () => {
    const name = form.name.trim();
    const symbol = form.symbol.trim();

    if (!name) {
      showNotification("error", "Unit name is required.");
      return null;
    }

    if (!symbol) {
      showNotification("error", "Unit symbol is required.");
      return null;
    }

    if (name.length > 100) {
      showNotification(
        "error",
        "Unit name must be 100 characters or less."
      );
      return null;
    }

    if (symbol.length > 30) {
      showNotification(
        "error",
        "Unit symbol must be 30 characters or less."
      );
      return null;
    }

    return {
      name,
      symbol,
    };
  };

  const handleSaveRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const values = validateForm();

    if (!values) return;

    setSaving(true);

    try {
      const duplicateName = supabase
        .from("uom")
        .select("id")
        .ilike("name", values.name)
        .limit(1);

      const duplicateSymbol = supabase
        .from("uom")
        .select("id")
        .ilike("symbol", values.symbol)
        .limit(1);

      const [nameResult, symbolResult] = editing
        ? await Promise.all([
            duplicateName.neq("id", editing.id),
            duplicateSymbol.neq("id", editing.id),
          ])
        : await Promise.all([duplicateName, duplicateSymbol]);

      if (nameResult.error) throw nameResult.error;
      if (symbolResult.error) throw symbolResult.error;

      if ((nameResult.data ?? []).length > 0) {
        showNotification(
          "error",
          `Unit name "${values.name}" already exists.`
        );
        return;
      }

      if ((symbolResult.data ?? []).length > 0) {
        showNotification(
          "error",
          `Unit symbol "${values.symbol}" already exists.`
        );
        return;
      }

      if (editing) {
        const { error } = await supabase
          .from("uom")
          .update({
            name: values.name,
            symbol: values.symbol,
          })
          .eq("id", editing.id);

        if (error) throw error;

        showNotification("success", "Unit updated successfully.");
      } else {
        const { error } = await supabase.from("uom").insert({
          name: values.name,
          symbol: values.symbol,
        });

        if (error) throw error;

        showNotification("success", "Unit created successfully.");
      }

      setModalOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      await fetchData();
    } catch (error) {
      console.error(error);

      const message =
        error instanceof Error ? error.message : "Unable to save unit.";

      if (
        message.toLowerCase().includes("duplicate") ||
        message.toLowerCase().includes("unique")
      ) {
        showNotification(
          "error",
          "A unit with this name or symbol already exists."
        );
      } else {
        showNotification("error", message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRow) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from("uom")
        .delete()
        .eq("id", deleteRow.id);

      if (error) throw error;

      showNotification("success", "Unit deleted successfully.");
      setDeleteRow(null);
      await fetchData();
    } catch (error) {
      console.error(error);

      showNotification(
        "error",
        error instanceof Error
          ? error.message
          : "Unable to delete unit."
      );
    } finally {
      setSaving(false);
    }
  };

  const exportToExcel = () => {
    if (rows.length === 0) {
      showNotification("error", "No data available to export.");
      return;
    }

    const exportRows = rows.map((row) => ({
      Name: row.name,
      Symbol: row.symbol,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "UOM");
    XLSX.writeFile(workbook, "uom_master.xlsx");

    showNotification("success", "Excel exported successfully.");
  };

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.json_to_sheet([
      {
        Name: "Kilogram",
        Symbol: "kg",
      },
      {
        Name: "Piece",
        Symbol: "pcs",
      },
    ]);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "UOM Template");
    XLSX.writeFile(workbook, "uom_import_template.xlsx");
  };

  const handleFileUpload = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });

      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

      if (!firstSheet) {
        throw new Error("Excel file does not contain a worksheet.");
      }

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        firstSheet,
        {
          defval: "",
        }
      );

      if (rawRows.length === 0) {
        throw new Error("Excel file does not contain any records.");
      }

      const parsedRows = rawRows
        .map((row, index) => ({
          rowNumber: index + 2,
          name: readCell(row, [
            "Name",
            "Unit Name",
            "UOM Name",
            "Unit",
          ]),
          symbol: readCell(row, [
            "Symbol",
            "Unit Symbol",
            "UOM Symbol",
            "Abbreviation",
          ]),
        }))
        .filter((row) => row.name || row.symbol);

      if (parsedRows.length === 0) {
        throw new Error(
          'No valid rows found. Required columns are "Name" and "Symbol".'
        );
      }

      const invalidRow = parsedRows.find(
        (row) => !row.name.trim() || !row.symbol.trim()
      );

      if (invalidRow) {
        throw new Error(
          `Row ${invalidRow.rowNumber}: both Name and Symbol are required.`
        );
      }

      const namesSeen = new Set<string>();
      const symbolsSeen = new Set<string>();

      for (const row of parsedRows) {
        const normalizedName = normalize(row.name);
        const normalizedSymbol = normalize(row.symbol);

        if (namesSeen.has(normalizedName)) {
          throw new Error(
            `Duplicate unit name "${row.name}" found in import file.`
          );
        }

        if (symbolsSeen.has(normalizedSymbol)) {
          throw new Error(
            `Duplicate unit symbol "${row.symbol}" found in import file.`
          );
        }

        namesSeen.add(normalizedName);
        symbolsSeen.add(normalizedSymbol);
      }

      const existingNames = new Set(rows.map((row) => normalize(row.name)));
      const existingSymbols = new Set(
        rows.map((row) => normalize(row.symbol))
      );

      const existingDuplicate = parsedRows.find(
        (row) =>
          existingNames.has(normalize(row.name)) ||
          existingSymbols.has(normalize(row.symbol))
      );

      if (existingDuplicate) {
        throw new Error(
          `Unit "${existingDuplicate.name}" / "${existingDuplicate.symbol}" already exists.`
        );
      }

      const payload = parsedRows.map((row) => ({
        name: row.name.trim(),
        symbol: row.symbol.trim(),
      }));

      const { error } = await supabase.from("uom").insert(payload);

      if (error) throw error;

      showNotification(
        "success",
        `${payload.length} unit${payload.length === 1 ? "" : "s"} imported successfully.`
      );

      await fetchData();
    } catch (error) {
      console.error(error);

      showNotification(
        "error",
        error instanceof Error ? error.message : "Excel import failed."
      );
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {notification && (
        <div
          className={`fixed right-5 top-5 z-[70] flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-bold shadow-lg ${
            notification.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}

          {notification.message}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-md flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />

          <input
            type="text"
            placeholder="Search units... / اکائیاں تلاش کریں..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full bg-transparent text-xs text-slate-800 outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
          >
            <FileDown className="h-4 w-4" />
            Template
          </button>

          <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">
            <Upload className="h-4 w-4" />
            Import Excel

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={exportToExcel}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
          >
            <Printer className="h-4 w-4" />
            Print / PDF
          </button>

          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            Add Unit
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">
            Loading units...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-16 text-center">
            <FileDown className="mx-auto mb-3 h-10 w-10 text-slate-300" />

            <h3 className="text-sm font-bold text-slate-700">
              No units found
            </h3>

            <p className="mt-1 text-xs text-slate-400">
              Add a unit or import an Excel file.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="p-3.5">Unit Name / اکائی نام</th>
                  <th className="p-3.5">Symbol / علامت</th>
                  <th className="p-3.5">Created / بنایا گیا</th>
                  <th className="p-3.5 text-right">Actions / کارروائیاں</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-slate-50"
                  >
                    <td className="p-3.5 font-semibold text-slate-900">
                      {row.name}
                    </td>

                    <td className="p-3.5">
                      <span className="rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-700">
                        {row.symbol}
                      </span>
                    </td>

                    <td className="p-3.5 text-slate-500">
                      {row.created_at
                        ? new Date(row.created_at).toLocaleDateString()
                        : "-"}
                    </td>

                    <td className="p-3.5">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                          title="Edit unit / اکائی تبدیل کریں"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeleteRow(row)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                          title="Delete unit / اکائی حذف کریں"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">
                {editing ? "Edit Unit of Measure" : "Add Unit of Measure"}
              </h3>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRecord} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600">Unit Name / اکائی نام</label>

                <input
                  type="text"
                  required
                  autoFocus
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="e.g. Kilogram / مثال: کلوگرام"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-slate-600">Symbol / علامت</label>

                <input
                  type="text"
                  required
                  value={form.symbol}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      symbol: event.target.value,
                    }))
                  }
                  placeholder="e.g. kg / مثال"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-primary-500"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                >Cancel / منسوخ کریں</button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : editing
                      ? "Save Changes"
                      : "Create Unit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteRow && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-base font-black text-slate-900">
              Delete Unit
            </h3>

            <p className="mt-2 text-xs leading-5 text-slate-600">
              Delete{" "}
              <strong>
                {deleteRow.name} ({deleteRow.symbol})
              </strong>
              ? This action cannot be undone.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDeleteRow(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
              >Cancel / منسوخ کریں</button>

              <button
                type="button"
                disabled={saving}
                onClick={handleDelete}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {saving ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
