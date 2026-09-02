import { Routes, Route } from "react-router-dom";
import PurchaseOrderList from "./PurchaseOrderList";
import PurchaseOrderDetail from "./PurchaseOrderDetail";
import CreatePurchaseInvoice from "./CreatePurchaseInvoice";

export default function Purchase() {
  return (
    <Routes>
      <Route path="/" element={<PurchaseOrderList />} />
      <Route path="/new" element={<CreatePurchaseInvoice />} />
      <Route path="/:id" element={<PurchaseOrderDetail />} />
    </Routes>
  );
}
