import { Routes, Route, NavLink } from "react-router-dom";
import WorkOrderList from "./WorkOrderList";
import WorkOrderDetail from "./WorkOrderDetail";
import FurnaceYield from "./FurnaceYield";

export default function Production() {
  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <TabLink to="/production" end label="Work Orders / ورک آرڈرز" />
        <TabLink to="/production/yields" label="Furnace Yield / فرنس پیداوار" />
      </div>
      <Routes>
        <Route path="/" element={<WorkOrderList />} />
        <Route path="/yields" element={<FurnaceYield />} />
        <Route path="/:id" element={<WorkOrderDetail />} />
      </Routes>
    </div>
  );
}

function TabLink({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <span
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
            isActive ? "border-primary-600 text-primary-600" : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          {label}
        </span>
      )}
    </NavLink>
  );
}
