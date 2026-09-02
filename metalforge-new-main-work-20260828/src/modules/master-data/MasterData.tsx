import { Routes, Route, NavLink } from "react-router-dom";
import Items from "./Items";
import Customers from "./Customers";
import Suppliers from "./Suppliers";
import Warehouses from "./Warehouses";
import Uom from "./Uom";
import Transporters from "./Transporters";
import Employees from "./Employees";

export default function MasterData() {
  return (
    <div className="space-y-5 pb-12 max-w-7xl mx-auto font-sans">
      
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Master Data Management / ماسٹر ڈیٹا مینجمنٹ</h1>
        <p className="text-xs text-slate-500 mt-0.5">Manage centralized ERP entities, raw materials, clients, units, and godowns. / مرکزی ERP ڈیٹا، خام مال، گاہک، اکائیاں اور گودام منظم کریں۔</p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 border-b border-slate-200">
        <TabLink to="/master-data" end label="Items / آئٹمز" />
        <TabLink to="/master-data/customers" label="Customers / گاہک" />
        <TabLink to="/master-data/suppliers" label="Suppliers / سپلائرز" />
        <TabLink to="/master-data/employees" label="Employees / ملازمین" />
        <TabLink to="/master-data/warehouses" label="Warehouses / ویئرہاؤسز" />
        <TabLink to="/master-data/uom" label="UoM / پیمائشی اکائی" />
        <TabLink to="/master-data/transporters" label="Transporters / ٹرانسپورٹرز" />
      </div>

      {/* Routes View */}
      <Routes>
        <Route path="/" element={<Items />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/warehouses" element={<Warehouses />} />
        <Route path="/uom" element={<Uom />} />
        <Route path="/transporters" element={<Transporters />} />
      </Routes>

    </div>
  );
}

function TabLink({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <span
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap cursor-pointer inline-block ${
            isActive ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          {label}
        </span>
      )}
    </NavLink>
  );
}
