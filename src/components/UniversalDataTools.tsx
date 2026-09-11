import { useCallback, useEffect, useMemo, useState } from "react";
import { Columns3, FileSpreadsheet, FileText, Printer, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { exportDomReportToCSV, exportDomReportToExcel, exportDomReportToWord, triggerPrint } from "@/lib/exportUtils";

type Col = { index: number; label: string; visible: boolean };
const clean = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
const safeName = (value: string) => (value || "NAVILO_Report").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "NAVILO_Report";

function pageRoot() { return document.querySelector<HTMLElement>("#navilo-main-content"); }
function buttonTexts(root: HTMLElement) { return Array.from(root.querySelectorAll<HTMLElement>("button,a")).map(el => clean(el.textContent).toLowerCase()); }
function hasCompleteNativeTools(root: HTMLElement) {
  if (root.querySelector("[data-native-export],[data-report-root]")) return true;
  const texts = buttonTexts(root);
  const hasExcel = texts.some(t => /(^|\s)excel(\s|$)|export excel/.test(t));
  const hasCsv = texts.some(t => /(^|\s)csv(\s|$)/.test(t));
  const hasWord = texts.some(t => /(^|\s)word(\s|$)/.test(t));
  const hasPrint = texts.some(t => /^print(\s*\/\s*pdf)?$|^print\s*\/\s*pdf/.test(t));
  return hasExcel && hasCsv && hasWord && hasPrint;
}
function isLegacyExportControl(el: HTMLElement) {
  if (el.closest("table,[role=dialog],.modal")) return false;
  const t = clean(el.textContent).toLowerCase();
  return /^export excel\b/.test(t) || /^excel(?:\s|$)/.test(t) || /^export csv\b/.test(t) || /^csv(?:\s|$)/.test(t) || /^word(?:\s|$)/.test(t) || /^print(?:\s*\/\s*pdf)?(?:\s|$)/.test(t);
}

export default function UniversalDataTools() {
  const location = useLocation();
  const [active, setActive] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [columns, setColumns] = useState<Col[]>([]);
  const [legacy, setLegacy] = useState<HTMLElement[]>([]);

  const scan = useCallback(() => {
    const root = pageRoot();
    if (!root) { setActive(false); setColumns([]); return; }
    const table = root.querySelector<HTMLTableElement>("table");
    const should = Boolean(table) && !hasCompleteNativeTools(root) && !root.querySelector(".print-document");
    setActive(should);
    if (!should || !table) { setColumns([]); return; }
    const headers = Array.from(table.querySelectorAll("thead tr:first-child th"));
    setColumns(prev => headers.map((cell, index) => ({ index, label: clean(cell.textContent) || `Column ${index + 1}`, visible: prev.find(c => c.index === index)?.visible ?? true })));
  }, []);

  useEffect(() => {
    setColumnsOpen(false);
    const timer = window.setTimeout(scan, 40);
    const root = pageRoot();
    if (!root) return () => window.clearTimeout(timer);
    const observer = new MutationObserver(scan);
    observer.observe(root, { childList: true, subtree: true });
    return () => { window.clearTimeout(timer); observer.disconnect(); };
  }, [location.pathname, scan]);

  useEffect(() => {
    legacy.forEach(el => { el.style.display = ""; });
    setLegacy([]);
    if (!active) return;
    const root = pageRoot(); if (!root) return;
    const found = Array.from(root.querySelectorAll<HTMLElement>("button,a,label")).filter(isLegacyExportControl);
    found.forEach(el => { el.style.display = "none"; });
    setLegacy(found);
    return () => found.forEach(el => { el.style.display = ""; });
  }, [active, location.pathname]);

  useEffect(() => {
    if (!active) return;
    const root = pageRoot(); if (!root) return;
    const hidden = new Set(columns.filter(c => !c.visible).map(c => c.index));
    root.querySelectorAll<HTMLTableElement>("table").forEach(table => table.querySelectorAll("tr").forEach(row => Array.from(row.children).forEach((cell, index) => { (cell as HTMLElement).style.display = hidden.has(index) ? "none" : ""; })));
  }, [active, columns]);

  const title = useMemo(() => document.querySelector<HTMLElement>("#navilo-main-content h1,#navilo-main-content h2")?.textContent?.replace(/\s+/g, " ").trim() || document.title || "NAVILO Report", [location.pathname, active]);
  if (!active) return null;
  const root = () => pageRoot();
  const file = () => safeName(title);

  return <div className="relative hidden shrink-0 items-center gap-1 xl:flex" data-no-print data-no-export>
    {columns.length > 0 && <><button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50" onClick={() => setColumnsOpen(v => !v)}><Columns3 className="h-3.5 w-3.5"/>Columns</button>{columnsOpen && <div className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl"><div className="mb-2 flex items-center justify-between"><strong className="text-xs">Show / Hide Columns</strong><button type="button" aria-label="Close column settings" onClick={() => setColumnsOpen(false)}><X className="h-4 w-4"/></button></div><div className="max-h-64 space-y-1 overflow-auto">{columns.map(c => <label key={`${c.index}-${c.label}`} className="flex items-center gap-2 rounded px-1 py-1 text-xs"><input type="checkbox" checked={c.visible} onChange={() => setColumns(list => list.map(x => x.index === c.index ? { ...x, visible: !x.visible } : x))}/><span className="truncate">{c.label}</span></label>)}</div><button type="button" className="btn-secondary mt-2 w-full" onClick={() => setColumns(list => list.map(x => ({ ...x, visible: true })))}>Show All</button></div>}</>}
    <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold" onClick={() => { const r=root(); if(r) exportDomReportToExcel(file(),r,title); }}><FileSpreadsheet className="h-3.5 w-3.5"/>Excel</button>
    <button type="button" className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold" onClick={() => { const r=root(); if(r) exportDomReportToCSV(file(),r,title); }}>CSV</button>
    <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold" onClick={() => { const r=root(); if(r) exportDomReportToWord(file(),r,title); }}><FileText className="h-3.5 w-3.5"/>Word</button>
    <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold" onClick={() => triggerPrint("#navilo-main-content")}><Printer className="h-3.5 w-3.5"/>Print / PDF</button>
  </div>;
}
