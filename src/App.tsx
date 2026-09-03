import type { ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { canViewModule, type ModuleKey } from "@/auth/permissions";

import Login from "@/auth/Login";
import ProtectedRoute from "@/auth/ProtectedRoute";
import Layout from "@/components/Layout";
import CompanySwitcher from "@/components/CompanySwitcher";
import ErpExperienceBridge from "@/components/ErpExperienceBridge";
import PrintPreviewController from "@/components/PrintPreviewController";

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
import SteelStockControl from "@/modules/reports/SteelStockControl";
import ConsolidatedInvoices from "@/modules/sales/ConsolidatedInvoices";
import OwnerPanel from "@/modules/platform/OwnerPanel";

function OwnerOnly() {
  const { isPlatformOwner } = useAuth();
  return isPlatformOwner ? <OwnerPanel /> : <Navigate to="/" replace />;
}

function ModuleOnly({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const { isPlatformOwner, activeCompany } = useAuth();
  const allowed = canViewModule(activeCompany?.membership_role, module, isPlatformOwner);
  return allowed ? <>{children}</> : <Navigate to="/" replace />;
}

function GlobalExperience() {
  return <><ErpExperienceBridge /><PrintPreviewController /></>;
}

export default function App() {
  const { loading, accountingSetupError, retryAccountingSetup, signOut } = useAuth();

  if (loading) {
    return (
      <>
        <GlobalExperience />
        <div className="min-h-screen flex items-center justify-center"><div className="text-slate-400">Loading… / لوڈ ہو رہا ہے…</div></div>
      </>
    );
  }

  if (accountingSetupError) {
    return (
      <>
        <GlobalExperience />
        <div className="min-h-screen bg-slate-50 px-4 py-12">
          <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-bold text-slate-900">Accounting setup could not be completed / اکاؤنٹنگ سیٹ اپ مکمل نہیں ہو سکا</h1>
            <p className="mt-2 text-sm text-slate-600">ERP access is paused so transactions cannot be posted without a complete Chart of Accounts. / مکمل چارٹ آف اکاؤنٹس کے بغیر ٹرانزیکشن پوسٹ نہیں کی جا سکتی۔</p>
            <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{accountingSetupError}</div>
            <div className="mt-5 flex gap-3">
              <button type="button" className="btn-primary" onClick={retryAccountingSetup}>Retry accounting setup / دوبارہ اکاؤنٹنگ سیٹ اپ کریں</button>
              <button type="button" className="btn" onClick={() => void signOut()}>Sign out / لاگ آؤٹ</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <GlobalExperience />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedRoute><><CompanySwitcher /><Layout><Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/owner" element={<OwnerOnly />} />
          <Route path="/master-data/*" element={<ModuleOnly module="master"><MasterData /></ModuleOnly>} />
          <Route path="/sales" element={<ModuleOnly module="sales"><SalesInvoiceList /></ModuleOnly>} />
          <Route path="/sales/new" element={<ModuleOnly module="sales"><SalesInvoiceCreate /></ModuleOnly>} />
          <Route path="/sales/:id/edit" element={<ModuleOnly module="sales"><SalesInvoiceCreate /></ModuleOnly>} />
          <Route path="/sales/report" element={<ModuleOnly module="reports"><SalespersonReport /></ModuleOnly>} />
          <Route path="/sales/charges" element={<ModuleOnly module="master"><ChargeMaster /></ModuleOnly>} />
          <Route path="/sales/consolidated" element={<ModuleOnly module="sales"><ConsolidatedInvoices /></ModuleOnly>} />
          <Route path="/sales/:id" element={<ModuleOnly module="sales"><SalesInvoiceDetail /></ModuleOnly>} />
          <Route path="/purchase/*" element={<ModuleOnly module="purchase"><Purchase /></ModuleOnly>} />
          <Route path="/godown/*" element={<ModuleOnly module="inventory"><Godown /></ModuleOnly>} />
          <Route path="/production/*" element={<ModuleOnly module="production"><Production /></ModuleOnly>} />
          <Route path="/cutting/*" element={<ModuleOnly module="production"><Cutting /></ModuleOnly>} />
          <Route path="/accounting/customer-invoice-statement" element={<ModuleOnly module="accounting"><CustomerInvoiceStatement /></ModuleOnly>} />
          <Route path="/accounting/*" element={<ModuleOnly module="accounting"><Accounting /></ModuleOnly>} />
          <Route path="/reports/steel-stock" element={<ModuleOnly module="reports"><SteelStockControl /></ModuleOnly>} />
          <Route path="/reports/*" element={<ModuleOnly module="reports"><Reports /></ModuleOnly>} />
          <Route path="/settings/*" element={<ModuleOnly module="settings"><Settings /></ModuleOnly>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes></Layout></></ProtectedRoute>} />
      </Routes>
    </>
  );
}
