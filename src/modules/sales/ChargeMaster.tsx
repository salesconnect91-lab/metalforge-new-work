import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, FileSpreadsheet, Plus, Pencil, Power, Trash2, Save, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toUrduName } from "@/lib/urdu";
import { PageHeader, ErrorBanner, Modal } from "@/components/ui";
import { useAuth } from "@/auth/AuthContext";
import { canPerformModule } from "@/auth/permissions";

type ChargeType = "recovery" | "cost" | "both";
type ChargeContext = "sales" | "purchase" | "both";
type ChargeUnit = "fixed" | "percent" | "per_kg" | "per_ton" | "per_piece";
type PurchaseTreatment = "landed_cost" | "expense";
type Charge = {
  id: string;
  charge_key: string;
  charge_name: string;
  charge_name_urdu: string | null;
  charge_type: ChargeType;
  revenue_account_id: string | null;
  cost_account_id: string | null;
  tax_applicable: boolean;
  service_party_required: boolean;
  default_rate: number;
  unit: ChargeUnit;
  applies_to: ChargeContext;
  purchase_treatment: PurchaseTreatment | null;
  is_fixed: boolean;
  is_active: boolean;
  description: string | null;
};
type Account = { id: string; code: string; name: string; type: string };
type ChargeForm = {
  charge_name: string;
  charge_name_urdu: string;
  charge_type: ChargeType;
  revenue_account_id: string;
  cost_account_id: string;
  tax_applicable: boolean;
  service_party_required: boolean;
  default_rate: string;
  unit: ChargeUnit;
  applies_to: ChargeContext;
  purchase_treatment: PurchaseTreatment;
  is_fixed: boolean;
  is_active: boolean;
  description: string;
};

const emptyForm: ChargeForm = {
  charge_name: "",
  charge_name_urdu: "",
  charge_type: "cost",
  revenue_account_id: "",
  cost_account_id: "",
  tax_applicable: true,
  service_party_required: false,
  default_rate: "0",
  unit: "fixed",
  applies_to: "purchase",
  purchase_treatment: "landed_cost",
  is_fixed: false,
  is_active: true,
  description: "",
};

const makeKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const clean = (value: unknown) => String(value ?? "").trim();
const yes = (value: unknown, fallback = false) => {
  const text = clean(value).toLowerCase();
  if (!text) return fallback;
  return ["yes", "y", "true", "1", "active", "on"].includes(text);
};

function normalizedTypeForContext(context: ChargeContext, type: ChargeType): ChargeType {
  if (context === "purchase") return "cost";
  if (context === "sales" && type === "cost") return "recovery";
  return type;
}

