import { Routes, Route, Navigate } from "react-router-dom";

import SalesInvoiceList from "./SalesInvoiceList";
import SalesInvoiceCreate from "./SalesInvoiceCreate";
import SalesInvoiceDetail from "./SalesInvoiceDetail";
import SalespersonReport from "./SalespersonReport";
import ChargeMaster from "./ChargeMaster";
import ConsolidatedInvoices from "./ConsolidatedInvoices";

export default function Sales() {
  return (
    <Routes>
      {/* Sales Invoice List
          URL: /sales */}
      <Route
        index
        element={<SalesInvoiceList />}
      />

      {/* Create New Sales Invoice
          URL: /sales/new */}
      <Route
        path="new"
        element={<SalesInvoiceCreate />}
      />

      {/* Consolidated Customer Invoice
          URL: /sales/consolidated */}

      {/* Charge Master
          URL: /sales/charges */}
      <Route
        path="charges"
        element={<ChargeMaster />}
      />

      {/* Salesperson Report
          URL: /sales/report */}
      <Route
        path="report"
        element={<SalespersonReport />}
      />

      {/* Invoice Detail
          URL: /sales/:id */}
      <Route path="consolidated" element={<ConsolidatedInvoices />} />
      <Route
        path=":id"
        element={<SalesInvoiceDetail />}
      />

      {/* Unknown Sales URL → Sales Invoice List */}
      <Route
        path="*"
        element={<Navigate to="/sales" replace />}
      />
    </Routes>
  );
}