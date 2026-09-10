import { Printer } from "lucide-react";
import { useLocation } from "react-router-dom";

function currentPageTitle() {
  const root = document.querySelector<HTMLElement>("main") || document.body;
  const heading = root.querySelector<HTMLElement>(".page-title,h1,h2");
  return heading?.textContent?.replace(/\s+/g, " ").trim() || document.title || "NAVILO ERP";
}

export default function GlobalPrintButton() {
  const { pathname } = useLocation();
  const hidden = pathname === "/login" || pathname === "/reset-password";
  if (hidden) return null;

  const printPage = () => {
    window.dispatchEvent(
      new CustomEvent("navilo:print-preview", {
        detail: {
          selector: "main",
          title: currentPageTitle(),
        },
      }),
    );
  };

  return (
    <button
      type="button"
      onClick={printPage}
      className="fixed bottom-5 left-4 z-20 inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-lg hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 lg:left-[268px]"
      title="Print current screen / Save as PDF"
      aria-label="Print current screen or save as PDF"
      data-no-print
    >
      <Printer className="h-4 w-4" />
      <span>Print / PDF</span>
    </button>
  );
}
