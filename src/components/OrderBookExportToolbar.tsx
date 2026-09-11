import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { exportMatrixToCSV, exportMatrixToExcel, exportMatrixToWord, triggerPrint } from "@/lib/exportUtils";

function tableData(table: HTMLTableElement) {
  const headers = [...table.tHead?.rows?.[0]?.cells || []].map((cell) => (cell.textContent || "").replace(/\s+/g, " ").trim());
  const rows = [...table.tBodies[0]?.rows || []].map((row) => [...row.cells].map((cell) => (cell.textContent || "").replace(/\s+/g, " ").trim()));
  return [headers, ...rows];
}

export default function OrderBookExportToolbar({ tableId, fileBase }: { tableId: string; fileBase: string }) {
  const matrix = () => {
    const table = document.getElementById(tableId) as HTMLTableElement | null;
    return table ? tableData(table) : [[]];
  };

  return <div className="flex flex-wrap items-center gap-1.5 print:hidden">
    <button type="button" className="btn" onClick={() => triggerPrint("#order-book-report")} title="Print or Save as PDF"><Printer size={14}/> Print / PDF</button>
    <button type="button" className="btn" onClick={() => exportMatrixToExcel(fileBase, matrix(), "Order Book")}><FileSpreadsheet size={14}/> Excel</button>
    <button type="button" className="btn" onClick={() => exportMatrixToCSV(fileBase, matrix())}><Download size={14}/> CSV</button>
    <button type="button" className="btn" onClick={() => exportMatrixToWord(fileBase, matrix(), "NAVILO Order Book")}><FileText size={14}/> Word</button>
  </div>;
}
