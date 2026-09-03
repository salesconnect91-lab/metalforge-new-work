import { Routes, Route } from "react-router-dom";
import CuttingOrderList from "./CuttingOrderList";
import CuttingOrderDetail from "./CuttingOrderDetail";
import LoadingUnloading from "./LoadingUnloading";

export default function Cutting() {
  return (
    <div className="space-y-4">
      <Routes>
        <Route path="/" element={<CuttingOrderList />} />
        <Route path="/gate-pass" element={<LoadingUnloading />} />
        <Route path="/:id" element={<CuttingOrderDetail />} />
      </Routes>
    </div>
  );
}
