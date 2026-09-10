import { Printer } from "lucide-react";
import { useLocation } from "react-router-dom";

function currentPageTitle() {
  const root = document.querySelector<HTMLElement>("main") || document.body;
  const heading = root.querySelector<HTMLElement>(".page-title,h1,h2");
  return heading?.textContent?.replace(/\s+/g, " ").trim() || document.title || "NAVILO ERP";
}

export default function GlobalPrintButton() {
  const { pathname } = useLocation();
  const hidden = pathname === "/login" || pathname === "/reset-password" || pathname.startsWith("/cutting/gate-pass");
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
      className="fixed right-4 top-[82px] z-[9999] inline-flex h-10 items-center gap-2 rounded-lg border border-blue-300 bg-blue-600 px-4 text-xs font-extrabold text-white shadow-xl hover:bg-blue-700"
      title="Print current screen / Save as PDF"
      aria-label="Print current screen or save as PDF"
      data-no-print
    >
      <Printer className="h-4 w-4" />
      <span>Print / PDF</span>
    </button>
  );
}
