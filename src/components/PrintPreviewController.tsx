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

function setCss(root: ParentNode, selector: string, css: Partial<CSSStyleDeclaration>) {
  root.querySelectorAll<HTMLElement>(selector).forEach((el) => Object.assign(el.style, css));
}

function applyDeterministicInvoiceLayout(clone: HTMLElement) {
  const isConsolidatedPurchase = clone.id === "consolidated-purchase-print-root" || !!clone.querySelector("#consolidated-purchase-print-root");
  if (!isConsolidatedPurchase) return;

  Object.assign(clone.style, { display: "block", visibility: "visible", width: "100%", maxWidth: "100%", margin: "0", padding: "0" });
  setCss(clone, ".print-document", { display: "block", visibility: "visible", position: "static", width: "100%", maxWidth: "100%", margin: "0", padding: "0" });
  setCss(clone, ".print-page", { display: "block", width: "100%", maxWidth: "190mm", margin: "0 auto", padding: "0", color: "#111827", background: "#fff", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "8.5pt", lineHeight: "1.25" });
  setCss(clone, ".print-header", { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "start", gap: "8mm", margin: "0 0 3mm", padding: "0 0 3mm", borderBottom: "1.2px solid #111827" });
  setCss(clone, ".print-company", { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "1mm", minWidth: "0" });
  setCss(clone, ".print-logo", { display: "block", width: "auto", height: "16mm", maxWidth: "60mm", maxHeight: "16mm", objectFit: "contain", objectPosition: "left top" });
  setCss(clone, ".print-company-name", { display: "block", margin: "0", fontSize: "15pt", lineHeight: "1.08", fontWeight: "800" });
  setCss(clone, ".print-company-addr,.print-company-tax", { display: "block", margin: "1mm 0 0", fontSize: "7pt", lineHeight: "1.3" });
  setCss(clone, ".print-voucher-title-box", { display: "flex", alignItems: "flex-start", justifyContent: "flex-end", gap: "3mm", minWidth: "50mm", textAlign: "right" });
  setCss(clone, ".print-voucher-title", { display: "block", margin: "0", fontSize: "13pt", lineHeight: "1.15", fontWeight: "800" });
  setCss(clone, ".print-meta", { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3mm", margin: "0 0 3mm" });
  setCss(clone, ".print-meta-col,.print-party-box", { display: "block", minWidth: "0", border: "1px solid #cbd5e1", padding: "2mm" });
  setCss(clone, ".print-meta-row", { display: "grid", gridTemplateColumns: "38mm minmax(0,1fr)", gap: "2mm", padding: ".6mm 0" });
  setCss(clone, ".print-meta-label,.print-party-label", { display: "block", fontSize: "7pt", fontWeight: "700", color: "#475569" });
  setCss(clone, ".print-meta-value,.print-party-name", { display: "block", fontSize: "7.5pt", fontWeight: "700", overflowWrap: "anywhere" });
  setCss(clone, ".print-party-addr,.print-party-phone,.print-party-email", { display: "block", fontSize: "7pt", lineHeight: "1.3" });
  setCss(clone, ".invoice-items-wrap", { display: "block", width: "100%", margin: "0 0 3mm", borderTop: "1px solid #cbd5e1", borderLeft: "1px solid #cbd5e1" });
  setCss(clone, ".invoice-items-grid", { display: "grid", width: "100%", boxSizing: "border-box" });
  setCss(clone, ".invoice-items-grid-tax", { gridTemplateColumns: "5% 27% 9% 8% 9% 13% 12% 17%" });
  setCss(clone, ".invoice-items-grid-no-tax", { gridTemplateColumns: "5% 31% 11% 10% 10% 14% 19%" });
  setCss(clone, ".invoice-items-head", { background: "#eef2f7", fontWeight: "800" });
  setCss(clone, ".invoice-items-grid > div", { display: "block", minWidth: "0", boxSizing: "border-box", padding: "1.7mm 1.2mm", borderRight: "1px solid #cbd5e1", borderBottom: "1px solid #cbd5e1", fontSize: "7pt", lineHeight: "1.2", overflow: "hidden" });
  setCss(clone, ".invoice-num", { textAlign: "right", whiteSpace: "nowrap" });
  setCss(clone, ".invoice-center", { textAlign: "center" });
  setCss(clone, ".invoice-item-name", { fontWeight: "600" });
  setCss(clone, ".invoice-item-description", { marginTop: ".7mm", fontSize: "6.5pt", color: "#64748b", whiteSpace: "normal", overflowWrap: "anywhere" });
  setCss(clone, ".print-totals-section", { display: "grid", gridTemplateColumns: "minmax(0,1fr) 70mm", gap: "4mm", alignItems: "start", marginTop: "3mm" });
  setCss(clone, ".print-charges-box,.print-totals-side", { display: "block", minWidth: "0", border: "1px solid #cbd5e1", padding: "2mm" });
  setCss(clone, ".print-charge-row,.print-total-row", { display: "flex", justifyContent: "space-between", gap: "3mm", padding: ".8mm 0", borderBottom: "1px solid #edf0f4", fontSize: "7.2pt" });
  setCss(clone, ".print-grand-total", { marginTop: "1mm", paddingTop: "1.5mm", borderTop: "1.2px solid #111827", borderBottom: "0", fontSize: "9pt", fontWeight: "900" });
  setCss(clone, ".print-payment-summary", { display: "block", marginTop: "3mm", padding: "2mm" });
  setCss(clone, ".print-signatures", { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8mm", marginTop: "8mm" });
  setCss(clone, ".print-signature-block", { display: "block", textAlign: "center" });
  setCss(clone, ".print-signature-line", { display: "block", borderTop: "1px solid #64748b", marginBottom: "1mm" });
  setCss(clone, ".print-footer", { display: "block", marginTop: "4mm", paddingTop: "2mm", borderTop: "1px solid #e2e8f0", textAlign: "center" });
  clone.querySelectorAll<HTMLElement>("*").forEach((el) => { el.style.visibility = "visible"; });
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
  applyDeterministicInvoiceLayout(clone);
  return clone.outerHTML;
}

function collectStyles() {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("\n");
}

const A4_PRINT_CSS = `
  @page { size: A4 portrait; margin: 10mm; }
  html, body { background:#fff!important;color:#0f172a!important;margin:0!important;padding:0!important;width:100%!important;min-width:0!important;font-family:Inter,Arial,sans-serif!important;font-size:10.5px!important;line-height:1.35!important; }
  *, *::before, *::after { box-sizing:border-box!important; }
  body * { visibility:visible!important; }
  .mf-print-output { display:block!important;visibility:visible!important;background:#fff!important;width:190mm!important;max-width:190mm!important;min-width:0!important;margin:0 auto!important;overflow:visible!important;font-size:10.5px!important;line-height:1.35!important; }
  .mf-print-output > *, .print-document, .print-report, [data-print-root], #printable-invoice-area { width:100%!important;max-width:100%!important;min-width:0!important; }
  .print-document { display:block!important;position:static!important;visibility:visible!important; }
  .print-document *, .print-report *, [data-print-root] *, #printable-invoice-area * { visibility:visible!important; }
  button,.no-print,[data-no-print],nav,aside{display:none!important} img,svg{max-width:100%!important}
  table{width:100%!important;max-width:100%!important;border-collapse:collapse!important;border-spacing:0!important;table-layout:auto!important;font-size:9.75px!important;margin:6px 0 10px!important}
  thead{display:table-header-group!important}tfoot{display:table-footer-group!important}th{background:#f1f5f9!important;color:#334155!important;font-weight:700!important;border:1px solid #94a3b8!important;padding:4px 5px!important;text-align:left!important;vertical-align:middle!important;white-space:normal!important}td{color:#1e293b!important;border:1px solid #cbd5e1!important;padding:4px 5px!important;vertical-align:middle!important}
  @media print { html,body{width:210mm!important}.mf-print-output{width:190mm!important;max-width:190mm!important;position:static!important} }
`;

export default function PrintPreviewController() {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const styleMarkup = useMemo(() => collectStyles(), [preview]);

  useEffect(() => {
    const previousPrint = window.print;
    const showTargetPreview = (target: HTMLElement, title?: string) => setPreview({ html: cleanClone(target), title: title || document.title || "NAVILO" });
    const openPreview = () => { const target = getPrintableTarget(); if (!target) { previousPrint.call(window); return; } showTargetPreview(target); };
    const onPreviewEvent = (event: Event) => { const custom = event as CustomEvent<PreviewEventDetail>; const detail = custom.detail || {}; if (detail.html) { setPreview({ html: detail.html, title: detail.title || document.title || "NAVILO" }); return; } const target = getPrintableTarget(detail.selector); if (target) showTargetPreview(target, detail.title); };
    const onPrintClick = (event: MouseEvent) => { const button = (event.target as Element | null)?.closest("button"); if (!(button instanceof HTMLButtonElement)) return; if (button.closest("[data-navilo-print-preview]")) return; const text = (button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase(); if (!/\bprint\b|پرنٹ/.test(text)) return; const printableTarget = getPrintableTarget(button.dataset.printSelector); if (!printableTarget) return; event.preventDefault(); event.stopPropagation(); showTargetPreview(printableTarget); };
    window.addEventListener("navilo:print-preview", onPreviewEvent as EventListener); document.addEventListener("click", onPrintClick, true); const timer = window.setTimeout(() => { window.print = openPreview; }, 0);
    return () => { window.clearTimeout(timer); window.removeEventListener("navilo:print-preview", onPreviewEvent as EventListener); document.removeEventListener("click", onPrintClick, true); if (window.print === openPreview) window.print = previousPrint; };
  }, []);

  const printNow = () => {
    if (!preview) return;
    const frame = document.createElement("iframe"); frame.setAttribute("aria-hidden", "true"); Object.assign(frame.style, { position:"fixed", right:"0", bottom:"0", width:"0", height:"0", border:"0" }); document.body.appendChild(frame);
    const doc = frame.contentDocument; if (!doc) { frame.remove(); return; }
    doc.open(); doc.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${document.baseURI}"><title>${preview.title}</title>${styleMarkup}<style>${A4_PRINT_CSS}</style></head><body><div class="mf-print-output">${preview.html}</div></body></html>`); doc.close();
    const waitForPrintAssets = async () => { try { const images = Array.from(doc.images); await Promise.all(images.map((img) => img.complete ? Promise.resolve() : new Promise<void>((resolve) => { const done=()=>resolve(); img.addEventListener("load",done,{once:true}); img.addEventListener("error",done,{once:true}); }))); if(doc.fonts?.ready) await doc.fonts.ready; } catch {} await new Promise((resolve)=>window.setTimeout(resolve,250)); };
    const doPrint = async () => { await waitForPrintAssets(); frame.contentWindow?.focus(); frame.contentWindow?.print(); window.setTimeout(()=>frame.remove(),1800); };
    if (doc.readyState === "complete") void doPrint(); else frame.onload = () => { void doPrint(); };
  };

  if (!preview) return null;
  return <div className="fixed inset-0 z-[100000] flex flex-col bg-slate-950/80 p-3 backdrop-blur-sm md:p-5" data-no-bilingual data-navilo-print-preview>
    <div className="mx-auto mb-2 flex w-full max-w-6xl items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-xl"><div><div className="text-sm font-extrabold text-slate-900">A4 Print Preview / اے فور پرنٹ پیش منظر</div><div className="mt-0.5 text-[11px] text-slate-500">Professional A4 layout · compact tables · 10mm margins · Print or Save as PDF</div></div><div className="flex gap-2"><button type="button" className="btn-secondary" onClick={() => setPreview(null)}>Close / بند کریں</button><button type="button" className="btn-primary" onClick={printNow}>Print / Save PDF</button></div></div>
    <div className="mx-auto w-full max-w-6xl flex-1 overflow-auto rounded-lg bg-slate-300 p-3 shadow-xl md:p-5"><div className="mx-auto bg-white shadow-lg" style={{width:"210mm",minHeight:"297mm",padding:"10mm",display:"block",visibility:"visible"}}><div className="mf-live-preview" dangerouslySetInnerHTML={{__html:preview.html}} /></div></div>
  </div>;
}
