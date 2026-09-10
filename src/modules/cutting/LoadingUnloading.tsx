import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import GatePassWorkflow from "./GatePassWorkflow";

type FinalGatePass = {
  id: string;
  pass_no: string;
  customer_name: string | null;
  vehicle_no: string | null;
  pass_date: string;
};

export default function LoadingUnloading() {
  const [finalized, setFinalized] = useState<FinalGatePass[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("gate_passes")
        .select("id,pass_no,customer_name,vehicle_no,pass_date")
        .eq("status", "finalized")
        .order("created_at", { ascending: false });
      setFinalized((data || []) as FinalGatePass[]);
    })();
  }, []);

  const reopen = async () => {
    setMessage(null);
    if (!selectedId) return setMessage("Final Gate Pass select karein.");
    if (!reason.trim()) return setMessage("Correction reason required hai.");
    setBusy(true);
    const { error } = await supabase.rpc("reopen_final_gate_pass_for_correction", {
      p_gate_pass_id: selectedId,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (error) return setMessage(error.message);
    setMessage("Gate Pass correction ke liye reopen ho gaya. Ab Token, 1st Kanta, Loading aur 2nd Kanta edit kar sakte hain.");
    setTimeout(() => window.location.reload(), 700);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-amber-900">Final GP Correction / فائنل گیٹ پاس تصحیح</div>
            <div className="text-xs text-amber-700">Finalized GP ko direct edit nahi kiya jata. Reason ke saath reopen karein, phir tamam previous steps edit ho jayenge.</div>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-[minmax(260px,1fr)_minmax(260px,1.4fr)_auto]">
          <select className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Select Final Gate Pass</option>
            {finalized.map((g) => (
              <option key={g.id} value={g.id}>
                {g.pass_no} · {g.customer_name || "—"} · {g.vehicle_no || "—"} · {g.pass_date}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Correction reason / تصحیح کی وجہ"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void reopen()}>
            {busy ? "Reopening..." : "Reopen for Correction"}
          </button>
        </div>
        {message && <div className="mt-2 text-sm text-amber-900">{message}</div>}
      </div>
      <GatePassWorkflow />
    </div>
  );
}
