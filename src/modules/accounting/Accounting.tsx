import { Routes, Route } from "react-router-dom";
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
    <div className="space-y-4">
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
        <Route path="/audit-trail" element={<AuditTrail />} />
        <Route path="/:id" element={<JournalEntryDetail />} />
      </Routes>
    </div>
  );
}
