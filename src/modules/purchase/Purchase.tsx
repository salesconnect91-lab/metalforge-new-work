import { Routes, Route } from "react-router-dom";
import PurchaseOrderList from "./PurchaseOrderList";
import MainPurchaseInvoice from "./MainPurchaseInvoice";
import ConsolidatedPurchaseInvoices from "./ConsolidatedPurchaseInvoices";
import PurchaseInvoiceDetail from "./PurchaseInvoiceDetail";

export default function Purchase() {
  return (
    <Routes>
      <Route path="/" element={<PurchaseOrderList />} />
      <Route path="/new" element={<MainPurchaseInvoice />} />
      <Route path="/consolidated" element={<ConsolidatedPurchaseInvoices />} />
      <Route path="/:id" element={<PurchaseInvoiceDetail />} />
    </Routes>
  );
}
