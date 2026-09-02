import { Routes, Route, NavLink } from "react-router-dom";
import JournalEntryList from "./JournalEntryList";
import JournalEntryDetail from "./JournalEntryDetail";
import ChartOfAccounts from "./ChartOfAccounts";
import Ledgers from "./Ledgers";
import DayBook from "./DayBook";
import TrialBalance from "./TrialBalance";
import ProfitLoss from "./ProfitLoss";
import BalanceSheet from "./BalanceSheet";
import AuditTrail from "./AuditTrail";
import CashCounter from "./CashCounter";
import AccountMappingSetup from "./AccountMappingSetup";
import AccountingPeriods from "./AccountingPeriods";
import ReturnNotes from "./ReturnNotes";
import BankReconciliation from "./BankReconciliation";
import FiscalYearClosing from "./FiscalYearClosing";
import CashFlowStatement from "./CashFlowStatement";
import FinancialControls from "./FinancialControls";

export default function Accounting() {
  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-slate-200 overflow-x-auto">
        <TabLink to="/accounting" end label="Journal Entries / جرنل اندراجات" />
        <TabLink to="/accounting/cash-counter" label="Cash Counter / کیش کاؤنٹر" />
        <TabLink to="/accounting/day-book" label="Day Book / روزنامچہ" />
        <TabLink to="/accounting/accounts" label="Chart of Accounts / چارٹ آف اکاؤنٹس" />
        <TabLink to="/accounting/mappings" label="Account Mapping / اکاؤنٹ میپنگ" />
        <TabLink to="/accounting/periods" label="Period Closing / پیریڈ کلوزنگ" />
        <TabLink to="/accounting/returns" label="Credit / Debit Notes" />
        <TabLink to="/accounting/bank-reconciliation" label="Bank Reconciliation" />
        <TabLink to="/accounting/year-closing" label="Year Closing" />
        <TabLink to="/accounting/cash-flow" label="Cash Flow" />
        <TabLink to="/accounting/controls" label="Financial Controls" />
        <TabLink to="/accounting/ledgers" label="Ledgers / لیجرز" />
        <TabLink to="/accounting/trial-balance" label="Trial Balance / ٹرائل بیلنس" />
        <TabLink to="/accounting/profit-loss" label="Profit & Loss / نفع و نقصان" />
        <TabLink to="/accounting/balance-sheet" label="Balance Sheet / بیلنس شیٹ" />
        <TabLink to="/accounting/audit-trail" label="Audit Trail / آڈٹ ٹریل" /> {/* <-- Audit Trail tab add kiya */}
      </div>
      <Routes>
        <Route path="/" element={<JournalEntryList />} />
        <Route path="/cash-counter" element={<CashCounter />} />
        <Route path="/day-book" element={<DayBook />} />
        <Route path="/accounts" element={<ChartOfAccounts />} />
        <Route path="/mappings" element={<AccountMappingSetup />} />
        <Route path="/periods" element={<AccountingPeriods />} />
        <Route path="/returns" element={<ReturnNotes />} />
        <Route path="/bank-reconciliation" element={<BankReconciliation />} />
        <Route path="/year-closing" element={<FiscalYearClosing />} />
        <Route path="/cash-flow" element={<CashFlowStatement />} />
        <Route path="/controls" element={<FinancialControls />} />
        <Route path="/ledgers" element={<Ledgers />} />
        <Route path="/trial-balance" element={<TrialBalance />} />
        <Route path="/profit-loss" element={<ProfitLoss />} />
        <Route path="/balance-sheet" element={<BalanceSheet />} />
        <Route path="/audit-trail" element={<AuditTrail />} /> {/* <-- Audit Trail route add kiya */}
        <Route path="/:id" element={<JournalEntryDetail />} />
      </Routes>
    </div>
  );
}

function TabLink({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <span
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap inline-block ${
            isActive ? "border-primary-600 text-primary-600" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          {label}
        </span>
      )}
    </NavLink>
  );
}
