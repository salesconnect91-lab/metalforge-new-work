import SearchableSelect from "@/components/SearchableSelect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileDown, Loader2, Printer, RefreshCw, Search } from "lucide-react";
import jsPDF from "jspdf";
import { supabase } from "@/lib/supabase";

type TransactionType =
  | "salary_payment"
  | "expense_payment"
  | "loan_received"
  | "loan_repayment"
  | "capital_received"
  | "drawings_payment"
  | "other_receipt"
  | "other_payment";

type Account = {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  account_role?: string | null;
  detail_type?: string | null;
  is_group?: boolean | null;
  is_active?: boolean | null;
  allow_manual_entries?: boolean | null;
};

type Employee = {
  id: string;
  employee_code?: string | null;
  name: string;
  phone?: string | null;
  designation?: string | null;
  department?: string | null;
};

type PartySuggestion = { id: string; name: string; source: string };

type Voucher = {
  id: string;
  entry_no: string;
  entry_date: string;
  description: string | null;
  party_name: string | null;
  payment_mode: string | null;
};

type PostedVoucher = {
  entry_no: string;
  journal_entry_id: string;
  transaction_label: string;
  date: string;
  party_name: string;
  counter_account: string;
  cash_bank_account: string;
  amount: number;
  reference: string;
  notes: string;
};

const CONTROLLED_MAPPING_KEYS = new Set([
  "accounts_receivable",
  "accounts_payable",
  "inventory",
  "input_vat",
  "output_vat",
  "cogs",
  "cash",
  "bank",
]);

const today = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const money = (value: number) =>
  new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));

const stripAccountCode = (value: string) =>
  String(value || "").replace(/^\s*[A-Z]{0,4}[-/]?\d{2,10}(?:[./-]\d+)?\s*(?:[-–—:|]\s*)+/, "").trim() || value;

const TYPES: Array<{
  value: TransactionType;
  label: string;
  accountType?: Account["type"];
  partyLabel: string;
}> = [
  { value: "salary_payment", label: "Salary Payment / تنخواہ ادائیگی", accountType: "expense", partyLabel: "Employee / ملازم" },
  { value: "expense_payment", label: "Expense Payment / خرچ ادائیگی", accountType: "expense", partyLabel: "Paid To / ادا کیا گیا" },
  { value: "loan_received", label: "Loan Received / قرض وصول", accountType: "liability", partyLabel: "Lender / قرض دہندہ" },
  { value: "loan_repayment", label: "Loan Repayment / قرض واپسی", accountType: "liability", partyLabel: "Lender / قرض دہندہ" },
  { value: "capital_received", label: "Capital Received / سرمایہ وصول", accountType: "equity", partyLabel: "Owner / مالک" },
  { value: "drawings_payment", label: "Owner Drawings / مالک نکاسی", accountType: "equity", partyLabel: "Owner / مالک" },
  { value: "other_receipt", label: "Other Receipt / دیگر وصولی", partyLabel: "Received From / وصول کنندہ" },
  { value: "other_payment", label: "Other Payment / دیگر ادائیگی", partyLabel: "Paid To / ادا کیا گیا" },
];

const isCashBank = (account: Account) =>
  account.type === "asset" &&
  (account.detail_type === "Cash on Hand" ||
    account.detail_type === "Bank Account" ||
    account.account_role === "cash" ||
    account.account_role === "bank");

