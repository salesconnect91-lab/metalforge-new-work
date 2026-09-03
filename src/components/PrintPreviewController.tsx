import { useEffect, useMemo, useState } from "react";

type PreviewPayload = {
  html: string;
  title: string;
};

function getPrintableTarget() {
  return (
    document.querySelector<HTMLElement>(".print-document") ||
    document.querySelector<HTMLElement>("[data-print-root]") ||
    document.querySelector<HTMLElement>(".print-report") ||
    document.querySelector<HTMLElement>("main")
  );
}

function cleanClone(target: HTMLElement) {
  const clone = target.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("button,.no-print,.print\\:hidden,[data-no-print],nav,aside").forEach((node) => node.remove());
  clone.querySelectorAll("input,select,textarea").forEach((node) => {
    const el = node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const value = "value" in el ? el.value : "";
    const span = document.createElement("span");
    span.textContent = value || "—";
    span.style.whiteSpace = "pre-wrap";
    node.replaceWith(span);
  });
  clone.style.display = "block";
  clone.style.visibility = "visible";
  clone.style.width = "100%";
  clone.style.maxWidth = "100%";
  return clone.outerHTML;
}

function collectStyles() {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("\n");
}

const A4_PRINT_CSS = `
  @page { size: A4 portrait; margin: 10mm; }
  html, body {
    background: #fff !important;
    color: #0f172a !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    min-width: 0 !important;
  }
  *, *::before, *::after { box-sizing: border-box !important; }
  body * { visibility: visible !important; }
  .mf-print-output {
    display: block !important;
    visibility: visible !important;
    background: #fff !important;
    width: 190mm !important;
    max-width: 190mm !important;
    min-width: 0 !important;
    margin: 0 auto !important;
    overflow: visible !important;
  }
  .mf-print-output > *,
  .print-document,
  .print-report,
  [data-print-root] {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
  }
  .print-document {
    display: block !important;
    position: static !important;
    visibility: visible !important;
  }
  .print-document *, .print-report *, [data-print-root] * { visibility: visible !important; }
  button, .no-print, [data-no-print], nav, aside { display: none !important; }
  img, svg { max-width: 100% !important; }
  table {
    width: 100% !important;
    max-width: 100% !important;
    border-collapse: collapse !important;
    table-layout: auto !important;
  }
  th, td {
    overflow-wrap: anywhere !important;
    word-break: normal !important;
  }
  .overflow-x-auto, .overflow-auto { overflow: visible !important; }
  .min-w-full, [class*="min-w-"] { min-width: 0 !important; }
  .max-w-6xl, .max-w-7xl, [class*="max-w-"] { max-width: 100% !important; }
  .fixed, .sticky { position: static !important; }
  tr, td, th { break-inside: avoid !important; page-break-inside: avoid !important; }
  thead { display: table-header-group !important; }
  tfoot { display: table-footer-group !important; }
  .card, .summary-card { break-inside: avoid !important; page-break-inside: avoid !important; }
  @media print {
    html, body { width: 210mm !important; }
    .mf-print-output { width: 190mm !important; max-width: 190mm !important; position: static !important; }
  }
`;

export default function PrintPreviewController() {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const styleMarkup = useMemo(() => collectStyles(), [preview]);

  useEffect(() => {
    const previousPrint = window.print;

    const openPreview = () => {
      const target = getPrintableTarget();
      if (!target) {
        previousPrint.call(window);
        return;
      }
      setPreview({ html: cleanClone(target), title: document.title || "MetalForge OS" });
    };

    const timer = window.setTimeout(() => { window.print = openPreview; }, 0);
    return () => {
      window.clearTimeout(timer);
      if (window.print === openPreview) window.print = previousPrint;
    };
  }, []);

  const printNow = () => {
    if (!preview) return;

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    if (!doc) { frame.remove(); return; }

    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${preview.title}</title>${styleMarkup}<style>${A4_PRINT_CSS}</style></head><body><div class="mf-print-output">${preview.html}</div></body></html>`);
    doc.close();

    const doPrint = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1200);
    };

    if (doc.readyState === "complete") doPrint();
    else frame.onload = doPrint;
  };

  if (!preview) return null;

  return (
    <div className="fixed inset-0 z-[100000] flex flex-col bg-slate-950/80 p-3 backdrop-blur-sm md:p-6" data-no-bilingual>
      <div className="mx-auto mb-3 flex w-full max-w-6xl items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-2xl">
        <div>
          <div className="text-sm font-extrabold text-slate-900">A4 Print Preview / اے فور پرنٹ پیش منظر</div>
          <div className="mt-0.5 text-[12px] text-slate-500">Fixed A4 portrait · 10mm margins · Print or Save as PDF</div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setPreview(null)}>Close / بند کریں</button>
          <button type="button" className="btn-primary" onClick={printNow}>Print / Save PDF</button>
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl flex-1 overflow-auto rounded-xl bg-slate-300 p-3 shadow-2xl md:p-6">
        <div className="mx-auto bg-white shadow-xl" style={{ width: "210mm", minHeight: "297mm", padding: "10mm", display: "block", visibility: "visible" }}>
          <style>{`
            .mf-live-preview { width: 190mm; max-width: 190mm; overflow: hidden; }
            .mf-live-preview .print-document { display:block!important;position:static!important;visibility:visible!important;width:100%!important;max-width:100%!important; }
            .mf-live-preview .print-document *, .mf-live-preview .print-report *, .mf-live-preview [data-print-root] * { visibility:visible!important; }
            .mf-live-preview .print-report, .mf-live-preview [data-print-root] { width:100%!important;max-width:100%!important;min-width:0!important; }
            .mf-live-preview button,.mf-live-preview .no-print,.mf-live-preview [data-no-print]{display:none!important}
            .mf-live-preview table{width:100%!important;max-width:100%!important;border-collapse:collapse!important}
            .mf-live-preview .overflow-x-auto,.mf-live-preview .overflow-auto{overflow:visible!important}
            .mf-live-preview [class*="min-w-"]{min-width:0!important}
            .mf-live-preview [class*="max-w-"]{max-width:100%!important}
          `}</style>
          <div className="mf-live-preview" dangerouslySetInnerHTML={{ __html: preview.html }} />
        </div>
      </div>
    </div>
  );
}
