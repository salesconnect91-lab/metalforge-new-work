import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DataTable, { Column } from "@/components/DataTable";
import {
  ConfirmModal,
  ErrorBanner,
  Modal,
  PageHeader,
} from "@/components/ui";

type Category = {
  id: string;
  name: string;
  sub_category: string | null;
  description: string | null;
  created_at: string;
};

type CategoryForm = {
  name: string;
  sub_category: string;
  description: string;
};

const EMPTY_FORM: CategoryForm = {
  name: "",
  sub_category: "",
  description: "",
};

export default function Categories() {
  const [rows, setRows] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);

  const fetchCategories = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("categories")
      .select("id,name,sub_category,description,created_at")
      .order("name", { ascending: true });

    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setError(null);
      setRows((data ?? []) as Category[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (row: Category) => {
    setEditing(row);

    setForm({
      name: row.name,
      sub_category: row.sub_category ?? "",
      description: row.description ?? "",
    });

    setError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;

    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = form.name.trim();
    const subCategory = form.sub_category.trim();
    const description = form.description.trim();

    if (!name) {
      setError("Category name is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let duplicateQuery = supabase
        .from("categories")
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
        setError(`Category "${name}" already exists.`);
        return;
      }

      const payload = {
        name,
        sub_category: subCategory || null,
        description: description || null,
      };

      if (editing) {
        const { error } = await supabase
          .from("categories")
          .update(payload)
          .eq("id", editing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("categories")
          .insert(payload);

        if (error) throw error;
      }

      closeModal();
      await fetchCategories();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to save category.";

      if (
        message.toLowerCase().includes("duplicate") ||
        message.toLowerCase().includes("unique")
      ) {
        setError("A category with this name already exists.");
      } else {
        setError(message);
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
        .from("categories")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;

      setDeleteId(null);
      await fetchCategories();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete category."
      );
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<Category>[] = [
    {
      key: "name",
      label: "Category Name / کیٹیگری نام",
      render: (row) => (
        <span className="font-bold text-slate-900">{row.name}</span>
      ),
    },
    {
      key: "sub_category",
      label: "Sub-Category / Iqsaam / ذیلی قسم",
      render: (row) => row.sub_category || "—",
    },
    {
      key: "description",
      label: "Description / تفصیل",
      render: (row) => row.description || "—",
    },
    {
      key: "actions",
      label: "",
      className: "text-right",
      render: (row) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => openEdit(row)}
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >Edit / ترمیم</button>

          <button
            type="button"
            onClick={() => setDeleteId(row.id)}
            className="text-sm font-medium text-error-600 hover:text-error-700"
          >Delete / حذف کریں</button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Categories & Iqsaam / کیٹیگریز اور اقسام"
        subtitle="Manage product categories and sub-categories / مصنوعات کی کیٹیگریز اور ذیلی اقسام منظم کریں"
        action={
          <button
            type="button"
            onClick={openCreate}
            className="btn-primary"
          >
            + Add Category
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        emptyMessage="No categories found."
      />

      <Modal
        open={modalOpen}
        title={editing ? "Edit Category" : "New Category"}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Category Name / کیٹیگری نام</label>

            <input
              className="input"
              required
              autoFocus
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="e.g. Steel / مثال: اسٹیل"
            />
          </div>

          <div>
            <label className="label">Sub-Category / Iqsaam / ذیلی قسم</label>

            <input
              className="input"
              value={form.sub_category}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sub_category: event.target.value,
                }))
              }
              placeholder="e.g. Rods, Sheets / مثال: راڈز، شیٹس"
            />
          </div>

          <div>
            <label className="label">Description / تفصیل</label>

            <input
              className="input"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Optional details / اختیاری تفصیل"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
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
                  : "Create Category"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        title="Delete Category / کیٹیگری حذف کریں"
        message="Are you sure you want to delete this category? / کیا آپ یہ کیٹیگری حذف کرنا چاہتے ہیں؟"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