export default function ChargeMaster() {
  const { activeCompany, isPlatformOwner } = useAuth();
  const canCreate = canPerformModule(activeCompany?.membership_role, "master", "create", activeCompany?.permissions, isPlatformOwner);
  const canEdit = canPerformModule(activeCompany?.membership_role, "master", "edit", activeCompany?.permissions, isPlatformOwner);
  const canDelete = canPerformModule(activeCompany?.membership_role, "master", "delete", activeCompany?.permissions, isPlatformOwner);

  const [charges, setCharges] = useState<Charge[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState<ChargeForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [chargeRes, accountRes] = await Promise.all([
      supabase.from("charge_master").select("*").order("charge_name"),
      supabase.from("chart_of_accounts").select("id,code,name,type").eq("is_active", true).eq("is_group", false).eq("allow_manual_entries", true).order("code"),
    ]);
    if (chargeRes.error || accountRes.error) setError(chargeRes.error?.message || accountRes.error?.message || "Load failed");
    else {
      setError("");
      setCharges((chargeRes.data ?? []) as Charge[]);
      setAccounts((accountRes.data ?? []) as Account[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

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
      charge_name_urdu: charge.charge_name_urdu ?? toUrduName(charge.charge_name),
      charge_type: normalizedTypeForContext(charge.applies_to, charge.charge_type),
      revenue_account_id: charge.applies_to === "purchase" ? "" : (charge.revenue_account_id ?? ""),
      cost_account_id: charge.cost_account_id ?? "",
      tax_applicable: charge.tax_applicable,
      service_party_required: charge.service_party_required,
      default_rate: String(charge.default_rate ?? 0),
      unit: charge.unit ?? "fixed",
      applies_to: charge.applies_to ?? "purchase",
      purchase_treatment: charge.purchase_treatment ?? "landed_cost",
      is_fixed: charge.is_fixed ?? false,
      is_active: charge.is_active,
      description: charge.description ?? "",
    });
    setError("");
    setOpen(true);
  };

  const changeContext = (context: ChargeContext) => {
    setForm((current) => ({
      ...current,
      applies_to: context,
      charge_type: context === "purchase" ? "cost" : context === "sales" ? "recovery" : "both",
      revenue_account_id: context === "purchase" ? "" : current.revenue_account_id,
    }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.charge_name.trim();
    const key = makeKey(name);
    if (!name || !key) { setError("Valid Charge Name is required."); return; }

    const type = normalizedTypeForContext(form.applies_to, form.charge_type);
    const needsRevenue = form.applies_to !== "purchase" && (type === "recovery" || type === "both");
    const needsCost = form.applies_to !== "sales" && (type === "cost" || type === "both");
    if (needsRevenue && !form.revenue_account_id) { setError("Revenue Account is required for Sales recovery charges."); return; }
    if (needsCost && !form.cost_account_id) { setError("Cost Account is required for Purchase charges."); return; }

    setSaving(true);
    const payload = {
      charge_key: key,
      charge_name: name,
      charge_name_urdu: form.charge_name_urdu.trim() || toUrduName(name),
      charge_type: type,
      revenue_account_id: needsRevenue ? form.revenue_account_id : null,
      cost_account_id: needsCost || type === "cost" || type === "both" ? (form.cost_account_id || null) : null,
      tax_applicable: form.tax_applicable,
      service_party_required: form.service_party_required,
      default_rate: Math.max(0, Number(form.default_rate) || 0),
      unit: form.unit,
      applies_to: form.applies_to,
      purchase_treatment: form.applies_to === "sales" ? null : form.purchase_treatment,
      is_fixed: form.is_fixed,
      is_active: form.is_active,
      description: form.description.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const result = editingId
      ? await supabase.from("charge_master").update(payload).eq("id", editingId)
      : await supabase.from("charge_master").insert(payload);
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    setOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    await load();
  };

  const toggle = async (charge: Charge) => {
    const { error: toggleError } = await supabase.from("charge_master").update({ is_active: !charge.is_active, updated_at: new Date().toISOString() }).eq("id", charge.id);
    if (toggleError) setError(toggleError.message); else await load();
  };

  const remove = async (charge: Charge) => {
    if (!confirm(`Delete ${charge.charge_name}?`)) return;
    const { error: deleteError } = await supabase.from("charge_master").delete().eq("id", charge.id);
    if (deleteError) setError(deleteError.message); else await load();
  };

  const accountLabel = (id: string | null) => {
    const account = accounts.find((candidate) => candidate.id === id);
    return account ? `${account.code} - ${account.name}` : "—";
  };

  const exportExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(charges.map((charge) => ({
      "Charge Name": charge.charge_name,
      "Urdu Name": charge.charge_name_urdu ?? "",
      Type: charge.charge_type,
      Rate: Number(charge.default_rate || 0),
      Unit: charge.unit,
      "Applies To": charge.applies_to,
      "Purchase Treatment": charge.purchase_treatment ?? "",
      "Revenue Account Code": accounts.find((account) => account.id === charge.revenue_account_id)?.code ?? "",
      "Cost Account Code": accounts.find((account) => account.id === charge.cost_account_id)?.code ?? "",
      "Tax Applicable": charge.tax_applicable ? "Yes" : "No",
      "Service Party Required": charge.service_party_required ? "Yes" : "No",
      "Lock Rate": charge.is_fixed ? "Yes" : "No",
      Active: charge.is_active ? "Yes" : "No",
      Description: charge.description ?? "",
    })));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Charge Master");
    XLSX.writeFile(book, "charge_master.xlsx");
  };

  const downloadTemplate = () => {
    const sheet = XLSX.utils.json_to_sheet([
      { "Charge Name": "Unloading Charges", "Urdu Name": "ان لوڈنگ چارجز", Type: "cost", Rate: 300, Unit: "per_ton", "Applies To": "purchase", "Purchase Treatment": "landed_cost", "Revenue Account Code": "", "Cost Account Code": "6410", "Tax Applicable": "Yes", "Service Party Required": "No", "Lock Rate": "Yes", Active: "Yes", Description: "Auto calculated by purchased weight" },
      { "Charge Name": "Cutting Charges", "Urdu Name": "کٹنگ چارجز", Type: "recovery", Rate: 300, Unit: "per_ton", "Applies To": "sales", "Purchase Treatment": "", "Revenue Account Code": "4200", "Cost Account Code": "", "Tax Applicable": "Yes", "Service Party Required": "No", "Lock Rate": "Yes", Active: "Yes", Description: "Auto calculated by sold weight" },
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Charge Master");
    XLSX.writeFile(book, "charge_master_import_template.xlsx");
  };

  const importExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!canCreate) { setError("You do not have permission to import charges."); return; }
    setSaving(true);
    setError("");
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
      const accountByCode = new Map(accounts.map((account) => [account.code.trim().toLowerCase(), account]));
      const existing = new Set(charges.map((charge) => charge.charge_key));
      const seen = new Set<string>();
      const payload: any[] = [];
      const errors: string[] = [];

      raw.forEach((row, index) => {
        const name = clean(row["Charge Name"] ?? row.Name ?? row.charge_name);
        if (!name) return;
        const key = makeKey(name);
        if (!key || existing.has(key) || seen.has(key)) { errors.push(`Row ${index + 2}: Duplicate or invalid charge "${name}".`); return; }
        const applies = (clean(row["Applies To"] ?? row.applies_to).toLowerCase() || "purchase") as ChargeContext;
        if (!["sales", "purchase", "both"].includes(applies)) { errors.push(`Row ${index + 2}: Applies To must be sales, purchase or both.`); return; }
        let type = (clean(row.Type ?? row.charge_type).toLowerCase() || (applies === "purchase" ? "cost" : applies === "sales" ? "recovery" : "both")) as ChargeType;
        type = normalizedTypeForContext(applies, type);
        const unit = (clean(row.Unit ?? row.unit).toLowerCase() || "fixed") as ChargeUnit;
        if (!["fixed", "percent", "per_kg", "per_ton", "per_piece"].includes(unit)) { errors.push(`Row ${index + 2}: Invalid Unit.`); return; }
        const treatment = (clean(row["Purchase Treatment"] ?? row.purchase_treatment).toLowerCase() || "landed_cost") as PurchaseTreatment;
        if (applies !== "sales" && !["landed_cost", "expense"].includes(treatment)) { errors.push(`Row ${index + 2}: Purchase Treatment must be landed_cost or expense.`); return; }
        const revenueCode = clean(row["Revenue Account Code"] ?? row.revenue_account_code).toLowerCase();
        const costCode = clean(row["Cost Account Code"] ?? row.cost_account_code).toLowerCase();
        const revenue = revenueCode ? accountByCode.get(revenueCode) : undefined;
        const cost = costCode ? accountByCode.get(costCode) : undefined;
        const needsRevenue = applies !== "purchase" && (type === "recovery" || type === "both");
        const needsCost = applies !== "sales" && (type === "cost" || type === "both");
        if (needsRevenue && (!revenue || revenue.type !== "revenue")) { errors.push(`Row ${index + 2}: Valid revenue account code is required.`); return; }
        if (needsCost && (!cost || cost.type !== "expense")) { errors.push(`Row ${index + 2}: Valid expense account code is required.`); return; }
        const rate = Number(clean(row.Rate ?? row.default_rate) || 0);
        if (!Number.isFinite(rate) || rate < 0) { errors.push(`Row ${index + 2}: Rate must be zero or greater.`); return; }
        seen.add(key);
        payload.push({
          charge_key: key,
          charge_name: name,
          charge_name_urdu: clean(row["Urdu Name"] ?? row.charge_name_urdu) || toUrduName(name),
          charge_type: type,
          revenue_account_id: needsRevenue ? revenue?.id ?? null : null,
          cost_account_id: needsCost ? cost?.id ?? null : null,
          tax_applicable: yes(row["Tax Applicable"] ?? row.tax_applicable, false),
          service_party_required: yes(row["Service Party Required"] ?? row.service_party_required, false),
          default_rate: rate,
          unit,
          applies_to: applies,
          purchase_treatment: applies === "sales" ? null : treatment,
          is_fixed: yes(row["Lock Rate"] ?? row.is_fixed, false),
          is_active: yes(row.Active ?? row.is_active, true),
          description: clean(row.Description ?? row.description) || null,
          updated_at: new Date().toISOString(),
        });
      });
      if (errors.length) throw new Error(errors.slice(0, 6).join(" "));
      if (!payload.length) throw new Error("No valid charge rows found in the file.");
      const { error: importError } = await supabase.from("charge_master").insert(payload);
      if (importError) throw importError;
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Charge import failed.");
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const actions = <div className="flex flex-wrap gap-2">
    <button className="btn-secondary" onClick={downloadTemplate}><Download size={16} />Template</button>
    {canCreate && <button className="btn-secondary" disabled={saving} onClick={() => fileRef.current?.click()}><Upload size={16} />Import</button>}
    <input ref={fileRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={importExcel} />
    <button className="btn-secondary" onClick={exportExcel}><FileSpreadsheet size={16} />Excel</button>
    {canCreate && <button className="btn-primary" onClick={startAdd}><Plus size={16} /> Add Charge</button>}
  </div>;

  return <div className="space-y-5">
    <PageHeader title="Charge Master / چارج ماسٹر" subtitle="Sales recovery and Purchase cost charges with automatic quantity-based rates and accounting mappings." action={actions} />
    {error && <ErrorBanner message={error} />}

    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50"><tr><th className="p-3 text-left">Charge</th><th className="p-3 text-right">اردو نام</th><th className="p-3">Type</th><th className="p-3">Rate</th><th className="p-3">Applies To</th><th className="p-3">Purchase Treatment</th><th className="p-3">Revenue COA</th><th className="p-3">Cost COA</th><th className="p-3">Tax</th><th className="p-3">Status</th><th /></tr></thead>
        <tbody>{loading ? <tr><td colSpan={11} className="p-6 text-center">Loading...</td></tr> : charges.map((charge) => <tr key={charge.id} className="border-t">
          <td className="p-3"><div className="font-medium">{charge.charge_name}</div><div className="text-xs text-slate-400">{charge.charge_key}</div></td>
          <td dir="rtl" className="p-3 text-right">{charge.charge_name_urdu || "—"}</td>
          <td className="p-3 capitalize">{charge.charge_type}</td>
          <td className="p-3 whitespace-nowrap">{Number(charge.default_rate || 0).toLocaleString()} {charge.unit}</td>
          <td className="p-3 capitalize">{charge.applies_to}</td>
          <td className="p-3">{charge.applies_to === "sales" ? "—" : charge.purchase_treatment === "expense" ? "Expense" : "Landed Cost / Inventory"}</td>
          <td className="p-3">{accountLabel(charge.revenue_account_id)}</td>
          <td className="p-3">{accountLabel(charge.cost_account_id)}</td>
          <td className="p-3">{charge.tax_applicable ? "Yes / ہاں" : "No / نہیں"}</td>
          <td className="p-3">{charge.is_active ? "Active / فعال" : "Inactive / غیر فعال"}</td>
          <td className="p-3"><div className="flex justify-end gap-2">{canEdit && <button onClick={() => startEdit(charge)} className="rounded border p-2"><Pencil size={15} /></button>}{canEdit && <button onClick={() => void toggle(charge)} className="rounded border p-2"><Power size={15} /></button>}{canDelete && <button onClick={() => void remove(charge)} className="rounded border p-2 text-red-600"><Trash2 size={15} /></button>}</div></td>
        </tr>)}</tbody>
      </table>
    </div>

    <Modal open={open} title={editingId ? "Edit Charge / چارج میں ترمیم" : "Add Charge / نیا چارج"} onClose={() => !saving && setOpen(false)}>
      <form onSubmit={save} className="space-y-4">
        <div><label className="label">Charge Name (English)</label><input className="input" value={form.charge_name} onChange={(e) => setForm((current) => ({ ...current, charge_name: e.target.value, charge_name_urdu: (!current.charge_name_urdu || current.charge_name_urdu === toUrduName(current.charge_name)) ? toUrduName(e.target.value) : current.charge_name_urdu }))} /></div>
        <div><div className="mb-1 flex items-center justify-between gap-2"><label className="label mb-0">Urdu Name / اردو نام</label><button type="button" className="inline-flex min-h-8 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700" onClick={() => setForm((current) => ({ ...current, charge_name_urdu: toUrduName(current.charge_name) }))}>Auto Urdu / خودکار اردو</button></div><input dir="rtl" className="input text-right" value={form.charge_name_urdu} onChange={(e) => setForm((current) => ({ ...current, charge_name_urdu: e.target.value }))} /></div>

        <div><label className="label">Applies To / لاگو</label><select className="input" value={form.applies_to} onChange={(e) => changeContext(e.target.value as ChargeContext)}><option value="purchase">Purchase / خریداری</option><option value="sales">Sales / سیلز</option><option value="both">Sales + Purchase</option></select></div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">Type / قسم</label><select className="input" value={form.charge_type} disabled={form.applies_to !== "both"} onChange={(e) => setForm((current) => ({ ...current, charge_type: e.target.value as ChargeType }))}>{form.applies_to === "purchase" ? <option value="cost">Cost / Purchase Cost</option> : form.applies_to === "sales" ? <option value="recovery">Recovery / Sales Recovery</option> : <><option value="both">Both</option><option value="recovery">Recovery</option><option value="cost">Cost</option></>}</select></div>
          <div><label className="label">Rate / ریٹ</label><input type="number" min="0" step="0.01" className="input" value={form.default_rate} onChange={(e) => setForm((current) => ({ ...current, default_rate: e.target.value }))} /></div>
          <div><label className="label">Unit / یونٹ</label><select className="input" value={form.unit} onChange={(e) => setForm((current) => ({ ...current, unit: e.target.value as ChargeUnit }))}><option value="fixed">Fixed</option><option value="percent">Percent</option><option value="per_kg">Per KG</option><option value="per_ton">Per Ton</option><option value="per_piece">Per Piece</option></select></div>
        </div>

        {form.applies_to !== "sales" && <div><label className="label">Purchase Treatment / خریداری اثر</label><select className="input" value={form.purchase_treatment} onChange={(e) => setForm((current) => ({ ...current, purchase_treatment: e.target.value as PurchaseTreatment }))}><option value="landed_cost">Landed Cost / Inventory — مال کی لاگت میں شامل</option><option value="expense">Expense — مدت کا خرچ</option></select><p className="mt-1 text-xs text-slate-500">Landed Cost inventory value mein add hota hai. Expense selected Cost COA mein post hota hai.</p></div>}

        {form.applies_to !== "purchase" && <div><label className="label">Revenue Account / ریکوری اکاؤنٹ</label><select className="input" value={form.revenue_account_id} onChange={(e) => setForm((current) => ({ ...current, revenue_account_id: e.target.value }))}><option value="">Select Revenue COA</option>{accounts.filter((account) => account.type === "revenue").map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}</select></div>}

        {form.applies_to !== "sales" && <div><label className="label">Cost Account / خرچ اکاؤنٹ</label><select className="input" value={form.cost_account_id} onChange={(e) => setForm((current) => ({ ...current, cost_account_id: e.target.value }))}><option value="">Select Expense COA</option>{accounts.filter((account) => account.type === "expense").map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}</select></div>}

        <div className="grid grid-cols-2 gap-2">
          <label className="rounded border p-3"><input type="checkbox" checked={form.tax_applicable} onChange={(e) => setForm((current) => ({ ...current, tax_applicable: e.target.checked }))} /> Tax Applicable</label>
          <label className="rounded border p-3"><input type="checkbox" checked={form.service_party_required} onChange={(e) => setForm((current) => ({ ...current, service_party_required: e.target.checked }))} /> Service Party</label>
          <label className="rounded border p-3"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm((current) => ({ ...current, is_active: e.target.checked }))} /> Active / فعال</label>
          <label className="rounded border p-3"><input type="checkbox" checked={form.is_fixed} onChange={(e) => setForm((current) => ({ ...current, is_fixed: e.target.checked }))} /> Lock Rate</label>
        </div>

        <div><label className="label">Description / تفصیل</label><textarea className="input min-h-20" value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} /></div>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}><X size={16} />Cancel</button><button className="btn-primary" disabled={saving}><Save size={16} />{saving ? "Saving..." : "Save Charge"}</button></div>
      </form>
    </Modal>
  </div>;
}
