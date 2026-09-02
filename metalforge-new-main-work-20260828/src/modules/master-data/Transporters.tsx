import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
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

type Transporter = {
  id: string;
  name: string;
  vehicle_no: string | null;
  phone: string | null;
  created_at: string;
};

type TransporterForm = {
  name: string;
  vehicle_no: string;
  phone: string;
};

type Notification = {
  type: "success" | "error";
  message: string;
};

const EMPTY_FORM: TransporterForm = {
  name: "",
  vehicle_no: "",
  phone: "",
};

const normalize = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();

const readCell = (
  row: Record<string, unknown>,
  candidates: string[]
): string => {
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalize(key).replace(/[\s_-]+/g, "");

    if (
      candidates.some(
        (candidate) =>
          normalizedKey === normalize(candidate).replace(/[\s_-]+/g, "")
      )
    ) {
      return String(value ?? "").trim();
    }
  }

  return "";
};

export default function Transporters() {
  const [rows, setRows] = useState<Transporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [notification, setNotification] =
    useState<Notification | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transporter | null>(null);
  const [deleteRow, setDeleteRow] = useState<Transporter | null>(null);

  const [form, setForm] = useState<TransporterForm>(EMPTY_FORM);

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
        .from("transporters")
        .select("id,name,vehicle_no,phone,created_at")
        .order("name", { ascending: true });

      if (error) throw error;

      setRows((data ?? []) as Transporter[]);
    } catch (error) {
      console.error(error);

      showNotification(
        "error",
        error instanceof Error
          ? error.message
          : "Unable to load transporters."
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
        normalize(row.vehicle_no).includes(query) ||
        normalize(row.phone).includes(query)
    );
  }, [rows, searchQuery]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (row: Transporter) => {
    setEditing(row);

    setForm({
      name: row.name,
      vehicle_no: row.vehicle_no ?? "",
      phone: row.phone ?? "",
    });

    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;

    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = form.name.trim();
    const vehicleNo = form.vehicle_no.trim();
    const phone = form.phone.trim();

    if (!name) {
      showNotification("error", "Transporter name is required.");
      return;
    }

    setSaving(true);

    try {
      let duplicateQuery = supabase
        .from("transporters")
        .select("id")
        .ilike("name", name)
        .limit(1);

      if (editing) {
        duplicateQuery = duplicateQuery.neq("id", editing.id);
      }

      const { data: duplicate, error: duplicateError } =
        await duplicateQuery;

      if (duplicateError) throw duplicateError;

      if ((duplicate ?? []).length > 0) {
        showNotification(
          "error",
          `Transporter "${name}" already exists.`
        );
        return;
      }

      const payload = {
        name,
        vehicle_no: vehicleNo || null,
        phone: phone || null,
      };

      if (editing) {
        const { error } = await supabase
          .from("transporters")
          .update(payload)
          .eq("id", editing.id);

        if (error) throw error;

        showNotification(
          "success",
          "Transporter updated successfully."
        );
      } else {
        const { error } = await supabase
          .from("transporters")
          .insert(payload);

        if (error) throw error;

        showNotification(
          "success",
          "Transporter created successfully."
        );
      }

      setModalOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);

      await fetchData();
    } catch (error) {
      console.error(error);

      const message =
        error instanceof Error
          ? error.message
          : "Unable to save transporter.";

      if (
        message.toLowerCase().includes("duplicate") ||
        message.toLowerCase().includes("unique")
      ) {
        showNotification(
          "error",
          "A transporter with this name already exists."
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
        .from("transporters")
        .delete()
        .eq("id", deleteRow.id);

      if (error) throw error;

      showNotification(
        "success",
        "Transporter deleted successfully."
      );

      setDeleteRow(null);
      await fetchData();
    } catch (error) {
      console.error(error);

      showNotification(
        "error",
        error instanceof Error
          ? error.message
          : "Unable to delete transporter."
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
      "Vehicle Number": row.vehicle_no ?? "",
      Phone: row.phone ?? "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Transporters"
    );

    XLSX.writeFile(
      workbook,
      "transporters_master.xlsx"
    );

    showNotification(
      "success",
      "Excel exported successfully."
    );
  };

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.json_to_sheet([
      {
        Name: "ABC Transport",
        "Vehicle Number": "LEA-1234",
        Phone: "03001234567",
      },
    ]);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Transporter Template"
    );

    XLSX.writeFile(
      workbook,
      "transporters_import_template.xlsx"
    );
  };

  const handleFileUpload = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: "array",
      });

      const sheet =
        workbook.Sheets[workbook.SheetNames[0]];

      if (!sheet) {
        throw new Error(
          "Excel file does not contain a worksheet."
        );
      }

      const rawRows =
        XLSX.utils.sheet_to_json<Record<string, unknown>>(
          sheet,
          { defval: "" }
        );

      if (rawRows.length === 0) {
        throw new Error(
          "Excel file does not contain any records."
        );
      }

      const parsedRows = rawRows
        .map((row, index) => ({
          rowNumber: index + 2,
          name: readCell(row, [
            "Name",
            "Transporter Name",
            "Transporter",
          ]),
          vehicle_no: readCell(row, [
            "Vehicle Number",
            "Vehicle No",
            "Vehicle",
            "Vehicle Details",
          ]),
          phone: readCell(row, [
            "Phone",
            "Phone Number",
            "Mobile",
            "Contact",
          ]),
        }))
        .filter(
          (row) =>
            row.name ||
            row.vehicle_no ||
            row.phone
        );

      const invalid = parsedRows.find(
        (row) => !row.name.trim()
      );

      if (invalid) {
        throw new Error(
          `Row ${invalid.rowNumber}: Transporter Name is required.`
        );
      }

      const seenNames = new Set<string>();

      for (const row of parsedRows) {
        const key = normalize(row.name);

        if (seenNames.has(key)) {
          throw new Error(
            `Duplicate transporter "${row.name}" found in import file.`
          );
        }

        seenNames.add(key);
      }

      const existingNames = new Set(
        rows.map((row) => normalize(row.name))
      );

      const existingDuplicate =
        parsedRows.find((row) =>
          existingNames.has(normalize(row.name))
        );

      if (existingDuplicate) {
        throw new Error(
          `Transporter "${existingDuplicate.name}" already exists.`
        );
      }

      const payload = parsedRows.map((row) => ({
        name: row.name.trim(),
        vehicle_no:
          row.vehicle_no.trim() || null,
        phone: row.phone.trim() || null,
      }));

      if (payload.length === 0) {
        throw new Error(
          "No valid transporter rows found."
        );
      }

      const { error } = await supabase
        .from("transporters")
        .insert(payload);

      if (error) throw error;

      showNotification(
        "success",
        `${payload.length} transporter${
          payload.length === 1 ? "" : "s"
        } imported successfully.`
      );

      await fetchData();
    } catch (error) {
      console.error(error);

      showNotification(
        "error",
        error instanceof Error
          ? error.message
          : "Excel import failed."
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

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-md flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <Search className="h-4 w-4 text-slate-400" />

          <input
            type="text"
            value={searchQuery}
            onChange={(event) =>
              setSearchQuery(event.target.value)
            }
            placeholder="Search transporters... / ٹرانسپورٹر تلاش کریں..."
            className="w-full bg-transparent text-xs outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-2">
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
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileUpload}
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
            className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            Add Transporter
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">
            Loading transporters...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-14 text-center text-xs text-slate-400">
            No transporters found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 uppercase text-slate-500">
                  <th className="p-3.5">
                    Transporter
                  </th>

                  <th className="p-3.5">
                    Vehicle Number
                  </th>

                  <th className="p-3.5">
                    Phone
                  </th>

                  <th className="p-3.5">
                    Created
                  </th>

                  <th className="p-3.5 text-right">Actions / کارروائیاں</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50"
                  >
                    <td className="p-3.5 font-bold text-slate-900">
                      {row.name}
                    </td>

                    <td className="p-3.5">
                      {row.vehicle_no || "—"}
                    </td>

                    <td className="p-3.5">
                      {row.phone || "—"}
                    </td>

                    <td className="p-3.5 text-slate-500">
                      {new Date(
                        row.created_at
                      ).toLocaleDateString()}
                    </td>

                    <td className="p-3.5">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            openEdit(row)
                          }
                          className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setDeleteRow(row)
                          }
                          className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-black text-slate-900">
                {editing
                  ? "Edit Transporter"
                  : "Add Transporter"}
              </h3>

              <button
                type="button"
                onClick={closeModal}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleSave}
              className="space-y-4"
            >
              <div>
                <label className="label">
                  Transporter Name
                </label>

                <input
                  required
                  autoFocus
                  className="input"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="label">
                  Vehicle Number / Details
                </label>

                <input
                  className="input"
                  value={form.vehicle_no}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      vehicle_no:
                        event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="label">
                  Phone
                </label>

                <input
                  className="input"
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="flex justify-end gap-2 border-t pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn-secondary"
                >Cancel / منسوخ کریں</button>

                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving
                    ? "Saving..."
                    : editing
                      ? "Save Changes"
                      : "Create Transporter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteRow && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-black text-slate-900">
              Delete Transporter
            </h3>

            <p className="mt-2 text-xs text-slate-600">
              Delete{" "}
              <strong>{deleteRow.name}</strong>?
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setDeleteRow(null)
                }
                className="btn-secondary"
              >Cancel / منسوخ کریں</button>

              <button
                type="button"
                disabled={saving}
                onClick={handleDelete}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white"
              >
                {saving
                  ? "Deleting..."
                  : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
