import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

import Login from "@/auth/Login";
import ProtectedRoute from "@/auth/ProtectedRoute";
import Layout from "@/components/Layout";

import Dashboard from "@/modules/Dashboard";
import MasterData from "@/modules/master-data/MasterData";
import SalesInvoiceList from "@/modules/sales/SalesInvoiceList";
import SalesInvoiceCreate from "@/modules/sales/SalesInvoiceCreate";
import SalesInvoiceDetail from "@/modules/sales/SalesInvoiceDetail";
import SalespersonReport from "@/modules/sales/SalespersonReport";
import ChargeMaster from "@/modules/sales/ChargeMaster";
import Purchase from "@/modules/purchase/Purchase";
import Godown from "@/modules/master-data/Godown";
import Production from "@/modules/production/Production";
import Cutting from "@/modules/cutting/Cutting";
import Accounting from "@/modules/accounting/Accounting";
import CustomerInvoiceStatement from "@/modules/accounting/CustomerInvoiceStatement";
import Settings from "@/modules/settings/Settings";
import Reports from "@/modules/reports/Reports";
import ConsolidatedInvoices from "@/modules/sales/ConsolidatedInvoices";
import OwnerPanel from "@/modules/platform/OwnerPanel";

function OwnerOnly() {
  const { isPlatformOwner } = useAuth();
  return isPlatformOwner ? <OwnerPanel /> : <Navigate to="/" replace />;
}

export default function App() {
  const { loading, accountingSetupError, retryAccountingSetup, signOut } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-slate-400">Loading… / لوڈ ہو رہا ہے…</div></div>;
  }

  if (accountingSetupError) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12">
        <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">Accounting setup could not be completed</h1>
          <p className="mt-2 text-sm text-slate-600">ERP access is paused so transactions cannot be posted without a complete Chart of Accounts.</p>
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{accountingSetupError}</div>
          <div className="mt-5 flex gap-3">
            <button type="button" className="btn-primary" onClick={retryAccountingSetup}>Retry accounting setup</button>
            <button type="button" className="btn" onClick={() => void signOut()}>Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<ProtectedRoute><Layout><Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/owner" element={<OwnerOnly />} />
        <Route path="/master-data/*" element={<MasterData />} />
        <Route path="/sales" element={<SalesInvoiceList />} />
        <Route path="/sales/new" element={<SalesInvoiceCreate />} />
        <Route path="/sales/:id/edit" element={<SalesInvoiceCreate />} />
        <Route path="/sales/report" element={<SalespersonReport />} />
        <Route path="/sales/charges" element={<ChargeMaster />} />
        <Route path="/sales/consolidated" element={<ConsolidatedInvoices />} />
        <Route path="/sales/:id" element={<SalesInvoiceDetail />} />
        <Route path="/purchase/*" element={<Purchase />} />
        <Route path="/godown/*" element={<Godown />} />
        <Route path="/production/*" element={<Production />} />
        <Route path="/cutting/*" element={<Cutting />} />
        <Route path="/accounting/customer-invoice-statement" element={<CustomerInvoiceStatement />} />
        <Route path="/accounting/*" element={<Accounting />} />
        <Route path="/reports/*" element={<Reports />} />
        <Route path="/settings/*" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes></Layout></ProtectedRoute>} />
    </Routes>
  );
}
