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

const CORRECTION_REASONS = [
  { value: "Wrong Tare Weight", label: "Wrong Tare Weight / خالی وزن غلط" },
  { value: "Wrong Gross Weight", label: "Wrong Gross Weight / بھرا وزن غلط" },
  { value: "Wrong Material", label: "Wrong Material / مال غلط" },
  { value: "Wrong Quantity", label: "Wrong Quantity / مقدار غلط" },
  { value: "Wrong Warehouse or Godown", label: "Wrong Warehouse / Godown / گودام غلط" },
  { value: "Wrong Customer", label: "Wrong Customer / کسٹمر غلط" },
  { value: "Wrong Vehicle or Driver", label: "Wrong Vehicle / Driver / گاڑی یا ڈرائیور غلط" },
  { value: "Loading Entry Correction", label: "Loading Entry Correction / لوڈنگ انٹری کی تصحیح" },
  { value: "Kanta Entry Correction", label: "Kanta Entry Correction / کانٹا انٹری کی تصحیح" },
  { value: "Data Entry Mistake", label: "Data Entry Mistake / ڈیٹا انٹری کی غلطی" },
  { value: "Customer Request", label: "Customer Request / کسٹمر کی درخواست" },
  { value: "Other", label: "Other / دیگر" },
];

export default function LoadingUnloading() {
  const [finalized, setFinalized] = useState<FinalGatePass[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
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

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".gp-workflow-shell");
    if (!root) return;

    const decorate = () => {
      root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        const text = (button.textContent || "").replace(/\s+/g, " ").trim();
        button.removeAttribute("data-gp-workflow-state");

        if (
          text.startsWith("Edit Token") ||
          text.startsWith("Edit 1st Kanta") ||
          text.startsWith("Edit Loading") ||
          text.startsWith("Edit 2nd Kanta")
        ) {
          button.dataset.gpWorkflowState = "complete";
        } else if (text.startsWith("Generate Final GP")) {
          button.dataset.gpWorkflowState = "final";
        } else if (text.startsWith("Print Final GP")) {
          button.dataset.gpWorkflowState = "final";
        } else if (
          text === "Loading" ||
          text.startsWith("2nd Kanta / Gross")
        ) {
          button.dataset.gpWorkflowState = "current";
        } else if (text.startsWith("1st Kanta / Tare")) {
          button.dataset.gpWorkflowState = "pending";
        } else if (text.startsWith("Print Loading Worksheet")) {
          button.dataset.gpWorkflowState = "neutral";
        }
      });

      root.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
        const statusCell = row.querySelectorAll<HTMLTableCellElement>("td")[4];
        if (!statusCell) return;
        const status = (statusCell.textContent || "").trim();
        statusCell.dataset.gpStatus = status;
      });
    };

    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const reopen = async () => {
    setMessage(null);
    if (!selectedId) return setMessage("Final Gate Pass select karein.");
    if (!reason) return setMessage("Correction reason select karein.");
    if (reason === "Other" && !remarks.trim()) return setMessage("Other select kiya hai to Remarks required hain.");

    const auditReason = remarks.trim()
      ? `${reason} — Remarks: ${remarks.trim()}`
      : reason;

    setBusy(true);
    const { error } = await supabase.rpc("reopen_final_gate_pass_for_correction", {
      p_gate_pass_id: selectedId,
      p_reason: auditReason,
    });
    setBusy(false);
    if (error) return setMessage(error.message);

    setMessage("Gate Pass correction ke liye reopen ho gaya. Ab Token, 1st Kanta, Loading aur 2nd Kanta edit kar sakte hain.");
    setTimeout(() => window.location.reload(), 700);
  };

  return (
    <div className="space-y-4">
      <style>{`
        .gp-workflow-shell button[data-gp-workflow-state="complete"] {
          background: #16a34a !important;
          border-color: #16a34a !important;
          color: #fff !important;
          box-shadow: 0 1px 2px rgba(22, 163, 74, .18);
        }
        .gp-workflow-shell button[data-gp-workflow-state="complete"]:hover {
          background: #15803d !important;
          border-color: #15803d !important;
        }
        .gp-workflow-shell button[data-gp-workflow-state="final"] {
          background: #2563eb !important;
          border-color: #2563eb !important;
          color: #fff !important;
          box-shadow: 0 1px 2px rgba(37, 99, 235, .18);
        }
        .gp-workflow-shell button[data-gp-workflow-state="current"] {
          background: #2563eb !important;
          border-color: #2563eb !important;
          color: #fff !important;
        }
        .gp-workflow-shell button[data-gp-workflow-state="pending"],
        .gp-workflow-shell button[data-gp-workflow-state="neutral"] {
          background: #fff !important;
          border-color: #cbd5e1 !important;
          color: #334155 !important;
        }
        .gp-workflow-shell td[data-gp-status="Final Gate Pass"] {
          color: #1d4ed8 !important;
          font-weight: 700;
        }
        .gp-workflow-shell td[data-gp-status="Loading Done"],
        .gp-workflow-shell td[data-gp-status="1st Kanta Done"],
        .gp-workflow-shell td[data-gp-status="2nd Kanta Done"] {
          color: #15803d !important;
          font-weight: 700;
        }
      `}</style>

      <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4 shadow-sm">
        <div className="mb-3">
          <div className="font-semibold text-amber-950">Final GP Correction / فائنل گیٹ پاس تصحیح</div>
          <div className="text-xs text-amber-700">
            Finalized GP ko direct edit nahi kiya jata. Reason select karke reopen karein; phir previous steps controlled correction ke liye edit ho jayenge.
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(280px,1.1fr)_minmax(260px,1fr)_minmax(320px,1.25fr)_auto]">
          <div>
            <label className="label">Final Gate Pass / فائنل گیٹ پاس</label>
            <select className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Select Final Gate Pass</option>
              {finalized.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.pass_no} · {g.customer_name || "—"} · {g.vehicle_no || "—"} · {g.pass_date}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Correction Reason / تصحیح کی وجہ</label>
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Select a reason / وجہ منتخب کریں</option>
              {CORRECTION_REASONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Remarks / تصحیح کی تفصیل</label>
            <input
              className="input"
              placeholder="Add remarks (optional) / اضافی تفصیل لکھیں"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              className="btn btn-primary whitespace-nowrap"
              disabled={busy}
              onClick={() => void reopen()}
            >
              {busy ? "Reopening..." : "↻ Reopen for Correction"}
            </button>
          </div>
        </div>
        {message && <div className="mt-3 text-sm font-medium text-amber-900">{message}</div>}
      </div>

      <div className="gp-workflow-shell">
        <GatePassWorkflow />
      </div>

      <div className="flex flex-wrap gap-4 rounded-xl border bg-white px-4 py-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-slate-300" />Not Started / شروع نہیں ہوا</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-blue-500" />Current Action / موجودہ مرحلہ</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-green-600" />Completed / مکمل</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-blue-700" />Finalized / حتمی</span>
      </div>
    </div>
  );
}
