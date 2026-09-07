import { useEffect, useMemo, useState } from "react";

type PreviewPayload = {
  html: string;
  title: string;
};

type PreviewEventDetail = {
  html?: string;
  title?: string;
  selector?: string;
};

function getPrintableTarget(selector?: string) {
  if (selector) {
    const selected = document.querySelector<HTMLElement>(selector);
    if (selected) return selected;
  }
  return (
    document.querySelector<HTMLElement>("#printable-invoice-area") ||
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
    font-family: Inter, Arial, sans-serif !important;
    font-size: 10.5px !important;
    line-height: 1.35 !important;
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
    font-size: 10.5px !important;
    line-height: 1.35 !important;
  }
  .mf-print-output > *, .print-document, .print-report, [data-print-root], #printable-invoice-area {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
  }
  .print-document {
    display: block !important;
    position: static !important;
    visibility: visible !important;
  }
  .print-document *, .print-report *, [data-print-root] *, #printable-invoice-area * { visibility: visible !important; }
  button, .no-print, [data-no-print], nav, aside { display: none !important; }
  img, svg { max-width: 100% !important; }
  h1 { font-size: 16px !important; line-height: 1.2 !important; margin: 0 0 6px !important; }
  h2 { font-size: 14px !important; line-height: 1.25 !important; margin: 0 0 5px !important; }
  h3 { font-size: 12px !important; line-height: 1.3 !important; margin: 0 0 4px !important; }
  p { margin-top: 3px !important; margin-bottom: 3px !important; }
  table {
    width: 100% !important;
    max-width: 100% !important;
    border-collapse: collapse !important;
    border-spacing: 0 !important;
    table-layout: auto !important;
    font-size: 9.75px !important;
    margin: 6px 0 10px !important;
  }
  thead { display: table-header-group !important; }
  tfoot { display: table-footer-group !important; }
  th {
    background: #f1f5f9 !important;
    color: #334155 !important;
    font-weight: 700 !important;
    border: 1px solid #94a3b8 !important;
    padding: 4px 5px !important;
    text-align: left !important;
    vertical-align: middle !important;
    white-space: normal !important;
  }
  td {
    color: #1e293b !important;
    border: 1px solid #cbd5e1 !important;
    padding: 4px 5px !important;
    vertical-align: middle !important;
  }
  tbody tr:nth-child(even) td { background: #f8fafc !important; }
  th, td { overflow-wrap: anywhere !important; word-break: normal !important; }
  .overflow-x-auto, .overflow-auto { overflow: visible !important; }
  .min-w-full, [class*="min-w-"] { min-width: 0 !important; }
  .max-w-6xl, .max-w-7xl, [class*="max-w-"] { max-width: 100% !important; }
  .fixed, .sticky { position: static !important; }
  tr, td, th { break-inside: avoid !important; page-break-inside: avoid !important; }
  .card, .summary-card, section { break-inside: avoid !important; page-break-inside: avoid !important; }
  .rounded-xl, .rounded-2xl, .rounded-lg { border-radius: 2px !important; }
  .shadow, .shadow-sm, .shadow-md, .shadow-lg, .shadow-xl, .shadow-2xl { box-shadow: none !important; }
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

    const showTargetPreview = (target: HTMLElement, title?: string) => {
      setPreview({ html: cleanClone(target), title: title || document.title || "NAVILO" });
    };

    const openPreview = () => {
      const target = getPrintableTarget();
      if (!target) {
        previousPrint.call(window);
        return;
      }
      showTargetPreview(target);
    };

    const onPreviewEvent = (event: Event) => {
      const custom = event as CustomEvent<PreviewEventDetail>;
      const detail = custom.detail || {};
      if (detail.html) {
        setPreview({ html: detail.html, title: detail.title || document.title || "NAVILO" });
        return;
      }
      const target = getPrintableTarget(detail.selector);
      if (target) showTargetPreview(target, detail.title);
    };

    const onPrintClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest("button");
      if (!(button instanceof HTMLButtonElement)) return;
      const text = (button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!/\bprint\b|پرنٹ/.test(text)) return;
      const invoiceTarget = document.querySelector<HTMLElement>("#printable-invoice-area");
      if (!invoiceTarget) return;
      event.preventDefault();
      event.stopPropagation();
      showTargetPreview(invoiceTarget);
    };

    window.addEventListener("navilo:print-preview", onPreviewEvent as EventListener);
    document.addEventListener("click", onPrintClick, true);
    const timer = window.setTimeout(() => { window.print = openPreview; }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("navilo:print-preview", onPreviewEvent as EventListener);
      document.removeEventListener("click", onPrintClick, true);
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
    <div className="fixed inset-0 z-[100000] flex flex-col bg-slate-950/80 p-3 backdrop-blur-sm md:p-5" data-no-bilingual>
      <div className="mx-auto mb-2 flex w-full max-w-6xl items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-xl">
        <div>
          <div className="text-sm font-extrabold text-slate-900">A4 Print Preview / اے فور پرنٹ پیش منظر</div>
          <div className="mt-0.5 text-[11px] text-slate-500">Professional A4 layout · compact tables · 10mm margins · Print or Save as PDF</div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setPreview(null)}>Close / بند کریں</button>
          <button type="button" className="btn-primary" onClick={printNow}>Print / Save PDF</button>
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl flex-1 overflow-auto rounded-lg bg-slate-300 p-3 shadow-xl md:p-5">
        <div className="mx-auto bg-white shadow-lg" style={{ width: "210mm", minHeight: "297mm", padding: "10mm", display: "block", visibility: "visible" }}>
          <style>{`
            .mf-live-preview { width:190mm;max-width:190mm;overflow:hidden;font-size:10.5px!important;line-height:1.35!important;color:#0f172a!important; }
            .mf-live-preview .print-document { display:block!important;position:static!important;visibility:visible!important;width:100%!important;max-width:100%!important; }
            .mf-live-preview .print-document *, .mf-live-preview .print-report *, .mf-live-preview [data-print-root] *, .mf-live-preview #printable-invoice-area * { visibility:visible!important; }
            .mf-live-preview .print-report, .mf-live-preview [data-print-root], .mf-live-preview #printable-invoice-area { width:100%!important;max-width:100%!important;min-width:0!important; }
            .mf-live-preview button,.mf-live-preview .no-print,.mf-live-preview [data-no-print]{display:none!important}
            .mf-live-preview table{width:100%!important;max-width:100%!important;border-collapse:collapse!important;border-spacing:0!important;font-size:9.75px!important;margin:6px 0 10px!important}
            .mf-live-preview th{background:#f1f5f9!important;color:#334155!important;font-weight:700!important;border:1px solid #94a3b8!important;padding:4px 5px!important;text-align:left!important;white-space:normal!important}
            .mf-live-preview td{color:#1e293b!important;border:1px solid #cbd5e1!important;padding:4px 5px!important;vertical-align:middle!important}
            .mf-live-preview tbody tr:nth-child(even) td{background:#f8fafc!important}
            .mf-live-preview .overflow-x-auto,.mf-live-preview .overflow-auto{overflow:visible!important}
            .mf-live-preview [class*="min-w-"]{min-width:0!important}
            .mf-live-preview [class*="max-w-"]{max-width:100%!important}
            .mf-live-preview h1{font-size:16px!important}.mf-live-preview h2{font-size:14px!important}.mf-live-preview h3{font-size:12px!important}
          `}</style>
          <div className="mf-live-preview" dangerouslySetInnerHTML={{ __html: preview.html }} />
        </div>
      </div>
    </div>
  );
}
