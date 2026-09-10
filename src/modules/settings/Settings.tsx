import { NavLink, Routes, Route } from "react-router-dom";
import CompanySettings from "./CompanySettings";
import TaxSettings from "./TaxSettings";
import DocumentPrintSettings from "./DocumentPrintSettings";
import OrderBookSettings from "./OrderBookSettings";
import GatePassWeighbridgeSettings from "./GatePassWeighbridgeSettings";

const tabs = [
  { to: "/settings", label: "Company / کمپنی", end: true },
  { to: "/settings/tax", label: "Tax / ٹیکس" },
  { to: "/settings/documents", label: "Document & Print / ڈاکومنٹ و پرنٹ" },
  { to: "/settings/order-book", label: "Order Book / آرڈر بک" },
  { to: "/settings/gate-pass", label: "Gate Pass & Weighbridge / گیٹ پاس و کانٹا" },
];

export default function Settings() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm" data-no-print>
        {tabs.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `rounded-lg px-3 py-2 text-xs font-bold transition ${isActive ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-blue-700"}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Routes>
        <Route path="/" element={<CompanySettings />} />
        <Route path="/tax" element={<TaxSettings />} />
        <Route path="/documents" element={<DocumentPrintSettings />} />
        <Route path="/order-book" element={<OrderBookSettings />} />
        <Route path="/gate-pass" element={<GatePassWeighbridgeSettings />} />
      </Routes>
    </div>
  );
}
