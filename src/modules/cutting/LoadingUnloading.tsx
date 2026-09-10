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
  { value: "Wrong Tare Weight", label: "Wrong Tare Weight / خالی گاڑی کا وزن غلط" },
  { value: "Wrong Gross Weight", label: "Wrong Gross Weight / بھری گاڑی کا وزن غلط" },
  { value: "Wrong Material", label: "Wrong Material / مال کی تفصیل غلط" },
  { value: "Wrong Quantity", label: "Wrong Quantity / مقدار غلط" },
  { value: "Wrong Warehouse or Godown", label: "Wrong Warehouse / Godown / ویئرہاؤس یا گودام غلط" },
  { value: "Wrong Customer", label: "Wrong Customer / گاہک غلط" },
  { value: "Wrong Vehicle or Driver", label: "Wrong Vehicle / Driver / گاڑی یا ڈرائیور غلط" },
  { value: "Loading Entry Correction", label: "Loading Entry Correction / لوڈنگ اندراج کی تصحیح" },
  { value: "Kanta Entry Correction", label: "Weighbridge Entry Correction / کانٹا اندراج کی تصحیح" },
  { value: "Data Entry Mistake", label: "Data Entry Mistake / ڈیٹا اندراج کی غلطی" },
  { value: "Customer Request", label: "Customer Request / گاہک کی درخواست" },
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
        } else if (text.startsWith("Generate Final GP") || text.startsWith("Print Final GP")) {
          button.dataset.gpWorkflowState = "final";
        } else if (text === "Loading" || text.startsWith("2nd Kanta / Gross")) {
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
        statusCell.dataset.gpStatus = (statusCell.textContent || "").trim();
      });
    };

    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const reopen = async () => {
    setMessage(null);
    if (!selectedId) return setMessage("Please select a Final Gate Pass. / براہِ کرم فائنل گیٹ پاس منتخب کریں۔");
    if (!reason) return setMessage("Please select a correction reason. / براہِ کرم تصحیح کی وجہ منتخب کریں۔");
    if (reason === "Other" && !remarks.trim()) return setMessage("Remarks are required for Other. / 'دیگر' کی صورت میں تفصیل لکھنا ضروری ہے۔");

    const auditReason = remarks.trim() ? `${reason} — Remarks: ${remarks.trim()}` : reason;

    setBusy(true);
    const { error } = await supabase.rpc("reopen_final_gate_pass_for_correction", {
      p_gate_pass_id: selectedId,
      p_reason: auditReason,
    });
    setBusy(false);
    if (error) return setMessage(error.message);

    setMessage("Gate Pass reopened for correction. Token, 1st Kanta, Loading and 2nd Kanta can now be edited. / گیٹ پاس تصحیح کے لیے دوبارہ کھول دیا گیا ہے۔ اب ٹوکن، پہلا کانٹا، لوڈنگ اور دوسرا کانٹا درست کیے جا سکتے ہیں۔");
    setTimeout(() => window.location.reload(), 700);
  };

  return (
    <div className="w-full min-w-0 max-w-none space-y-4 overflow-hidden">
      <style>{`
        .gp-workflow-shell { width:100%; min-width:0; max-width:none; }
        .gp-workflow-shell > * { max-width:none!important; }
        .gp-workflow-shell button[data-gp-workflow-state="complete"] { background:#16a34a!important;border-color:#16a34a!important;color:#fff!important;box-shadow:0 1px 2px rgba(22,163,74,.18); }
        .gp-workflow-shell button[data-gp-workflow-state="complete"]:hover { background:#15803d!important;border-color:#15803d!important; }
        .gp-workflow-shell button[data-gp-workflow-state="final"] { background:#2563eb!important;border-color:#2563eb!important;color:#fff!important;box-shadow:0 1px 2px rgba(37,99,235,.18); }
        .gp-workflow-shell button[data-gp-workflow-state="current"] { background:#2563eb!important;border-color:#2563eb!important;color:#fff!important; }
        .gp-workflow-shell button[data-gp-workflow-state="pending"], .gp-workflow-shell button[data-gp-workflow-state="neutral"] { background:#fff!important;border-color:#cbd5e1!important;color:#334155!important; }
        .gp-workflow-shell td[data-gp-status="Final Gate Pass"] { color:#1d4ed8!important;font-weight:700; }
        .gp-workflow-shell td[data-gp-status="Loading Done"], .gp-workflow-shell td[data-gp-status="1st Kanta Done"], .gp-workflow-shell td[data-gp-status="2nd Kanta Done"] { color:#15803d!important;font-weight:700; }
      `}</style>

      <div className="w-full min-w-0 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4 shadow-sm" data-no-print>
        <div className="mb-3">
          <div className="font-semibold text-amber-950">Final GP Correction / فائنل گیٹ پاس کی تصحیح</div>
          <div className="text-xs text-amber-700">
            A finalized Gate Pass cannot be edited directly. Select a reason and reopen it for controlled correction. / حتمی گیٹ پاس میں براہِ راست ترمیم نہیں کی جا سکتی۔ وجہ منتخب کریں اور مجاز تصحیح کے لیے اسے دوبارہ کھولیں۔
          </div>
        </div>

        <div className="grid w-full min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0">
            <label className="label">Final Gate Pass / فائنل گیٹ پاس</label>
            <select className="input w-full min-w-0" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Select Final Gate Pass / فائنل گیٹ پاس منتخب کریں</option>
              {finalized.map((g) => (
                <option key={g.id} value={g.id}>{g.pass_no} · {g.customer_name || "—"} · {g.vehicle_no || "—"} · {g.pass_date}</option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label className="label">Correction Reason / تصحیح کی وجہ</label>
            <select className="input w-full min-w-0" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Select a reason / وجہ منتخب کریں</option>
              {CORRECTION_REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>

          <div className="min-w-0">
            <label className="label">Remarks / تفصیل</label>
            <input className="input w-full min-w-0" placeholder="Add remarks (optional) / اضافی تفصیل لکھیں" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>

          <div className="flex min-w-0 items-end">
            <button type="button" className="btn btn-primary w-full whitespace-normal text-center leading-tight" disabled={busy} onClick={() => void reopen()}>
              {busy ? "Reopening... / دوبارہ کھولا جا رہا ہے..." : "↻ Reopen for Correction / تصحیح کے لیے دوبارہ کھولیں"}
            </button>
          </div>
        </div>
        {message && <div className="mt-3 text-sm font-medium text-amber-900">{message}</div>}
      </div>

      <div className="gp-workflow-shell w-full min-w-0 max-w-none">
        <GatePassWorkflow />
      </div>

      <div className="flex w-full flex-wrap gap-4 rounded-xl border bg-white px-4 py-3 text-xs text-slate-600" data-no-print>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-slate-300" />Not Started / شروع نہیں ہوا</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-blue-500" />Current Action / موجودہ مرحلہ</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-green-600" />Completed / مکمل</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-blue-700" />Finalized / حتمی</span>
      </div>
    </div>
  );
}
