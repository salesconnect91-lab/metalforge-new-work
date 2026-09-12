import { useEffect, useRef, useState } from "react";
import { Download, FileText, Printer, Sheet, Table2 } from "lucide-react";
import { useLocation } from "react-router-dom";
import {
  exportDomReportToCSV,
  exportDomReportToExcel,
  exportDomReportToWord,
  triggerPrint,
} from "@/lib/exportUtils";

function cleanTitle(value: string) {
  return value
    .replace(/\s*\/\s*[\u0600-\u06FF].*$/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "navilo-export";
}

function currentPageTitle() {
  const root = document.querySelector<HTMLElement>("[data-report-content]") || document.querySelector<HTMLElement>("#navilo-main-content") || document.body;
  return (
    root.querySelector<HTMLElement>("h1,h2,.page-title")?.textContent?.replace(/\s+/g, " ").trim() ||
    document.title ||
    "NAVILO"
  );
}

function currentExportRoot() {
  return document.querySelector<HTMLElement>("[data-report-content]") || document.querySelector<HTMLElement>("#navilo-main-content");
}

/** One consistent NAVILO export / print surface for the protected ERP workspace. */
export default function UniversalDataTools() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const journalList = pathname === "/accounting";

  useEffect(() => {
    if (!journalList) return;

    const style = document.createElement("style");
    style.dataset.naviloJournalToolbar = "true";
    style.textContent = 'button[title^="Print journal voucher"]{display:none!important}';
    document.head.appendChild(style);

    const normalizeImportArrow = () => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("#navilo-main-content button"));
      buttons.forEach((button) => {
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          if (node.nodeValue?.includes("↓ Bulk Import")) {
            node.nodeValue = node.nodeValue.replace("↓ Bulk Import", "↑ Bulk Import");
            break;
          }
        }
      });
    };

    normalizeImportArrow();
    const observer = new MutationObserver(normalizeImportArrow);
    const main = document.querySelector("#navilo-main-content");
    if (main) observer.observe(main, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      style.remove();
    };
  }, [journalList]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const exportCurrent = (type: "excel" | "csv" | "word") => {
    const root = currentExportRoot();
    if (!root) return;
    const title = currentPageTitle();
    const filename = cleanTitle(title);
    if (type === "excel") exportDomReportToExcel(filename, root, title);
    if (type === "csv") exportDomReportToCSV(filename, root, title);
    if (type === "word") exportDomReportToWord(filename, root, title);
    setOpen(false);
  };

  const printCurrent = () => {
    setOpen(false);
    triggerPrint(document.querySelector("[data-report-content]") ? "[data-report-content]" : "#navilo-main-content");
  };

  return (
    <div className="relative flex items-center gap-2" ref={ref} data-no-print data-no-export>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-[12px] font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          aria-haspopup="menu"
          aria-expanded={open}
          title="Export current ERP screen"
        >
          <Download className="h-4 w-4" />
          <span className="hidden xl:inline">Export</span>
        </button>

        {open && (
          <div className="absolute right-0 top-11 z-[70] w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl" role="menu">
            <button type="button" onClick={() => exportCurrent("excel")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Sheet className="h-4 w-4" /> Excel (.xlsx)
            </button>
            <button type="button" onClick={() => exportCurrent("csv")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Table2 className="h-4 w-4" /> CSV (.csv)
            </button>
            <button type="button" onClick={() => exportCurrent("word")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <FileText className="h-4 w-4" /> Word (.doc)
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={printCurrent}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 text-[12px] font-bold text-blue-800 shadow-sm hover:bg-blue-100"
        title="Print preview or save as PDF"
      >
        <Printer className="h-4 w-4" />
        <span className="hidden xl:inline">Print / PDF</span>
      </button>
    </div>
  );
}
