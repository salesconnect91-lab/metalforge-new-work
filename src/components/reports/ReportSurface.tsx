import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Columns3, FileSpreadsheet, Printer, X } from "lucide-react";
import * as XLSX from "xlsx";
import { triggerPrint } from "@/lib/exportUtils";
import { loadDocumentPrintSettings } from "@/lib/documentPrintSettings";

type ReportSurfaceProps = { children: ReactNode };

type ColumnChoice = { index: number; label: string; visible: boolean };

function safeName(value: string) {
  return (value || "report").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "report";
}

export default function ReportSurface({ children }: ReportSurfaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [columns, setColumns] = useState<ColumnChoice[]>([]);

  useEffect(() => {
    void loadDocumentPrintSettings("reports").catch(() => undefined);
  }, []);

  const scanColumns = useCallback(() => {
    const root = rootRef.current;
    const table = root?.querySelector("table");
    if (!table) { setColumns([]); return; }
    const headers = Array.from(table.querySelectorAll("thead th"));
    setColumns(prev => headers.map((cell, index) => ({
      index,
      label: (cell.textContent || `Column ${index + 1}`).trim(),
      visible: prev.find(item => item.index === index)?.visible ?? true,
    })));
  }, []);

  useEffect(() => {
    scanColumns();
    const root = rootRef.current;
    if (!root) return;
    const observer = new MutationObserver(() => scanColumns());
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [scanColumns]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const hidden = new Set(columns.filter(column => !column.visible).map(column => column.index));
    root.querySelectorAll("table").forEach(table => {
      table.querySelectorAll("tr").forEach(row => {
        Array.from(row.children).forEach((cell, index) => {
          (cell as HTMLElement).style.display = hidden.has(index) ? "none" : "";
        });
      });
    });
  }, [columns]);

  const exportExcel = () => {
    const root = rootRef.current;
    const table = root?.querySelector("table");
    if (!table) return;
    const hidden = new Set(columns.filter(column => !column.visible).map(column => column.index));
    const rows = Array.from(table.querySelectorAll("tr")).map(row =>
      Array.from(row.children)
        .filter((_cell, index) => !hidden.has(index))
        .map(cell => (cell.textContent || "").trim())
    ).filter(row => row.some(value => value !== ""));
    if (!rows.length) return;
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = rows[0].map((_value, index) => ({ wch: Math.min(36, Math.max(12, ...rows.map(row => String(row[index] || "").length + 2))) }));
    ws["!autofilter"] = ws["!ref"] ? { ref: ws["!ref"] } : undefined;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${safeName(document.title)}.xlsx`, { compression: true });
  };

  const allVisible = columns.every(column => column.visible);

  return <div ref={rootRef} className="professional-report print-report" data-report-root>
    <div className="no-print mb-3 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm" data-no-print>
      {columns.length > 0 && <div className="relative">
        <button type="button" className="btn-secondary" onClick={() => setColumnsOpen(value => !value)}><Columns3 className="h-4 w-4"/> Customize Columns</button>
        {columnsOpen && <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between"><div className="text-xs font-bold text-slate-800">Show / Hide Columns</div><button type="button" onClick={() => setColumnsOpen(false)}><X className="h-4 w-4"/></button></div>
          <div className="max-h-72 space-y-1 overflow-y-auto">{columns.map(column => <label key={column.index} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-50"><input type="checkbox" checked={column.visible} onChange={() => setColumns(list => list.map(item => item.index === column.index ? { ...item, visible: !item.visible } : item))}/><span className="min-w-0 truncate">{column.label}</span></label>)}</div>
          {!allVisible && <button type="button" className="btn-secondary mt-2 w-full" onClick={() => setColumns(list => list.map(item => ({ ...item, visible: true })))}>Show All Columns</button>}
        </div>}
      </div>}
      <button type="button" className="btn-secondary" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4"/> Export Excel</button>
      <button type="button" className="btn-secondary" onClick={() => triggerPrint("[data-report-root]")}><Printer className="h-4 w-4"/> Print Preview / PDF</button>
    </div>
    {children}
  </div>;
}
