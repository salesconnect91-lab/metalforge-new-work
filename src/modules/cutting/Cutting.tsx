import { Routes, Route, NavLink } from "react-router-dom";
import CuttingOrderList from "./CuttingOrderList";
import CuttingOrderDetail from "./CuttingOrderDetail";
import LoadingUnloading from "./LoadingUnloading";

export default function Cutting() {
  return (
    <div>
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <TabLink to="/cutting" end label="Cutting Orders / کٹنگ آرڈرز" />
        <TabLink to="/cutting/gate-pass" label="Gate Pass & Weighbridge / گیٹ پاس اور وزن کانٹا" />
      </div>
      <Routes>
        <Route path="/" element={<CuttingOrderList />} />
        <Route path="/gate-pass" element={<LoadingUnloading />} />
        <Route path="/:id" element={<CuttingOrderDetail />} />
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
