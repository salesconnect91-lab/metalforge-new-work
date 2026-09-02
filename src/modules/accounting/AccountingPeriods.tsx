import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Lock, LockOpen } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ErrorBanner, LoadingState, PageHeader, formatDate } from "@/components/ui";

interface AccountingPeriod {
  id: string;
  period_name: string;
  period_start: string;
  period_end: string;
  status: "open" | "closed";
  closed_at: string | null;
}

export default function AccountingPeriods() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: fetchError } = await supabase
      .from("accounting_periods")
      .select("id,period_name,period_start,period_end,status,closed_at")
      .gte("period_start", `${year}-01-01`)
      .lte("period_end", `${year}-12-31`)
      .order("period_start");
    if (fetchError) setError(fetchError.message);
    setPeriods((data ?? []) as AccountingPeriod[]);
    setLoading(false);
  }, [year]);

  useEffect(() => { void loadPeriods(); }, [loadPeriods]);

  const summary = useMemo(() => ({
    open: periods.filter((period) => period.status === "open").length,
    closed: periods.filter((period) => period.status === "closed").length,
  }), [periods]);

  async function initializeYear() {
    setSavingId("year"); setError(""); setSuccess("");
    const { data, error: rpcError } = await supabase.rpc("initialize_accounting_year", { p_year: year });
    if (rpcError) setError(rpcError.message);
    else {
      setSuccess(`${Number(data?.periods_created ?? 0)} monthly periods created for ${year}.`);
      await loadPeriods();
    }
    setSavingId(null);
  }

  async function changeStatus(period: AccountingPeriod) {
    const nextStatus = period.status === "open" ? "closed" : "open";
    const action = nextStatus === "closed" ? "close" : "reopen";
    if (!window.confirm(`Are you sure you want to ${action} ${period.period_name}?`)) return;
    setSavingId(period.id); setError(""); setSuccess("");
    const { error: rpcError } = await supabase.rpc("set_accounting_period_status", {
      p_period_id: period.id,
      p_status: nextStatus,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setSuccess(`${period.period_name} is now ${nextStatus}.`);
      await loadPeriods();
    }
    setSavingId(null);
  }

  return (
    <div>
      <PageHeader
        title="Accounting Periods / اکاؤنٹنگ پیریڈز"
        subtitle="Close finalized months to prevent backdated accounting postings."
        action={
          <div className="flex items-center gap-2">
            <input className="input w-28" type="number" min="2000" max="2200" value={year} onChange={(event) => setYear(Number(event.target.value))} />
            <button className="btn-primary" disabled={savingId !== null} onClick={() => void initializeYear()}>
              <CalendarRange size={16} /> {savingId === "year" ? "Creating…" : "Create Year"}
            </button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} />}
      {success && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><p className="text-xs font-semibold uppercase text-slate-500">Year</p><p className="mt-1 text-2xl font-bold">{year}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase text-slate-500">Open Months</p><p className="mt-1 text-2xl font-bold text-emerald-600">{summary.open}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase text-slate-500">Closed Months</p><p className="mt-1 text-2xl font-bold text-slate-700">{summary.closed}</p></div>
      </div>

      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Closing a month blocks new Sale, Purchase, Receipt, Payment and Journal postings dated inside that month. Existing posted records remain unchanged.
      </div>

      {loading ? <LoadingState /> : periods.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">No periods exist for {year}. Click Create Year to initialize all 12 months.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600"><tr><th className="px-4 py-3">Period</th><th className="px-4 py-3">Start</th><th className="px-4 py-3">End</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {periods.map((period) => (
                  <tr key={period.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{period.period_name}</td>
                    <td className="px-4 py-3">{formatDate(period.period_start)}</td>
                    <td className="px-4 py-3">{formatDate(period.period_end)}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${period.status === "closed" ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-700"}`}>{period.status === "closed" ? "Closed" : "Open"}</span></td>
                    <td className="px-4 py-3 text-right"><button className={period.status === "closed" ? "btn-secondary" : "btn-primary"} disabled={savingId !== null} onClick={() => void changeStatus(period)}>{period.status === "closed" ? <LockOpen size={15} /> : <Lock size={15} />}{savingId === period.id ? "Saving…" : period.status === "closed" ? "Reopen" : "Close"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
