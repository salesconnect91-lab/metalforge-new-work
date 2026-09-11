import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Banknote, Boxes, Building2, Eye, EyeOff, Factory, Landmark, RefreshCw, Settings2, ShoppingCart, WalletCards } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/lib/supabase";

type Summary = {
  sales_mtd: number;
  sales_documents_mtd: number;
  purchases_mtd: number;
  purchase_documents_mtd: number;
  cash_balance: number;
  bank_balance: number;
  receivables: number;
  payables: number;
  inventory_value: number;
  stock_quantity: number;
  stock_alerts: number;
  pending_work_orders: number;
  as_of: string | null;
};

type WidgetId = "sales" | "purchases" | "receivables" | "payables" | "cash" | "bank" | "inventory" | "operations" | "quick_links";

type Kpi = {
  id: WidgetId;
  label: string;
  value: string;
  note: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  to: string;
};

const EMPTY: Summary = {
  sales_mtd: 0,
  sales_documents_mtd: 0,
  purchases_mtd: 0,
  purchase_documents_mtd: 0,
  cash_balance: 0,
  bank_balance: 0,
  receivables: 0,
  payables: 0,
  inventory_value: 0,
  stock_quantity: 0,
  stock_alerts: 0,
  pending_work_orders: 0,
  as_of: null,
};

const WIDGETS: Array<{ id: WidgetId; label: string }> = [
  { id: "sales", label: "Sales MTD / ماہانہ فروخت" },
  { id: "purchases", label: "Purchases MTD / ماہانہ خریداری" },
  { id: "receivables", label: "Receivables / قابل وصول" },
  { id: "payables", label: "Payables / قابل ادائیگی" },
  { id: "cash", label: "Cash Balance / نقد بیلنس" },
  { id: "bank", label: "Bank Balance / بینک بیلنس" },
  { id: "inventory", label: "Inventory Value / اسٹاک مالیت" },
  { id: "operations", label: "Operations & Alerts / آپریشن اور الرٹس" },
  { id: "quick_links", label: "Quick Links / فوری رسائی" },
];

