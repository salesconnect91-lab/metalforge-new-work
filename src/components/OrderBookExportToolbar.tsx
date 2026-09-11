import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { exportDomReportToCSV, exportDomReportToExcel, exportDomReportToWord, triggerPrint } from "@/lib/exportUtils";

export default function OrderBookExportToolbar({ fileBase }: { tableId?: string; fileBase: string }) {
  const root = () => document.getElementById("order-book-report");
  const title = () => document.querySelector<HTMLElement>("#order-book-report h1,#order-book-report h2")?.textContent?.replace(/\s+/g, " ").trim() || "NAVILO Order Book";
  return <div className="flex flex-wrap items-center gap-1.5 print:hidden">
    <button type="button" className="btn" onClick={() => triggerPrint("#order-book-report")} title="Print or Save as PDF"><Printer size={14}/> Print / PDF</button>
    <button type="button" className="btn" onClick={() => { const el=root(); if(el) exportDomReportToExcel(fileBase,el,title()); }}><FileSpreadsheet size={14}/> Excel</button>
    <button type="button" className="btn" onClick={() => { const el=root(); if(el) exportDomReportToCSV(fileBase,el,title()); }}><Download size={14}/> CSV</button>
    <button type="button" className="btn" onClick={() => { const el=root(); if(el) exportDomReportToWord(fileBase,el,title()); }}><FileText size={14}/> Word</button>
  </div>;
}
