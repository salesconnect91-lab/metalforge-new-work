import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Columns3, FileSpreadsheet, FileText, Printer, Settings2, X } from "lucide-react";
import { exportDomReportToCSV, exportDomReportToExcel, exportDomReportToWord, triggerPrint } from "@/lib/exportUtils";
import { loadDocumentPrintSettings } from "@/lib/documentPrintSettings";

type ReportSurfaceProps = { children: ReactNode };
type ColumnChoice = { index: number; label: string; visible: boolean };
type Density = "compact" | "standard";
type Orientation = "portrait" | "landscape";
type SavedPrefs = { hiddenLabels?: string[]; density?: Density; orientation?: Orientation; showTotals?: boolean; showFilters?: boolean };

function safeName(value: string) { return (value || "report").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "report"; }

export default function ReportSurface({ children }: ReportSurfaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [columns, setColumns] = useState<ColumnChoice[]>([]);
  const [density, setDensity] = useState<Density>("compact");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [showTotals, setShowTotals] = useState(true);
  const [showFilters, setShowFilters] = useState(true);
  const [nativeExport, setNativeExport] = useState(false);
  const storageKey = useMemo(() => `navilo:report-prefs:${window.location.pathname}`, []);

  useEffect(() => {
    void loadDocumentPrintSettings("reports").catch(() => undefined);
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}") as SavedPrefs;
      if (saved.density) setDensity(saved.density);
      if (saved.orientation) setOrientation(saved.orientation);
      if (typeof saved.showTotals === "boolean") setShowTotals(saved.showTotals);
      if (typeof saved.showFilters === "boolean") setShowFilters(saved.showFilters);
    } catch { /* ignore */ }
  }, [storageKey]);

  const reportContent = useCallback(() => rootRef.current?.querySelector<HTMLElement>("[data-report-content]") ?? rootRef.current, []);
  const savedHiddenLabels = useCallback(() => { try { return new Set(((JSON.parse(localStorage.getItem(storageKey) || "{}") as SavedPrefs).hiddenLabels || [])); } catch { return new Set<string>(); } }, [storageKey]);

  const scanColumns = useCallback(() => {
    const root = reportContent();
    setNativeExport(Boolean(root?.querySelector("[data-native-export]")));
    const table = root?.querySelector("table");
    if (!table) { setColumns([]); return; }
    const hiddenLabels = savedHiddenLabels();
    const headers = Array.from(table.querySelectorAll("thead th"));
    setColumns(prev => headers.map((cell, index) => { const label = (cell.textContent || `Column ${index + 1}`).trim(); const existing = prev.find(item => item.label === label); return { index, label, visible: existing?.visible ?? !hiddenLabels.has(label) }; }));
  }, [reportContent, savedHiddenLabels]);

  useEffect(() => {
    scanColumns();
    const root = reportContent(); if (!root) return;
    const observer = new MutationObserver(scanColumns); observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [reportContent, scanColumns]);

  useEffect(() => {
    const root = reportContent(); if (!root) return;
    const hidden = new Set(columns.filter(column => !column.visible).map(column => column.index));
    root.querySelectorAll("table").forEach(table => table.querySelectorAll("tr").forEach(row => Array.from(row.children).forEach((cell, index) => { (cell as HTMLElement).style.display = hidden.has(index) ? "none" : ""; })));
    root.querySelectorAll<HTMLElement>("tfoot,[data-report-total],.report-total-row").forEach(el => { el.style.display = showTotals ? "" : "none"; });
    root.querySelectorAll<HTMLElement>("[data-report-filters]").forEach(el => { el.style.display = showFilters ? "" : "none"; });
    root.dataset.reportDensity = density; root.dataset.reportOrientation = orientation;
    try { const prefs: SavedPrefs = { hiddenLabels: columns.filter(c => !c.visible).map(c => c.label), density, orientation, showTotals, showFilters }; localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch { /* ignore */ }
  }, [columns, density, orientation, reportContent, showFilters, showTotals, storageKey]);

  const fileBase = () => safeName(document.title || window.location.pathname.split("/").filter(Boolean).pop() || "NAVILO_Report");
  const title = () => document.querySelector<HTMLElement>("main h1,main h2")?.textContent?.replace(/\s+/g, " ").trim() || document.title || "NAVILO Report";
  const withRoot = (fn: (root: HTMLElement) => void) => { const root = reportContent(); if (root) fn(root); };
  const exportExcel = () => withRoot(root => exportDomReportToExcel(fileBase(), root, title(), { includeTotals: showTotals, includeFilters: true }));
  const exportCsv = () => withRoot(root => exportDomReportToCSV(fileBase(), root, title(), { includeTotals: showTotals, includeFilters: true }));
  const exportWord = () => withRoot(root => exportDomReportToWord(fileBase(), root, title(), { includeTotals: showTotals, includeFilters: true }));
  const allVisible = columns.every(column => column.visible);
  const reset = () => { setColumns(list => list.map(item => ({ ...item, visible: true }))); setDensity("compact"); setOrientation("landscape"); setShowTotals(true); setShowFilters(true); };

  return <div ref={rootRef} className="professional-report print-report" data-report-root>
    <style>{`[data-report-content][data-report-density="compact"] table th,[data-report-content][data-report-density="compact"] table td{padding-top:4px!important;padding-bottom:4px!important;font-size:11px!important}@media print{@page{size:A4 ${orientation};margin:10mm}[data-report-content][data-report-density="compact"] table th,[data-report-content][data-report-density="compact"] table td{padding:3px 5px!important;font-size:9.5px!important}}`}</style>
    <div className="no-print mb-3 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm" data-no-print>
      {columns.length > 0 && <div className="relative"><button type="button" className="btn-secondary" onClick={() => setColumnsOpen(value => !value)}><Columns3 className="h-4 w-4"/> Customize Columns</button>{columnsOpen && <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"><div className="mb-2 flex items-center justify-between"><div className="text-xs font-bold text-slate-800">Show / Hide Columns</div><button type="button" aria-label="Close column settings" onClick={() => setColumnsOpen(false)}><X className="h-4 w-4"/></button></div><div className="max-h-72 space-y-1 overflow-y-auto">{columns.map(column => <label key={`${column.index}-${column.label}`} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-50"><input type="checkbox" checked={column.visible} onChange={() => setColumns(list => list.map(item => item.index === column.index ? { ...item, visible: !item.visible } : item))}/><span className="min-w-0 truncate">{column.label}</span></label>)}</div><div className="mt-2 grid grid-cols-2 gap-2">{!allVisible && <button type="button" className="btn-secondary" onClick={() => setColumns(list => list.map(item => ({ ...item, visible: true })))}>Show All</button>}<button type="button" className="btn-secondary" onClick={reset}>Reset</button></div></div>}</div>}
      <div className="relative"><button type="button" className="btn-secondary" onClick={() => setPrintOpen(v => !v)}><Settings2 className="h-4 w-4"/> Print Options</button>{printOpen && <div className="absolute right-0 z-40 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl"><div className="mb-2 flex items-center justify-between"><strong>Print Settings</strong><button type="button" aria-label="Close print settings" onClick={() => setPrintOpen(false)}><X className="h-4 w-4"/></button></div><label className="block">Density<select className="input mt-1 w-full" value={density} onChange={e => setDensity(e.target.value as Density)}><option value="compact">Compact</option><option value="standard">Standard</option></select></label><label className="mt-2 block">Orientation<select className="input mt-1 w-full" value={orientation} onChange={e => setOrientation(e.target.value as Orientation)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label><label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={showTotals} onChange={e => setShowTotals(e.target.checked)}/> Include totals</label><label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={showFilters} onChange={e => setShowFilters(e.target.checked)}/> Include applied filters in print</label><p className="mt-2 text-[10px] text-slate-500">Excel/CSV/Word always keep the applied filter context and complete report columns. Column hiding only changes screen/print presentation.</p></div>}</div>
      {!nativeExport && <><button type="button" className="btn-secondary" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4"/> Excel</button><button type="button" className="btn-secondary" onClick={exportCsv}>CSV</button><button type="button" className="btn-secondary" onClick={exportWord}><FileText className="h-4 w-4"/> Word</button><button type="button" className="btn-primary" onClick={() => triggerPrint("[data-report-content]")}><Printer className="h-4 w-4"/> Print / PDF</button></>}
    </div>
    <div data-report-content className="report-print-content" data-report-density={density} data-report-orientation={orientation}>{children}</div>
  </div>;
}
