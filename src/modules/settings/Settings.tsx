import { NavLink, Routes, Route } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import CompanySettings from "./CompanySettings";
import TaxSettings from "./TaxSettings";
import DocumentPrintSettings from "./DocumentPrintSettings";
import OrderBookSettings from "./OrderBookSettings";
import GatePassWeighbridgeSettings from "./GatePassWeighbridgeSettings";
import AccessManagementSettings from "./AccessManagementSettings";

export default function Settings() {
  const { isPlatformOwner, activeCompany } = useAuth();
  const role = activeCompany?.membership_role;
  const canManageAccess = isPlatformOwner || role === "company_owner" || role === "admin";
  const tabClass = ({ isActive }: { isActive: boolean }) => `rounded-lg border px-3 py-2 text-xs font-semibold ${isActive ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <NavLink end to="/settings" className={tabClass}>Company</NavLink>
        {canManageAccess && <NavLink to="/settings/access" className={tabClass}>Users & Branches</NavLink>}
        <NavLink to="/settings/tax" className={tabClass}>Tax</NavLink>
        <NavLink to="/settings/documents" className={tabClass}>Document & Print</NavLink>
        <NavLink to="/settings/order-book" className={tabClass}>Order Book</NavLink>
        <NavLink to="/settings/gate-pass" className={tabClass}>Gate Pass</NavLink>
      </div>
      <Routes>
        <Route path="/" element={<CompanySettings />} />
        <Route path="/access" element={<AccessManagementSettings />} />
        <Route path="/tax" element={<TaxSettings />} />
        <Route path="/documents" element={<DocumentPrintSettings />} />
        <Route path="/order-book" element={<OrderBookSettings />} />
        <Route path="/gate-pass" element={<GatePassWeighbridgeSettings />} />
      </Routes>
    </div>
  );
}
