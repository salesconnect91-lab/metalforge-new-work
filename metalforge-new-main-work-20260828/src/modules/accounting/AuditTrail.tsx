import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { ErrorBanner } from "@/components/ui";
import { Shield, RefreshCw } from "lucide-react";

interface AuditLog {
  id: string;
  action: string;
  module: string;
  record_name: string;
  performed_by: string;
  created_at: string;
}

export default function AuditTrail() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Database se logs fetch karne ka function
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setLogs(data ?? []);
    }
    setLoading(false);
  }, []);

  // 2. Realtime Subscriptions aur Initial Load dono ko handle karne ke liye
  useEffect(() => {
    fetchLogs();

    // Supabase ka live channel jo automatic logs listen karega
    const auditChannel = supabase
      .channel("live-audit-logs")
      .on(
        "postgres_changes",
        {
          event: "INSERT", // Jab bhi database mein naya log insert ho
          schema: "public",
          table: "audit_logs",
        },
        (payload) => {
          // Naye incoming log ko sabse upar list mein append karein
          const newLog = payload.new as AuditLog;
          setLogs((currentLogs) => [newLog, ...currentLogs]);
        }
      )
      .subscribe();

    // Component unmount hone par channel clean up
    return () => {
      supabase.removeChannel(auditChannel);
    };
  }, [fetchLogs]);

  const actionColors: Record<string, string> = {
    INSERT: "bg-emerald-100 text-emerald-800",
    UPDATE: "bg-blue-100 text-blue-800",
    DELETE: "bg-rose-100 text-rose-800",
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" /> Audit Trail & Activity History
          </h1>
          <p className="text-sm text-slate-500 mt-1">Track all user actions, modifications, and system events (SAP Style). / تمام صارف کارروائیوں، تبدیلیوں اور سسٹم واقعات کا ریکارڈ۔</p>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition"
        >
          <RefreshCw className="w-4 h-4" /> Refresh Logs
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-3 px-4 font-semibold">Action / کارروائی</th>
                <th className="py-3 px-4 font-semibold">Module / Area / ماڈیول</th>
                <th className="py-3 px-4 font-semibold">Record Details / ریکارڈ تفصیل</th>
                <th className="py-3 px-4 font-semibold">Performed By / انجام دینے والا</th>
                <th className="py-3 px-4 font-semibold">Timestamp / وقت</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">Loading audit history... / آڈٹ ریکارڈ لوڈ ہو رہا ہے...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">No audit logs recorded yet. / ابھی کوئی آڈٹ ریکارڈ موجود نہیں۔</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full uppercase ${actionColors[log.action] || "bg-slate-100 text-slate-800"}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-800">{log.module}</td>
                    <td className="py-3.5 px-4 text-slate-600">{log.record_name || "—"}</td>
                    <td className="py-3.5 px-4 text-slate-700 font-medium">{log.performed_by}</td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