export default function GeneralCashBankPanel() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [partySuggestions, setPartySuggestions] = useState<PartySuggestion[]>([]);
  const [mappedIds, setMappedIds] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Voucher[]>([]);

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showEmployeeResults, setShowEmployeeResults] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newEmployeeCode, setNewEmployeeCode] = useState("");
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeePhone, setNewEmployeePhone] = useState("");
  const [newEmployeeDesignation, setNewEmployeeDesignation] = useState("");
  const [newEmployeeDepartment, setNewEmployeeDepartment] = useState("");
  const [savingEmployee, setSavingEmployee] = useState(false);

  const [transactionType, setTransactionType] = useState<TransactionType>("salary_payment");
  const [transactionDate, setTransactionDate] = useState(today());
  const [counterAccountId, setCounterAccountId] = useState("");
  const [cashBankAccountId, setCashBankAccountId] = useState("");
  const [partyName, setPartyName] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastVoucher, setLastVoucher] = useState<PostedVoucher | null>(null);

  const selectedType = TYPES.find((item) => item.value === transactionType) || TYPES[0];

  const cashBankAccounts = useMemo(() => accounts.filter(isCashBank), [accounts]);

  const counterAccounts = useMemo(() => {
    const controlledIds = new Set(
      Object.entries(mappedIds)
        .filter(([key]) => CONTROLLED_MAPPING_KEYS.has(key))
        .map(([, id]) => id)
        .filter(Boolean),
    );
    const salaryId = mappedIds.salary_expense;
    const cogsId = mappedIds.cogs;
    const apId = mappedIds.accounts_payable;
    const outputVatId = mappedIds.output_vat;

    return accounts.filter((account) => {
      if (account.id === cashBankAccountId || isCashBank(account)) return false;
      const detail = String(account.detail_type || "");
      const name = account.name.toLowerCase();

      if (transactionType === "salary_payment") {
        return account.type === "expense" &&
          (account.id === salaryId || detail === "Salaries" || name.includes("salary") || name.includes("salaries"));
      }

      if (transactionType === "expense_payment") {
        if (account.type !== "expense") return false;
        if (account.id === salaryId || account.id === cogsId) return false;
        if (["COGS", "Salaries"].includes(detail)) return false;
        if (name.includes("cost of goods sold") || name.includes("salary") || name.includes("salaries")) return false;
        return true;
      }

      if (transactionType === "loan_received" || transactionType === "loan_repayment") {
        if (account.type !== "liability") return false;
        if (account.id === apId || account.id === outputVatId) return false;
        return !["Accounts Payable", "Output VAT"].includes(detail);
      }

      if (transactionType === "capital_received") {
        return account.type === "equity" && !["Retained Earnings", "Owner Drawings", "Drawings"].includes(detail) && !name.includes("drawings");
      }

      if (transactionType === "drawings_payment") {
        return account.type === "equity" && (["Owner Drawings", "Drawings"].includes(detail) || name.includes("drawings"));
      }

      if (transactionType === "other_receipt" || transactionType === "other_payment") {
        if (controlledIds.has(account.id)) return false;
        return ![
          "Accounts Receivable", "Accounts Payable", "Inventory", "Input VAT", "Output VAT",
          "COGS", "Cash on Hand", "Bank Account", "Retained Earnings",
        ].includes(detail);
      }

      return selectedType.accountType ? account.type === selectedType.accountType : true;
    });
  }, [accounts, cashBankAccountId, mappedIds, selectedType.accountType, transactionType]);

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    return employees
      .filter((employee) => !q || [employee.employee_code, employee.name, employee.phone, employee.designation, employee.department].join(" ").toLowerCase().includes(q))
      .slice(0, 12);
  }, [employees, employeeSearch]);

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter((row) => [row.entry_no, row.entry_date, row.party_name, row.description, row.payment_mode].join(" ").toLowerCase().includes(q));
  }, [history, search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountsResult, employeesResult, suppliersResult, transportersResult, mappingsResult, historyResult] = await Promise.all([
        supabase.from("chart_of_accounts").select("id,code,name,type,account_role,detail_type,is_group,is_active,allow_manual_entries").eq("is_active", true).eq("is_group", false).eq("allow_manual_entries", true).order("code"),
        supabase.from("employees").select("id,employee_code,name,phone,designation,department").eq("is_active", true).order("name"),
        supabase.from("suppliers").select("id,name").eq("is_active", true).order("name"),
        supabase.from("transporters").select("id,name").order("name"),
        supabase.from("account_mappings").select("mapping_key,account_id"),
        supabase.from("journal_entries").select("id,entry_no,entry_date,description,party_name,payment_mode").eq("status", "posted").eq("trans_type", "General Cash/Bank").order("entry_date", { ascending: false }).order("entry_no", { ascending: false }).limit(100),
      ]);

      if (accountsResult.error) throw accountsResult.error;
      if (employeesResult.error) throw employeesResult.error;
      if (historyResult.error) throw historyResult.error;

      const loadedAccounts = (accountsResult.data || []) as Account[];
      const loadedEmployees = (employeesResult.data || []) as Employee[];
      const nextMappings: Record<string, string> = {};
      (mappingsResult.data || []).forEach((row: any) => {
        if (row?.mapping_key && row?.account_id) nextMappings[String(row.mapping_key)] = String(row.account_id);
      });

      const suggestionMap = new Map<string, PartySuggestion>();
      const addSuggestion = (id: string, name: string, source: string) => {
        const clean = String(name || "").trim();
        if (!clean) return;
        const key = clean.toLowerCase();
        if (!suggestionMap.has(key)) suggestionMap.set(key, { id, name: clean, source });
      };
      (suppliersResult.data || []).forEach((row: any) => addSuggestion(String(row.id), row.name, "Supplier"));
      (transportersResult.data || []).forEach((row: any) => addSuggestion(String(row.id), row.name, "Transporter"));
      loadedEmployees.forEach((row) => addSuggestion(row.id, row.name, "Employee"));

      setAccounts(loadedAccounts);
      setEmployees(loadedEmployees);
      setMappedIds(nextMappings);
      setPartySuggestions(Array.from(suggestionMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
      setHistory((historyResult.data || []) as Voucher[]);

      const firstCash = loadedAccounts.find(isCashBank);
      if (firstCash) setCashBankAccountId((current) => current || firstCash.id);
    } catch (err: any) {
      setError(err?.message || "Failed to load general transactions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setCounterAccountId("");
    setPartyName("");
    setEmployeeSearch("");
  }, [transactionType]);

  const addEmployee = async () => {
    const name = newEmployeeName.trim();
    if (!name) return setError("Employee name is required.");
    setSavingEmployee(true);
    setError(null);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const userId = authData.user?.id;
      if (!userId) throw new Error("Authentication required.");
      const { data, error: insertError } = await supabase.from("employees").insert({
        user_id: userId,
        employee_code: newEmployeeCode.trim() || null,
        name,
        phone: newEmployeePhone.trim() || null,
        designation: newEmployeeDesignation.trim() || null,
        department: newEmployeeDepartment.trim() || null,
        is_active: true,
      }).select("id,employee_code,name,phone,designation,department").single();
      if (insertError) throw insertError;
      const employee = data as Employee;
      setEmployees((current) => [...current, employee].sort((a, b) => a.name.localeCompare(b.name)));
      setPartySuggestions((current) => {
        if (current.some((row) => row.name.toLowerCase() === employee.name.toLowerCase())) return current;
        return [...current, { id: employee.id, name: employee.name, source: "Employee" }].sort((a, b) => a.name.localeCompare(b.name));
      });
      setPartyName(employee.name);
      setEmployeeSearch(employee.name);
      setShowEmployeeResults(false);
      setShowAddEmployee(false);
      setNewEmployeeCode(""); setNewEmployeeName(""); setNewEmployeePhone(""); setNewEmployeeDesignation(""); setNewEmployeeDepartment("");
      setSuccess(`Employee ${employee.name} added successfully.`);
    } catch (err: any) {
      setError(err?.message || "Failed to add employee.");
    } finally {
      setSavingEmployee(false);
    }
  };

  const post = async () => {
    setSaving(true); setError(null); setSuccess(null);
    try {
      const amountNumber = Number(amount);
      if (!transactionDate) throw new Error("Transaction date is required.");
      if (!counterAccountId) throw new Error("Transaction account is required.");
      if (!cashBankAccountId) throw new Error("Cash/Bank account is required.");
      if (transactionType === "salary_payment" && !partyName.trim()) throw new Error("Select an employee for Salary Payment.");
      if (transactionType === "expense_payment" && !partyName.trim()) throw new Error("Paid To is required for Expense Payment.");
      if (!Number.isFinite(amountNumber) || amountNumber <= 0) throw new Error("Enter a valid amount greater than zero.");

      const counterAccount = accounts.find((account) => account.id === counterAccountId);
      const cashBankAccount = accounts.find((account) => account.id === cashBankAccountId);
      const { data, error: rpcError } = await supabase.rpc("post_general_cash_bank_transaction", {
        p_transaction_date: transactionDate,
        p_transaction_type: transactionType,
        p_counter_account_id: counterAccountId,
        p_cash_bank_account_id: cashBankAccountId,
        p_amount: amountNumber,
        p_party_name: partyName.trim() || null,
        p_reference: reference.trim() || null,
        p_notes: notes.trim() || null,
      });
      if (rpcError) throw rpcError;
      const result = typeof data === "object" && data !== null ? (data as any) : {};
      if (result.success === false) throw new Error(result.message || "Transaction posting failed.");

      const voucher: PostedVoucher = {
        entry_no: result.entry_no || "General Transaction",
        journal_entry_id: result.journal_entry_id || "",
        transaction_label: selectedType.label,
        date: transactionDate,
        party_name: partyName.trim(),
        counter_account: counterAccount?.name || "—",
        cash_bank_account: cashBankAccount?.name || "—",
        amount: amountNumber,
        reference: reference.trim(),
        notes: notes.trim(),
      };
      setLastVoucher(voucher);
      setSuccess(`${selectedType.label} posted successfully — ${voucher.entry_no}. Rs. ${money(amountNumber)}`);
      setAmount(""); setReference(""); setNotes(""); setPartyName(""); setEmployeeSearch(""); setShowEmployeeResults(false);
      await load();
    } catch (err: any) {
      setError(err?.message || err?.details || err?.hint || "Failed to post transaction.");
    } finally {
      setSaving(false);
    }
  };

  const printVoucher = (voucher: PostedVoucher) => {
    const popup = window.open("", "_blank", "width=900,height=850");
    if (!popup) return setError("Please allow pop-ups to print the voucher.");
    const isExpense = voucher.transaction_label.toLowerCase().includes("expense payment");
    const partyLabel = isExpense ? "Paid To" : voucher.transaction_label.toLowerCase().includes("salary") ? "Employee" : "Party / Name";
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${voucher.entry_no}</title><style>
      body{font-family:Arial,sans-serif;margin:36px;color:#0f172a}.top{display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:16px;margin-bottom:22px}h1{margin:0;font-size:22px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.label{font-size:11px;color:#64748b;margin-bottom:4px}.value{font-size:14px;font-weight:700}.amount{margin-top:24px;padding:18px;border:1px solid #cbd5e1;display:flex;justify-content:space-between}.amount strong{font-size:24px}.notes{margin-top:18px;font-size:12px}.signatures{display:grid;grid-template-columns:1fr 1fr 1fr;gap:28px;margin-top:58px}.sig{border-top:1px solid #475569;padding-top:6px;text-align:center;font-size:11px;color:#475569}@media print{body{margin:14mm}}
      </style></head><body><div class="top"><div><h1>${isExpense ? "Expense Payment Voucher" : "General Cash / Bank Voucher"}</h1><div>${isExpense ? "خرچ ادائیگی واؤچر" : "عمومی کیش / بینک واؤچر"}</div></div><div style="text-align:right"><strong>${voucher.entry_no}</strong><br>${voucher.date}</div></div>
      <div class="grid"><div><div class="label">Transaction Type / قسم</div><div class="value">${voucher.transaction_label}</div></div><div><div class="label">${partyLabel}</div><div class="value">${voucher.party_name || "—"}</div></div><div><div class="label">Transaction Account / اکاؤنٹ</div><div class="value">${stripAccountCode(voucher.counter_account)}</div></div><div><div class="label">Paid From / Cash-Bank</div><div class="value">${stripAccountCode(voucher.cash_bank_account)}</div></div><div><div class="label">Reference / حوالہ</div><div class="value">${voucher.reference || "—"}</div></div></div>
      <div class="amount"><span>Amount / رقم</span><strong>Rs. ${money(voucher.amount)}</strong></div>${voucher.notes ? `<div class="notes"><strong>Notes:</strong> ${voucher.notes}</div>` : ""}<div class="signatures"><div class="sig">Prepared By</div><div class="sig">Approved By</div><div class="sig">Received By</div></div></body></html>`);
    popup.document.close(); popup.focus(); setTimeout(() => popup.print(), 250);
  };

  const downloadPdf = (voucher: PostedVoucher) => {
    const pdf = new jsPDF();
    const isExpense = voucher.transaction_label.toLowerCase().includes("expense payment");
    pdf.setFontSize(18); pdf.text(isExpense ? "Expense Payment Voucher" : "General Cash / Bank Voucher", 15, 18);
    pdf.setFontSize(10);
    pdf.text(`Voucher: ${voucher.entry_no}`, 15, 30); pdf.text(`Date: ${voucher.date}`, 15, 37); pdf.text(`Type: ${voucher.transaction_label}`, 15, 44);
    pdf.text(`${isExpense ? "Paid To" : "Party / Name"}: ${voucher.party_name || "—"}`, 15, 51);
    pdf.text(`Transaction Account: ${stripAccountCode(voucher.counter_account)}`, 15, 58); pdf.text(`Paid From: ${stripAccountCode(voucher.cash_bank_account)}`, 15, 65); pdf.text(`Reference: ${voucher.reference || "—"}`, 15, 72);
    pdf.setFontSize(15); pdf.text(`Amount: Rs. ${money(voucher.amount)}`, 15, 88);
    if (voucher.notes) { pdf.setFontSize(9); pdf.text(`Notes: ${voucher.notes}`, 15, 102, { maxWidth: 175 }); }
    pdf.save(`${voucher.entry_no}-${isExpense ? "Expense-Payment" : "General-Cash-Bank"}.pdf`);
  };

  const reprintHistory = async (row: Voucher, asPdf = false) => {
    setError(null);
    try {
      const { data: lines, error: linesError } = await supabase.from("journal_lines").select("account,debit,credit").eq("entry_id", row.id);
      if (linesError) throw linesError;
      const debitLine = (lines || []).find((line: any) => Number(line.debit || 0) > 0);
      const creditLine = (lines || []).find((line: any) => Number(line.credit || 0) > 0);
      const amountNumber = Math.max(Number(debitLine?.debit || 0), Number(creditLine?.credit || 0));
      const description = row.description || "General Cash / Bank";
      const isCashBankText = (text: unknown) => { const v = String(text || "").toLowerCase(); return v.includes("cash") || v.includes("bank"); };
      const voucher: PostedVoucher = {
        entry_no: row.entry_no,
        journal_entry_id: row.id,
        transaction_label: description.split(" - ")[0],
        date: row.entry_date,
        party_name: row.party_name || "",
        counter_account: stripAccountCode(debitLine?.account && !isCashBankText(debitLine.account) ? debitLine.account : creditLine?.account || "—"),
        cash_bank_account: stripAccountCode([debitLine, creditLine].find((line: any) => isCashBankText(line?.account))?.account || "Cash / Bank"),
        amount: amountNumber,
        reference: "",
        notes: description,
      };
      if (asPdf) downloadPdf(voucher); else printVoucher(voucher);
    } catch (err: any) { setError(err?.message || "Failed to open voucher."); }
  };

  if (loading) return <div className="mt-4 flex min-h-[250px] items-center justify-center"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading General Cash / Bank...</div>;

  return <div className="mt-4 space-y-5">
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {success && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700"><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{success}</span>{lastVoucher && <div className="flex gap-2"><button type="button" data-direct-print onClick={() => printVoucher(lastVoucher)} className="btn-secondary inline-flex items-center gap-2 text-xs"><Printer className="h-4 w-4" />Print / پرنٹ</button><button type="button" onClick={() => downloadPdf(lastVoucher)} className="btn-secondary inline-flex items-center gap-2 text-xs"><FileDown className="h-4 w-4" />PDF</button></div>}</div>}

    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold text-slate-900">General Cash / Bank Transaction / عمومی کیش بینک لین دین</h2><p className="mt-1 text-xs text-slate-500">Salary, expenses, loans, capital and other receipts/payments with automatic accounting.</p></div>
      <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
        <div><label className="mb-1.5 block text-xs font-semibold">Transaction Type / لین دین قسم</label><SearchableSelect value={transactionType} onChange={(e) => setTransactionType(e.target.value as TransactionType)} className="input w-full">{TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SearchableSelect></div>
        <div><label className="mb-1.5 block text-xs font-semibold">Date / تاریخ</label><input type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} className="input w-full" /></div>
        <div className="relative"><label className="mb-1.5 block text-xs font-semibold">{selectedType.partyLabel}</label>
          {transactionType === "salary_payment" ? <><div className="flex gap-2"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={employeeSearch} onFocus={() => setShowEmployeeResults(true)} onChange={(e) => { setEmployeeSearch(e.target.value); setPartyName(""); setShowEmployeeResults(true); }} placeholder="Search employee / ملازم تلاش کریں" className="input w-full pl-9" autoComplete="off" />{showEmployeeResults && <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl">{filteredEmployees.length ? filteredEmployees.map((employee) => <button key={employee.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setPartyName(employee.name); setEmployeeSearch(employee.name); setShowEmployeeResults(false); }} className="block w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-emerald-50"><div className="flex items-center justify-between gap-3"><div className="font-semibold text-slate-900">{employee.name}</div>{employee.employee_code && <span className="rounded bg-slate-100 px-2 py-0.5 text-[12px] font-bold text-slate-600">{employee.employee_code}</span>}</div><div className="mt-1 text-[12px] text-slate-500">{[employee.designation, employee.department, employee.phone].filter(Boolean).join(" • ") || "Employee / ملازم"}</div></button>) : <div className="px-3 py-4 text-center text-xs text-slate-500">No employee found / کوئی ملازم نہیں ملا</div>}<button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setNewEmployeeName(employeeSearch.trim()); setShowEmployeeResults(false); setShowAddEmployee(true); }} className="block w-full bg-emerald-50 px-3 py-2.5 text-left text-xs font-bold text-emerald-700 hover:bg-emerald-100">+ Add New Employee / نیا ملازم شامل کریں</button></div>}</div><button type="button" onClick={() => { setNewEmployeeName(employeeSearch.trim()); setShowAddEmployee(true); setShowEmployeeResults(false); }} className="btn-secondary whitespace-nowrap px-3 text-xs">+ Add</button></div>{partyName && <div className="mt-1 text-[12px] font-semibold text-emerald-700">Selected: {partyName}</div>}</> : <><input list="general-cash-party-suggestions" value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder={transactionType === "expense_payment" ? "Search supplier, transporter, employee or type a name..." : "Search or type name..."} className="input w-full" autoComplete="off" /><datalist id="general-cash-party-suggestions">{partySuggestions.map((party) => <option key={`${party.source}-${party.id}`} value={party.name}>{party.source}</option>)}</datalist>{transactionType === "expense_payment" && <div className="mt-1 text-[11px] text-slate-500">Search existing Supplier / Transporter / Employee, or type another payee name.</div>}</>}
        </div>
        <div><label className="mb-1.5 block text-xs font-semibold">{transactionType === "salary_payment" ? "Salary Expense Account / تنخواہ خرچ اکاؤنٹ" : "Transaction Account / لین دین اکاؤنٹ"}</label><SearchableSelect value={counterAccountId} onChange={(e) => setCounterAccountId(e.target.value)} className="input w-full" aria-label="Transaction Account"><option value="">Select account...</option>{counterAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</SearchableSelect></div>
        <div><label className="mb-1.5 block text-xs font-semibold">Cash / Bank Account / کیش بینک اکاؤنٹ</label><SearchableSelect value={cashBankAccountId} onChange={(e) => setCashBankAccountId(e.target.value)} className="input w-full" aria-label="Cash Bank Account"><option value="">Select cash/bank...</option>{cashBankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</SearchableSelect></div>
        <div><label className="mb-1.5 block text-xs font-semibold">Amount / رقم</label><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="input w-full" /></div>
        <div><label className="mb-1.5 block text-xs font-semibold">Reference / حوالہ</label><input value={reference} onChange={(e) => setReference(e.target.value)} className="input w-full" /></div>
        <div className="md:col-span-2"><label className="mb-1.5 block text-xs font-semibold">Notes / تفصیل</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className="input w-full" /></div>
        <div className="flex items-end"><button type="button" disabled={saving} onClick={() => void post()} className="btn-primary inline-flex w-full items-center justify-center gap-2">{saving ? <><Loader2 className="h-4 w-4 animate-spin" />Posting...</> : <><CheckCircle2 className="h-4 w-4" />Post Transaction / پوسٹ کریں</>}</button></div>
      </div>
    </section>

    {showAddEmployee && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-xl rounded-xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h3 className="font-bold text-slate-900">Add Employee / ملازم شامل کریں</h3><p className="mt-1 text-xs text-slate-500">Employee will become searchable immediately.</p></div><div className="grid gap-4 p-5 md:grid-cols-2"><div><label className="mb-1 block text-xs font-semibold">Employee Code / کوڈ</label><input value={newEmployeeCode} onChange={(e) => setNewEmployeeCode(e.target.value)} className="input w-full" placeholder="EMP-001" /></div><div><label className="mb-1 block text-xs font-semibold">Employee Name / ملازم نام *</label><input value={newEmployeeName} onChange={(e) => setNewEmployeeName(e.target.value)} className="input w-full" /></div><div><label className="mb-1 block text-xs font-semibold">Phone / فون</label><input value={newEmployeePhone} onChange={(e) => setNewEmployeePhone(e.target.value)} className="input w-full" /></div><div><label className="mb-1 block text-xs font-semibold">Designation / عہدہ</label><input value={newEmployeeDesignation} onChange={(e) => setNewEmployeeDesignation(e.target.value)} className="input w-full" placeholder="Operator, Manager..." /></div><div className="md:col-span-2"><label className="mb-1 block text-xs font-semibold">Department / شعبہ</label><input value={newEmployeeDepartment} onChange={(e) => setNewEmployeeDepartment(e.target.value)} className="input w-full" /></div></div><div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={() => setShowAddEmployee(false)} disabled={savingEmployee} className="btn-secondary">Cancel / منسوخ</button><button type="button" onClick={() => void addEmployee()} disabled={savingEmployee} className="btn-primary inline-flex items-center gap-2">{savingEmployee && <Loader2 className="h-4 w-4 animate-spin" />}Save Employee / محفوظ کریں</button></div></div></div>}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between"><div><h3 className="font-bold">General Transaction History / عمومی لین دین ہسٹری</h3><p className="mt-1 text-xs text-slate-500">Search, reprint and download posted vouchers.</p></div><div className="flex gap-2"><div className="relative min-w-[280px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search voucher, name, date..." className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs" /></div><button type="button" onClick={() => void load()} className="btn-secondary inline-flex items-center gap-2 text-xs"><RefreshCw className="h-4 w-4" />Refresh</button></div></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-xs"><thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left">Voucher</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Party / Name</th><th className="px-4 py-3 text-left">Description</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredHistory.length ? filteredHistory.map((row) => <tr key={row.id}><td className="px-4 py-3 font-bold">{row.entry_no}</td><td className="px-4 py-3">{row.entry_date}</td><td className="px-4 py-3">{row.party_name || "—"}</td><td className="px-4 py-3">{row.description || "—"}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" data-direct-print onClick={() => void reprintHistory(row, false)} className="btn-secondary inline-flex items-center gap-1 text-xs"><Printer className="h-3.5 w-3.5" />Print</button><button type="button" onClick={() => void reprintHistory(row, true)} className="btn-secondary inline-flex items-center gap-1 text-xs"><FileDown className="h-3.5 w-3.5" />PDF</button></div></td></tr>) : <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No transactions found.</td></tr>}</tbody></table></div></section>
  </div>;
}
