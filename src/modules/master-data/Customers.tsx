import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import { Customer } from "@/types";
import DataTable, { Column } from "@/components/DataTable";
import {
  PageHeader,
  Modal,
  ErrorBanner,
  ConfirmModal,
} from "@/components/ui";

export default function Customers() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows(data ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      email: "",
      phone: "",
      address: "",
    });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (row: Customer) => {
    setEditing(row);
    setForm({
      name: row.name,
      email: row.email ?? "",
      phone: row.phone ?? "",
      address: row.address ?? "",
    });
    setError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);

    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
    };

    if (!payload.name) {
      setError("Customer name is required.");
      return;
    }

    if (editing) {
      const { error } = await supabase
        .from("customers")
        .update(payload)
        .eq("id", editing.id);

      if (error) {
        setError(error.message);
        return;
      }
    } else {
      const { error } = await supabase.rpc("create_customer_with_ar", {
        p_name: payload.name,
        p_email: payload.email,
        p_phone: payload.phone,
        p_address: payload.address,
      });

      if (error) {
        setError(error.message);
        return;
      }
    }

    setModalOpen(false);
    setEditing(null);
    setForm({
      name: "",
      email: "",
      phone: "",
      address: "",
    });

    await fetchRows();
  };

  const handleStatusChange = async () => {
    if (!deleteId) return;

    setError(null);

    const customer = rows.find((row) => row.id === deleteId);
    if (!customer) return;

    const { error } = await supabase
      .from("customers")
      .update({ is_active: customer.is_active === false })
      .eq("id", deleteId);

    if (error) {
      setError(error.message);
      setDeleteId(null);
      return;
    }

    setDeleteId(null);
    await fetchRows();
  };

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.json_to_sheet([
      {
        Name: "Example Customer",
        Email: "example@email.com",
        Phone: "03001234567",
        Address: "Business Address",
      },
    ]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
    XLSX.writeFile(workbook, "customers_import_template.xlsx");
  };

  const exportExcel = () => {
    if (!rows.length) {
      setError("No customers to export.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(
      rows.map((row) => ({
        Name: row.name,
        Email: row.email ?? "",
        Phone: row.phone ?? "",
        Address: row.address ?? "",
      }))
    );

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
    XLSX.writeFile(workbook, "customers_export.xlsx");
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    setError(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      if (!sheet) throw new Error("Uploaded file does not contain a worksheet.");

      const imported = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });

      if (!imported.length) throw new Error("Uploaded file is empty.");

      const existingNames = new Set(
        rows.map((row) => row.name.trim().toLowerCase())
      );
      const fileNames = new Set<string>();
      const valid: Array<{
        name: string;
        email: string | null;
        phone: string | null;
        address: string | null;
      }> = [];
      const errors: string[] = [];

      imported.forEach((raw, index) => {
        const normalized = Object.fromEntries(
          Object.entries(raw).map(([key, value]) => [
            key.trim().toLowerCase(),
            String(value ?? "").trim(),
          ])
        );

        const name =
          normalized["name"] ||
          normalized["customer name"] ||
          normalized["party name"] ||
          "";
        const email = normalized["email"] || "";
        const phone = normalized["phone"] || normalized["mobile"] || "";
        const address = normalized["address"] || "";

        if (!name) {
          errors.push(`Row ${index + 2}: Name is required.`);
          return;
        }

        const key = name.toLowerCase();

        if (existingNames.has(key)) {
          errors.push(`Row ${index + 2}: "${name}" already exists.`);
          return;
        }

        if (fileNames.has(key)) {
          errors.push(`Row ${index + 2}: Duplicate "${name}" in import file.`);
          return;
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push(`Row ${index + 2}: Invalid email "${email}".`);
          return;
        }

        fileNames.add(key);
        valid.push({
          name,
          email: email || null,
          phone: phone || null,
          address: address || null,
        });
      });

      if (errors.length) {
        throw new Error(
          `Import validation failed:\n${errors.slice(0, 20).join("\n")}${
            errors.length > 20 ? `\n...and ${errors.length - 20} more error(s).` : ""
          }`
        );
      }

      if (!valid.length) throw new Error("No valid rows found.");

      // Preserve accounting setup: create every party through its RPC.
      for (const row of valid) {
        const { error: rpcError } = await supabase.rpc("create_customer_with_ar", {
          p_name: row.name,
          p_email: row.email,
          p_phone: row.phone,
          p_address: row.address,
        });

        if (rpcError) {
          throw new Error(`Failed to import "${row.name}": ${rpcError.message}`);
        }
      }

      await fetchRows();
      alert(
        `${valid.length} customers imported successfully / کامیابی سے امپورٹ ہوگئے۔`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const columns: Column<Customer>[] = [
    {
      key: "name",
      label: "Name / نام",
      render: (r) => (
        <span className="font-medium text-slate-900">{r.name}</span>
      ),
    },
    {
      key: "email",
      label: "Email / ای میل",
      render: (r) => r.email ?? "—",
    },
    {
      key: "phone",
      label: "Phone / فون",
      render: (r) => r.phone ?? "—",
    },
    {
      key: "address",
      label: "Address / پتہ",
      render: (r) => r.address ?? "—",
    },
    {
      key: "status",
      label: "Status / حیثیت",
      render: (r) => (
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.is_active === false ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>
          {r.is_active === false ? "Inactive" : "Active"}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      className: "text-right",
      render: (r) => (
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => openEdit(r)}
            className="text-primary-600 hover:text-primary-700 text-sm font-medium"
          >Edit / ترمیم</button>

          <button
            onClick={() => setDeleteId(r.id)}
            className={`${r.is_active === false ? "text-emerald-600 hover:text-emerald-700" : "text-amber-600 hover:text-amber-700"} text-sm font-medium`}
          >{r.is_active === false ? "Activate" : "Deactivate"}</button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customers / گاہک"
        subtitle="Customer accounts / گاہک اکاؤنٹس"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={downloadTemplate} className="btn-secondary">
              Template / ٹیمپلیٹ
            </button>

            <label className={`btn-secondary cursor-pointer ${importing ? "opacity-50" : ""}`}>
              {importing ? "Importing..." : "Import Excel / ایکسل امپورٹ"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={importing}
                onChange={handleImport}
                className="hidden"
              />
            </label>

            <button type="button" onClick={exportExcel} className="btn-secondary">
              Export Excel / ایکسل ایکسپورٹ
            </button>

            <button type="button" onClick={() => window.print()} className="btn-secondary">
              Print / پرنٹ
            </button>

            <button onClick={openCreate} className="btn-primary">
              + New Customer
            </button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} />}

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        emptyMessage="No customers yet."
      />

      <Modal
        open={modalOpen}
        title={editing ? "Edit Customer" : "New Customer"}
        onClose={() => setModalOpen(false)}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name / نام</label>
            <input
              className="input"
              required
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                })
              }
            />
          </div>

          <div>
            <label className="label">Email / ای میل</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm({
                  ...form,
                  email: e.target.value,
                })
              }
            />
          </div>

          <div>
            <label className="label">Phone / فون</label>
            <input
              className="input"
              value={form.phone}
              onChange={(e) =>
                setForm({
                  ...form,
                  phone: e.target.value,
                })
              }
            />
          </div>

          <div>
            <label className="label">Address / پتہ</label>
            <textarea
              className="input"
              rows={2}
              value={form.address}
              onChange={(e) =>
                setForm({
                  ...form,
                  address: e.target.value,
                })
              }
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="btn-secondary"
            >Cancel / منسوخ کریں</button>

            <button type="submit" className="btn-primary">
              {editing ? "Save Changes" : "Create Customer"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        title={`${rows.find((row) => row.id === deleteId)?.is_active === false ? "Activate" : "Deactivate"} Customer`}
        message="Historical transactions will remain safe. Inactive customers cannot be selected for new transactions."
        onConfirm={handleStatusChange}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
