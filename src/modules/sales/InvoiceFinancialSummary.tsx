import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Banknote, History, ReceiptText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/components/ui";

type FinancialRow = {
  previous_balance: number | string | null;
  invoice_amount: number | string | null;
  paid_amount: number | string | null;
  outstanding_amount: number | string | null;
  today_received: number | string | null;
  last_payment_amount: number | string | null;
  last_payment_date: string | null;
  last_payment_mode: string | null;
  last_payment_account_code: string | null;
  last_payment_account_name: string | null;
  balance_before_last_payment: number | string | null;
  overdue_days: number | string | null;
};

type PaymentRow = {
  id: string;
  amount: number | string;
  allocation_date: string;
  reference?: string | null;
  notes?: string | null;
  journal_entry_id?: string | null;
  journal_line_id?: string | null;
  payment_mode?: string | null;
  account_code?: string | null;
  account_name?: string | null;
};

const n = (v: unknown) => {
  const value = Number(v);
  return Number.isFinite(value) ? value : 0;
};

export default function InvoiceFinancialSummary({
  invoiceId,
  customerId,
  onFinancialChange,
}: {
  invoiceId: string;
  customerId?: string | null;
  onFinancialChange?: (value: FinancialRow | null) => void;
}) {
  const [financial, setFinancial] = useState<FinancialRow | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const [sendingReminder, setSendingReminder] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [financialResult, paymentsResult] = await Promise.all([
      supabase
        .from("sales_invoice_financials")
        .select("*")
        .eq("sales_order_id", invoiceId)
        .maybeSingle(),
      supabase
        .from("invoice_payment_allocations")
        .select("id,amount,allocation_date,reference,notes,journal_entry_id,journal_line_id")
        .eq("sales_order_id", invoiceId)
        .order("allocation_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    if (financialResult.error) {
      setError(financialResult.error.message);
    } else {
      const nextFinancial = (financialResult.data ?? null) as FinancialRow | null;
      setFinancial(nextFinancial);
      onFinancialChange?.(nextFinancial);
    }

    if (paymentsResult.error) {
      // The core invoice remains usable even when the optional history view/table is unavailable.
      setPayments([]);
      if (!financialResult.error) setError(paymentsResult.error.message);
    } else {
      const raw = (paymentsResult.data ?? []) as PaymentRow[];
      const journalIds = Array.from(new Set(raw.map((p) => p.journal_entry_id).filter(Boolean))) as string[];
      const lineIds = Array.from(new Set(raw.map((p) => p.journal_line_id).filter(Boolean))) as string[];

      const [journalResult, lineResult] = await Promise.all([
        journalIds.length
          ? supabase.from("journal_entries").select("id,payment_mode").in("id", journalIds)
          : Promise.resolve({ data: [], error: null }),
        lineIds.length
          ? supabase.from("journal_lines").select("id,account_id").in("id", lineIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const modeMap = new Map<string, string>();
      for (const row of (journalResult.data ?? []) as Array<{ id: string; payment_mode?: string | null }>) {
        modeMap.set(row.id, row.payment_mode || "—");
      }

      const accountIds = Array.from(
        new Set((lineResult.data ?? []).map((r: { account_id?: string | null }) => r.account_id).filter(Boolean))
      ) as string[];
      const accountResult = accountIds.length
        ? await supabase.from("chart_of_accounts").select("id,code,name").in("id", accountIds)
        : { data: [], error: null };
      const accountMap = new Map<string, { code?: string | null; name: string }>();
      for (const row of (accountResult.data ?? []) as Array<{ id: string; code?: string | null; name: string }>) {
        accountMap.set(row.id, row);
      }
      const lineAccountMap = new Map<string, string>();
      for (const row of (lineResult.data ?? []) as Array<{ id: string; account_id?: string | null }>) {
        if (row.account_id) lineAccountMap.set(row.id, row.account_id);
      }

      setPayments(
        raw.map((payment) => {
          const accountId = payment.journal_line_id ? lineAccountMap.get(payment.journal_line_id) : undefined;
          const account = accountId ? accountMap.get(accountId) : undefined;
          return {
            ...payment,
            payment_mode: payment.journal_entry_id ? modeMap.get(payment.journal_entry_id) || "—" : "—",
            account_code: account?.code,
            account_name: account?.name,
          };
        })
      );
    }

    setLoading(false);
  }, [invoiceId, onFinancialChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const createReminder = async () => {
    setSendingReminder(true);
    setReminderMessage(null);
    try {
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("name,email")
        .eq("id", customerId || "")
        .maybeSingle();
      if (customerError) throw customerError;
      if (!customer?.email) throw new Error("Customer email is missing. / گاہک کا ای میل موجود نہیں ہے۔");
      const message = `Dear ${customer.name}, payment reminder for invoice ${invoiceId}. Outstanding balance: ${formatCurrency(n(financial?.outstanding_amount))}. / محترم، براہ کرم بقایا رقم ادا کریں۔`;
      const subject = `Payment Reminder / ادائیگی یاد دہانی — ${invoiceId}`;
      const { data: reminder, error: insertError } = await supabase.from("payment_reminders").insert({
        customer_id: customerId,
        sales_order_id: invoiceId,
        channel: "email",
        recipient: customer.email,
        subject,
        message,
        status: "scheduled",
      }).select("id").single();
      if (insertError) throw insertError;
      const { data: sendData, error: sendError } = await supabase.functions.invoke("send-payment-reminder", { body: { recipient: customer.email, subject, message } });
      if (sendError || !sendData?.success) {
        await supabase.from("payment_reminders").update({ status: "failed", error_message: sendError?.message || sendData?.error || "Email send failed" }).eq("id", reminder.id);
        throw new Error(sendError?.message || sendData?.error || "Email send failed. Configure the email provider first.");
      }
      await supabase.from("payment_reminders").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", reminder.id);
      setReminderMessage("Email reminder sent. / ای میل یاد دہانی بھیج دی گئی ہے۔");
    } catch (e) {
      setReminderMessage(e instanceof Error ? e.message : "Reminder could not be created.");
    } finally { setSendingReminder(false); }
  };

  const totals = useMemo(() => ({
    previous: n(financial?.previous_balance),
    invoice: n(financial?.invoice_amount),
    paid: n(financial?.paid_amount),
    outstanding: n(financial?.outstanding_amount),
    today: n(financial?.today_received),
    last: n(financial?.last_payment_amount),
    beforeLast: n(financial?.balance_before_last_payment),
  }), [financial]);

  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-400">Loading payment history / ادائیگی کی تفصیل…</div>;
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-800">
            <ReceiptText className="h-4 w-4 text-emerald-600" />
            Payment & Balance — ادائیگی اور بقایا
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400">
            Previous balance, last receipt, today's receipt and current outstanding
          </div>
        </div>
        {customerId && totals.outstanding > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Link
              to={`/accounting/cash-counter?customer_id=${encodeURIComponent(customerId)}&invoice_id=${encodeURIComponent(invoiceId)}`}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100"
            >
              <Banknote className="h-3.5 w-3.5" />
              Receive Payment — رقم وصول کریں
            </Link>
            <button type="button" onClick={()=>void createReminder()} disabled={sendingReminder} className="inline-flex items-center justify-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50">
              {sendingReminder ? "Saving…" : "Email Reminder — یاد دہانی"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-[10px] text-amber-700">
          Payment history view unavailable: {error}
        </div>
      )}
      {reminderMessage && <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] text-slate-600">{reminderMessage}</div>}

      <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-4 xl:grid-cols-7">
        {[
          ["Previous Balance", "سابقہ بقایا", totals.previous, "text-slate-800"],
          ["Invoice", "موجودہ بل", totals.invoice, "text-slate-800"],
          ["Total Received", "کل وصولی", totals.paid, "text-emerald-700"],
          ["Today's Received", "آج کی وصولی", totals.today, "text-blue-700"],
          ["Balance Before Last", "آخری وصولی سے پہلے", totals.beforeLast, "text-amber-700"],
          ["Last Payment", "آخری وصولی", totals.last, "text-indigo-700"],
          ["Current Outstanding", "موجودہ بقایا", totals.outstanding, "text-rose-700"],
        ].map(([label, urdu, amount, color]) => (
          <div key={String(label)} className="rounded-md border border-slate-100 bg-slate-50 p-2.5">
            <div className="text-[8px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
            <div className="text-[8px] text-slate-400">{urdu}</div>
            <div className={`mt-1 text-[13px] font-bold ${color}`}>{formatCurrency(Number(amount))}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-3 lg:grid-cols-[1fr_1.6fr]">
        <div className="rounded-md border border-slate-100 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-700">
            <History className="h-3.5 w-3.5 text-indigo-500" />
            Last Payment — آخری وصولی
          </div>
          <div className="mt-2 space-y-1.5 text-[10px]">
            <div className="flex justify-between"><span className="text-slate-400">Date / تاریخ</span><b>{financial?.last_payment_date ? formatDate(financial.last_payment_date) : "—"}</b></div>
            <div className="flex justify-between"><span className="text-slate-400">Amount / رقم</span><b className="text-emerald-700">{formatCurrency(totals.last)}</b></div>
            <div className="flex justify-between"><span className="text-slate-400">Mode / طریقہ</span><b>{financial?.last_payment_mode || "—"}</b></div>
            <div className="flex justify-between"><span className="text-slate-400">Account / اکاؤنٹ</span><b>{[financial?.last_payment_account_code, financial?.last_payment_account_name].filter(Boolean).join(" — ") || "—"}</b></div>
            <div className="flex justify-between"><span className="text-slate-400">After Payment / ادائیگی کے بعد</span><b className="text-rose-700">{formatCurrency(totals.outstanding)}</b></div>
          </div>
        </div>

        <div className="rounded-md border border-slate-100 overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-700">
            Payment History — ادائیگی کی مکمل تاریخ
          </div>
          {payments.length === 0 ? (
            <div className="p-4 text-center text-[10px] text-slate-400">No invoice payments recorded. / کوئی انوائس ادائیگی ریکارڈ نہیں۔</div>
          ) : (
            <div className="max-h-52 overflow-y-auto">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-white text-slate-400">
                  <tr><th className="px-2 py-2 text-left">Date / تاریخ</th><th className="px-2 py-2 text-left">Voucher / واؤچر</th><th className="px-2 py-2 text-left">Mode / Account / طریقہ یا اکاؤنٹ</th><th className="px-2 py-2 text-right">Amount / رقم</th></tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-slate-100">
                      <td className="px-2 py-2">{formatDate(payment.allocation_date)}</td>
                      <td className="px-2 py-2 font-medium text-indigo-700">{payment.journal_entry_id ? payment.journal_entry_id.slice(0, 8) : "—"}</td>
                      <td className="px-2 py-2">{payment.payment_mode || "—"}{payment.account_name ? ` · ${payment.account_code || ""} ${payment.account_name}` : ""}</td>
                      <td className="px-2 py-2 text-right font-bold text-emerald-700">{formatCurrency(n(payment.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {financial?.overdue_days && n(financial.overdue_days) > 0 && (
        <div className="border-t border-rose-100 bg-rose-50 px-3 py-2 text-[10px] font-semibold text-rose-700">
          Overdue / زائد المیعاد: {financial.overdue_days} days — payment reminder can be sent from this invoice.
        </div>
      )}
    </section>
  );
}
