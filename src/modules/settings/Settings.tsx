import { Routes, Route } from "react-router-dom";
import CompanySettings from "./CompanySettings";
import TaxSettings from "./TaxSettings";
import DocumentPrintSettings from "./DocumentPrintSettings";
import OrderBookSettings from "./OrderBookSettings";

export default function Settings() {
  return (
    <div className="space-y-4">
      <Routes>
        <Route path="/" element={<CompanySettings />} />
        <Route path="/tax" element={<TaxSettings />} />
        <Route path="/documents" element={<DocumentPrintSettings />} />
        <Route path="/order-book" element={<OrderBookSettings />} />
      </Routes>
    </div>
  );
}
