import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Power, Trash2, Save, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader, ErrorBanner, Modal } from "@/components/ui";

type ChargeType = "recovery" | "cost" | "both";

type Charge = {
  id: string;
  user_id: string;
  charge_key: string;
  charge_name: string;
  charge_type: ChargeType;
  revenue_account_id: string | null;
  cost_account_id: string | null;
  tax_applicable: boolean;
  service_party_required: boolean;
  is_active: boolean;
  description: string | null;
};

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  is_group: boolean;
  allow_manual_entries: boolean;
  is_active: boolean;
};

const USER_ID = "a3312921-433d-4a71-98eb-f822a3c784fa";

const emptyForm = {
  charge_name: "",
  charge_type: "both" as ChargeType,
  revenue_account_id: "",
  cost_account_id: "",
  tax_applicable: true,
  service_party_required: true,
  is_active: true,
  description: "",
};

function makeKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default function ChargeMaster() {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const [chargeRes, accountRes] = await Promise.all([
      supabase
        .from("charge_master")
        .select("*")
        .eq("user_id", USER_ID)
        .order("charge_name"),
      supabase
        .from("chart_of_accounts")
        .select(
          "id,code,name,type,is_group,allow_manual_entries,is_active"
        )
        .eq("is_active", true)
        .eq("is_group", false)
        .eq("allow_manual_entries", true)
        .order("code"),
    ]);

    if (chargeRes.error) {
      setError(chargeRes.error.message);
      setLoading(false);
      return;
    }

    if (accountRes.error) {
      setError(accountRes.error.message);
      setLoading(false);
      return;
    }

    setCharges((chargeRes.data ?? []) as Charge[]);
    setAccounts((accountRes.data ?? []) as Account[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  };

  const startEdit = (charge: Charge) => {
    setEditingId(charge.id);
    setForm({
      charge_name: charge.charge_name,
      charge_type: charge.charge_type,
      revenue_account_id: charge.revenue_account_id ?? "",
      cost_account_id: charge.cost_account_id ?? "",
      tax_applicable: charge.tax_applicable,
      service_party_required: charge.service_party_required,
      is_active: charge.is_active,
      description: charge.description ?? "",
    });
    setError("");
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const name = form.charge_name.trim();
    const key = makeKey(name);

    if (!name) {
      setError("Charge Name / چارج کا نام is required.");
      return;
    }

    if (!key) {
      setError("Please enter a valid charge name.");
      return;
    }

    if (
      (form.charge_type === "recovery" || form.charge_type === "both") &&
      !form.revenue_account_id
    ) {
      setError("Revenue Account / ریونیو اکاؤنٹ is required for recovery charges.");
      return;
    }

    if (
      (form.charge_type === "cost" || form.charge_type === "both") &&
      !form.cost_account_id
    ) {
      setError("Cost Account / لاگت اکاؤنٹ is required for cost charges.");
      return;
    }

    setSaving(true);

    const payload = {
      user_id: USER_ID,
      charge_key: key,
      charge_name: name,
      charge_type: form.charge_type,
      revenue_account_id: form.revenue_account_id || null,
      cost_account_id: form.cost_account_id || null,
      tax_applicable: form.tax_applicable,
      service_party_required: form.service_party_required,
      is_active: form.is_active,
      description: form.description.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const result = editingId
      ? await supabase.from("charge_master").update(payload).eq("id", editingId).eq("user_id", USER_ID)
      : await supabase.from("charge_master").insert(payload);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    await load();
  };

  const toggleActive = async (charge: Charge) => {
    setError("");
    const { error: updateError } = await supabase
      .from("charge_master")
      .update({
        is_active: !charge.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", charge.id)
      .eq("user_id", USER_ID);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await load();
  };

  const remove = async (charge: Charge) => {
    if (!window.confirm(
      `Delete "${charge.charge_name}"?\n\nاس چارج کو حذف کرنا ہے؟ Existing invoice records will remain.`
    )) {
      return;
    }

    setError("");
    const { error: deleteError } = await supabase
      .from("charge_master")
      .delete()
      .eq("id", charge.id)
      .eq("user_id", USER_ID);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    await load();
  };

  const accountLabel = (id: string | null) => {
    if (!id) return "—";
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.code} - ${a.name}` : "—";
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Charge Master / چارج ماسٹر"
        subtitle="Configure invoice charges and their actual COA revenue/cost accounts. / انوائس چارجز اور متعلقہ آمدنی یا لاگت اکاؤنٹس ترتیب دیں۔"
        action={
          <button
            type="button"
            onClick={startAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            <Plus size={16} />
            Add Charge / چارج شامل کریں
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left">Charge / چارج</th>
                <th className="px-4 py-3 text-left">Type / قسم</th>
                <th className="px-4 py-3 text-left">Revenue COA / ریونیو</th>
                <th className="px-4 py-3 text-left">Cost COA / لاگت</th>
                <th className="px-4 py-3 text-left">Tax / ٹیکس</th>
                <th className="px-4 py-3 text-left">Status / حیثیت</th>
                <th className="px-4 py-3 text-right">Actions / ایکشن</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Loading / لوڈ ہو رہا ہے...
                  </td>
                </tr>
              ) : charges.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No charges found / کوئی چارج موجود نہیں
                  </td>
                </tr>
              ) : (
                charges.map((charge) => (
                  <tr key={charge.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{charge.charge_name}</div>
                      <div className="text-xs text-slate-400">{charge.charge_key}</div>
                    </td>
                    <td className="px-4 py-3 capitalize">{charge.charge_type}</td>
                    <td className="px-4 py-3">{accountLabel(charge.revenue_account_id)}</td>
                    <td className="px-4 py-3">{accountLabel(charge.cost_account_id)}</td>
                    <td className="px-4 py-3">{charge.tax_applicable ? "Yes / ہاں" : "No / نہیں"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs ${charge.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {charge.is_active ? "Active / فعال" : "Inactive / غیر فعال"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => startEdit(charge)} className="rounded-md border p-2 hover:bg-slate-100" title="Edit / ترمیم">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => void toggleActive(charge)} className="rounded-md border p-2 hover:bg-slate-100" title="Activate/Deactivate / فعال یا غیر فعال">
                          <Power size={15} />
                        </button>
                        <button onClick={() => void remove(charge)} className="rounded-md border p-2 text-red-600 hover:bg-red-50" title="Delete / حذف">
                          <Trash2 size={15} />
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

      <Modal
        open={open}
        title={editingId ? "Edit Charge / چارج میں ترمیم" : "Add Charge / نیا چارج"}
        onClose={() => !saving && setOpen(false)}
      >
        <form onSubmit={save} className="space-y-4">
          {error && <ErrorBanner message={error} />}

          <div>
            <label className="label">Charge Name / چارج کا نام</label>
            <input
              className="input"
              value={form.charge_name}
              onChange={(e) => setForm((x) => ({ ...x, charge_name: e.target.value }))}
              placeholder="e.g. Crane Charges / کرین چارجز"
            />
          </div>

          <div>
            <label className="label">Charge Type / چارج کی قسم</label>
            <select
              className="input"
              value={form.charge_type}
              onChange={(e) => setForm((x) => ({ ...x, charge_type: e.target.value as ChargeType }))}
            >
              <option value="both">Both / وصولی + لاگت</option>
              <option value="recovery">Recovery / وصولی</option>
              <option value="cost">Cost / لاگت</option>
            </select>
          </div>

          <div>
            <label className="label">Revenue Account / ریونیو اکاؤنٹ</label>
            <select
              className="input"
              value={form.revenue_account_id}
              onChange={(e) => setForm((x) => ({ ...x, revenue_account_id: e.target.value }))}
            >
              <option value="">— Select COA / اکاؤنٹ منتخب کریں —</option>
              {accounts
                .filter((a) => a.type === "revenue")
                .map((a) => (
                  <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                ))}
            </select>
          </div>

          <div>
            <label className="label">Cost Account / لاگت اکاؤنٹ</label>
            <select
              className="input"
              value={form.cost_account_id}
              onChange={(e) => setForm((x) => ({ ...x, cost_account_id: e.target.value }))}
            >
              <option value="">— Select COA / اکاؤنٹ منتخب کریں —</option>
              {accounts
                .filter((a) => a.type === "expense")
                .map((a) => (
                  <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={form.tax_applicable}
                onChange={(e) => setForm((x) => ({ ...x, tax_applicable: e.target.checked }))}
              />
              <span>Tax Applicable / ٹیکس لاگو</span>
            </label>

            <label className="flex items-center gap-2 rounded-lg border p-3">
              <input
                type="checkbox"
                checked={form.service_party_required}
                onChange={(e) => setForm((x) => ({ ...x, service_party_required: e.target.checked }))}
              />
              <span>Service Party / سروس پارٹی</span>
            </label>
          </div>

          <label className="flex items-center gap-2 rounded-lg border p-3">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((x) => ({ ...x, is_active: e.target.checked }))}
            />
            <span>Active / فعال</span>
          </label>

          <div>
            <label className="label">Description / تفصیل</label>
            <textarea
              className="input min-h-20"
              value={form.description}
              onChange={(e) => setForm((x) => ({ ...x, description: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <button type="button" onClick={() => setOpen(false)} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2">
              <X size={16} /> Cancel / منسوخ
            </button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-white">
              <Save size={16} />
              {saving ? "Saving / محفوظ ہو رہا ہے..." : "Save Charge / چارج محفوظ کریں"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
