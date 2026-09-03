import { Routes, Route } from "react-router-dom";
import Items from "./Items";
import Customers from "./Customers";
import Suppliers from "./Suppliers";
import Warehouses from "./Warehouses";
import Uom from "./Uom";
import Transporters from "./Transporters";
import Employees from "./Employees";
import MasterRecordDetail from "./MasterRecordDetail";

export default function MasterData() {
  return (
    <div className="space-y-5 pb-12 max-w-7xl mx-auto font-sans">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Master Data Management / ماسٹر ڈیٹا مینجمنٹ</h1>
        <p className="text-xs text-slate-500 mt-0.5">Manage centralized ERP entities, raw materials, clients, units, and godowns. / مرکزی ERP ڈیٹا، خام مال، گاہک، اکائیاں اور گودام منظم کریں۔</p>
      </div>

      <Routes>
        <Route path="/" element={<Items />} />
        <Route path="/items/:id" element={<MasterRecordDetail entity="item" />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<MasterRecordDetail entity="customer" />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/suppliers/:id" element={<MasterRecordDetail entity="supplier" />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/warehouses" element={<Warehouses />} />
        <Route path="/uom" element={<Uom />} />
        <Route path="/transporters" element={<Transporters />} />
      </Routes>
    </div>
  );
}