const money = (value: number) => `Rs ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Number(value) || 0)}`;
const number = (value: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(Number(value) || 0);

export default function Dashboard() {
  const navigate = useNavigate();
  const { activeCompany, activeBusinessUnit } = useAuth();
  const companyId = activeCompany?.company_id ?? null;
  const businessUnitId = activeBusinessUnit?.business_unit_id ?? null;
  const [summary, setSummary] = useState<Summary>(EMPTY);
  const [hidden, setHidden] = useState<WidgetId[]>([]);
  const [preferenceId, setPreferenceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("dashboard_live_summary");
    if (rpcError) setError(rpcError.message);
    else setSummary({ ...EMPTY, ...((data || {}) as Partial<Summary>) });
    setLoading(false);
  }, []);

  const loadPreferences = useCallback(async () => {
    if (!companyId) return;
    let query = supabase
      .from("dashboard_widget_preferences")
      .select("id,hidden_widgets")
      .eq("company_id", companyId);
    query = businessUnitId ? query.eq("business_unit_id", businessUnitId) : query.is("business_unit_id", null);
    const { data, error: preferenceError } = await query.maybeSingle();
    if (preferenceError) {
      setError(preferenceError.message);
      return;
    }
    setPreferenceId(data?.id ?? null);
    setHidden(((data?.hidden_widgets ?? []) as string[]).filter((id): id is WidgetId => WIDGETS.some((widget) => widget.id === id)));
  }, [businessUnitId, companyId]);

  useEffect(() => { void load(); }, [load, companyId, businessUnitId]);
  useEffect(() => { void loadPreferences(); }, [loadPreferences]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  const saveHidden = async (next: WidgetId[]) => {
    if (!companyId) return;
    setSavingPreference(true);
    setError(null);
    const payload = { hidden_widgets: next, updated_at: new Date().toISOString() };
    const result = preferenceId
      ? await supabase.from("dashboard_widget_preferences").update(payload).eq("id", preferenceId).select("id").single()
      : await supabase.from("dashboard_widget_preferences").insert({ ...payload, company_id: companyId, business_unit_id: businessUnitId }).select("id").single();
    setSavingPreference(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (!preferenceId) setPreferenceId(result.data.id);
    setHidden(next);
  };

  const visible = (id: WidgetId) => !hidden.includes(id);
  const toggle = (id: WidgetId) => {
    const next = hidden.includes(id) ? hidden.filter((item) => item !== id) : [...hidden, id];
    void saveHidden(next);
  };

  const kpis = useMemo<Kpi[]>(() => [
    { id: "sales", label: "Sales MTD / ماہانہ فروخت", value: money(summary.sales_mtd), note: `${summary.sales_documents_mtd} posted document(s) this month`, icon: ShoppingCart, color: "bg-blue-600", to: "/sales" },
    { id: "purchases", label: "Purchases MTD / ماہانہ خریداری", value: money(summary.purchases_mtd), note: `${summary.purchase_documents_mtd} posted document(s) this month`, icon: Banknote, color: "bg-amber-500", to: "/purchase" },
    { id: "receivables", label: "Receivables / قابل وصول", value: money(summary.receivables), note: "Posted A/R ledger balance", icon: WalletCards, color: "bg-emerald-600", to: "/accounting/customer-invoice-statement" },
    { id: "payables", label: "Payables / قابل ادائیگی", value: money(summary.payables), note: "Posted A/P ledger balance", icon: Building2, color: "bg-violet-600", to: "/reports/supplier-aging" },
    { id: "cash", label: "Cash Balance / نقد بیلنس", value: money(summary.cash_balance), note: "Mapped cash account · posted entries", icon: Banknote, color: "bg-cyan-600", to: "/accounting/cash-counter" },
    { id: "bank", label: "Bank Balance / بینک بیلنس", value: money(summary.bank_balance), note: "Mapped bank account · posted entries", icon: Landmark, color: "bg-sky-700", to: "/accounting/bank-reconciliation" },
    { id: "inventory", label: "Inventory Value / اسٹاک مالیت", value: money(summary.inventory_value), note: `${number(summary.stock_quantity)} current stock quantity`, icon: Boxes, color: "bg-slate-700", to: "/reports/stock-valuation" },
  ], [summary]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 lg:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-slate-950">Business Overview / کاروباری خلاصہ</h1>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Posted accounting balances and current operational activity. Auto-refreshes every minute.</p>
        </div>
        <div className="relative flex items-center gap-2">
          <span className="hidden text-[10px] font-bold text-emerald-700 sm:inline">● Live{summary.as_of ? ` · ${new Date(summary.as_of).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
          <button type="button" onClick={() => setCustomizeOpen((value) => !value)} className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-[10px] font-black text-slate-700 shadow-sm"><Settings2 className="h-3.5 w-3.5" />Customize / ترتیب</button>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-[10px] font-black text-slate-700 shadow-sm"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh / تازہ کریں</button>
          {customizeOpen && <div className="absolute right-0 top-10 z-40 w-[290px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between"><div className="text-xs font-black text-slate-900">Show / Hide Dashboard / دکھائیں یا چھپائیں</div><button type="button" onClick={() => setCustomizeOpen(false)} className="text-xs font-bold text-slate-500">Close</button></div>
            <div className="space-y-1">{WIDGETS.map((widget) => <button type="button" key={widget.id} disabled={savingPreference} onClick={() => toggle(widget.id)} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs font-semibold hover:bg-slate-50"><span>{widget.label}</span>{visible(widget.id) ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-slate-400" />}</button>)}</div>
            {hidden.length > 0 && <button type="button" disabled={savingPreference} onClick={() => void saveHidden([])} className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-blue-700">Show All / سب دکھائیں</button>}
          </div>}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {kpis.filter((card) => visible(card.id)).map((card) => {
          const Icon = card.icon;
          return <button key={card.id} onClick={() => navigate(card.to)} className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
            <div className="flex items-center gap-2"><span className={`flex h-8 w-8 items-center justify-center rounded-lg text-white ${card.color}`}><Icon className="h-4 w-4" /></span><div className="text-[10px] font-black uppercase tracking-wide text-slate-600">{card.label}</div></div>
            <div className="mt-3 truncate text-lg font-black tabular-nums text-slate-950">{loading ? "…" : card.value}</div>
            <div className="mt-1 text-[9px] font-semibold text-slate-400">{card.note}</div>
          </button>;
        })}
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_1.3fr]">
        {visible("operations") && <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-xs font-black text-slate-900">Operations & Alerts / آپریشن اور الرٹس</h2></div>
          <div className="grid gap-2 p-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
            <button onClick={() => navigate("/godown")} className="rounded-lg bg-amber-50 p-3 text-left text-[10px] font-bold text-amber-950"><AlertTriangle className="mb-2 h-4 w-4 text-amber-600" />{summary.stock_alerts} stock item(s) need attention.</button>
            <button onClick={() => navigate("/production")} className="rounded-lg bg-blue-50 p-3 text-left text-[10px] font-bold text-blue-950"><Factory className="mb-2 h-4 w-4 text-blue-600" />{summary.pending_work_orders} work order(s) pending.</button>
            <button onClick={() => navigate("/godown")} className="rounded-lg bg-slate-50 p-3 text-left text-[10px] font-bold text-slate-900"><Boxes className="mb-2 h-4 w-4 text-slate-600" />{number(summary.stock_quantity)} current stock quantity.</button>
          </div>
        </section>}

        {visible("quick_links") && <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-xs font-black text-slate-900">Quick Links / فوری رسائی</h2></div>
          <div className="flex flex-wrap gap-2 p-3">
            {[
              ["New Sales Invoice", "/sales/new"], ["New Purchase", "/purchase/new"], ["Cash Counter", "/accounting/cash-counter"], ["Bank Reconciliation", "/accounting/bank-reconciliation"], ["Customer Statement", "/accounting/customer-invoice-statement"], ["Stock Movements", "/godown/movements"], ["Trial Balance", "/accounting/trial-balance"], ["Profit & Loss", "/accounting/profit-loss"],
            ].map(([label, to]) => <button key={to} onClick={() => navigate(to)} className="inline-flex h-8 items-center rounded-md border border-blue-200 bg-blue-50 px-3 text-[10px] font-black text-blue-700 hover:bg-blue-100">{label}</button>)}
          </div>
        </section>}
      </div>
    </div>
  );
}
