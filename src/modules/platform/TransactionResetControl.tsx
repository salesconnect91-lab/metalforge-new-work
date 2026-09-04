import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Preview = {
  total_rows: number;
  counts: Record<string, number>;
  preserved: string[];
};

type Props = { companyId: string; companyName: string; companyCode: string };

const invoke = async (action: string, payload: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("platform-admin", { body: { action, ...payload } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
};

const label = (key: string) => key.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());

export default function TransactionResetControl({ companyId, companyName, companyCode }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [ack, setAck] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const expected = `RESET ${companyCode}`;

  const activeCounts = useMemo(() => Object.entries(preview?.counts ?? {}).filter(([, count]) => count > 0), [preview]);

  const loadPreview = async () => {
    setLoading(true); setError(""); setMessage("");
    try { setPreview(await invoke("reset_company_preview", { company_id: companyId }) as Preview); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not inspect company data."); }
    finally { setLoading(false); }
  };

  useEffect(() => { setPreview(null); setConfirmation(""); setAck(false); setMessage(""); setError(""); void loadPreview(); }, [companyId]);

  const reset = async () => {
    if (confirmation !== expected || !ack) return;
    const ok = window.confirm(`Permanently reset transactional/test data for ${companyName}?\n\nMaster data, users, settings, COA and audit history will be preserved.`);
    if (!ok) return;
    setResetting(true); setError(""); setMessage("");
    try {
      const result = await invoke("reset_company_transactions", { company_id: companyId, confirmation, acknowledge: true });
      setMessage(`Reset completed successfully. ${Number(result?.deleted_rows ?? 0).toLocaleString()} transaction rows removed.`);
      setConfirmation(""); setAck(false); await loadPreview();
    } catch (e) { setError(e instanceof Error ? e.message : "Reset failed."); }
    finally { setResetting(false); }
  };

  return <section className="rounded-xl border border-rose-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><Database className="h-5 w-5 text-rose-600"/><h2 className="font-semibold text-slate-900">Reset Company Transaction Data</h2></div>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">Professional test-data reset for <b>{companyName}</b>. It removes entered operational/accounting transactions only; master setup and security remain intact.</p>
      </div>
      <button type="button" className="btn-secondary" disabled={loading || resetting} onClick={() => void loadPreview()}>{loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <RefreshCw className="h-4 w-4"/>}Refresh Preview</button>
    </div>

    {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
    {message && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}

    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between"><span className="text-sm font-semibold text-slate-800">Data that will be removed</span><span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">{(preview?.total_rows ?? 0).toLocaleString()} rows</span></div>
        <div className="mt-3 max-h-48 space-y-1 overflow-auto text-xs text-slate-600">{activeCounts.length ? activeCounts.map(([table,count]) => <div key={table} className="flex justify-between gap-4"><span>{label(table)}</span><b>{count.toLocaleString()}</b></div>) : <div className="text-slate-400">No transaction/test rows currently found.</div>}</div>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><ShieldCheck className="h-4 w-4"/>Preserved safely</div>
        <div className="mt-3 grid gap-1 text-xs text-emerald-800 sm:grid-cols-2">{(preview?.preserved ?? []).map(x => <div key={x}>✓ {x}</div>)}</div>
      </div>
    </div>

    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex gap-2 text-sm font-semibold text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>Permanent action — use before a fresh testing cycle.</div>
      <p className="mt-2 text-xs text-rose-700">Type <b>{expected}</b> exactly. Audit history is preserved and the reset itself is recorded in the platform audit log.</p>
      <input className="input mt-3 max-w-md border-rose-300" value={confirmation} onChange={e=>setConfirmation(e.target.value)} placeholder={expected}/>
      <label className="mt-3 flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" className="mt-0.5" checked={ack} onChange={e=>setAck(e.target.checked)}/><span>I understand this permanently removes the selected company&apos;s transactional/test entries.</span></label>
      <button type="button" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={resetting || loading || confirmation !== expected || !ack} onClick={() => void reset()}>{resetting && <Loader2 className="h-4 w-4 animate-spin"/>}Reset Transaction Data</button>
    </div>
  </section>;
}
