export interface ExportColumn {
  key: string;
  label: string;
}

export function exportToCSV(filename: string, columns: ExportColumn[], rows: Record<string, unknown>[]): void {
  const header = columns.map((c) => escapeCSV(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCSV(String(row[c.key] ?? ""))).join(",")).join("\n");
  downloadFile(filename, `${header}\n${body}`, "text/csv;charset=utf-8;");
}

export function exportToExcel(filename: string, columns: ExportColumn[], rows: Record<string, unknown>[]): void {
  const header = columns.map((c) => `<th>${escapeXML(c.label)}</th>`).join("");
  const body = rows.map((row) => `<tr>${columns.map((c) => `<td>${escapeXML(String(row[c.key] ?? ""))}</td>`).join("")}</tr>`).join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  downloadFile(filename, html, "application/vnd.ms-excel;charset=utf-8;");
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function escapeXML(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob(["\uFEFF" + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images);
  if (!images.length) return Promise.resolve();
  return Promise.all(images.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => resolve();
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
      window.setTimeout(done, 2500);
    });
  })).then(() => undefined);
}

const INVOICE_PRINT_CSS = `
@page { size: A4 portrait; margin: 8mm; }
* { box-sizing: border-box; }
html, body { margin:0; padding:0; background:#fff; color:#111827; font-family:Arial,Helvetica,sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { width:194mm; margin:0 auto; }
.print-document { display:block!important; width:100%!important; margin:0!important; padding:0!important; }
.print-page { width:100%!important; max-width:none!important; margin:0!important; padding:0!important; font-size:8.2pt; line-height:1.28; color:#111827; }
.print-header { display:flex; justify-content:space-between; align-items:flex-start; gap:8mm; padding-bottom:3mm; margin-bottom:3mm; border-bottom:1.2px solid #111827; }
.print-company { display:flex; align-items:flex-start; gap:3mm; min-width:0; }
.print-logo { width:auto; height:16mm; max-width:60mm; max-height:16mm; object-fit:contain; object-position:left top; }
.print-company-name { margin:0; font-size:15pt; line-height:1.05; }
.print-company-addr,.print-company-tax { margin:1mm 0 0; font-size:7pt; line-height:1.25; color:#334155; }
.print-voucher-title-box { flex:0 0 52mm; text-align:right; }
.print-voucher-title { margin:0; font-size:13pt; line-height:1.15; }
.print-meta { display:grid; grid-template-columns:1fr 1fr; gap:3mm; margin:0 0 3mm; }
.print-meta-col,.print-party-box { min-width:0; border:1px solid #cbd5e1; padding:2mm; }
.print-meta-row { display:grid; grid-template-columns:38mm minmax(0,1fr); gap:2mm; padding:.6mm 0; }
.print-meta-label,.print-party-label { font-size:7pt; font-weight:700; color:#475569; }
.print-meta-value,.print-party-name { font-size:7.4pt; font-weight:700; overflow-wrap:anywhere; }
.print-party-addr,.print-party-phone,.print-party-email { font-size:7pt; line-height:1.25; color:#475569; }
.invoice-items-wrap { width:100%; margin:0 0 3mm; border-left:1px solid #cbd5e1; border-top:1px solid #cbd5e1; }
.invoice-items-grid { display:grid; width:100%; }
.invoice-items-grid-tax { grid-template-columns:5% 27% 9% 8% 9% 13% 12% 17%; }
.invoice-items-grid-no-tax { grid-template-columns:5% 31% 10% 9% 10% 15% 20%; }
.invoice-items-grid > div { min-width:0; padding:1.6mm 1.2mm; border-right:1px solid #cbd5e1; border-bottom:1px solid #cbd5e1; font-size:7pt; line-height:1.2; overflow:hidden; }
.invoice-items-head > div { background:#eef2f7; font-weight:800; }
.invoice-items-row { break-inside:avoid; page-break-inside:avoid; }
.invoice-num { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
.invoice-center { text-align:center; }
.invoice-item-name { font-weight:600; }
.invoice-item-description { margin-top:1mm; font-size:6.7pt; font-weight:400; color:#475569; }
.invoice-tax-rate { margin-top:.5mm; font-size:6.5pt; color:#64748b; }
.invoice-vat-col,.invoice-amount-col { white-space:nowrap!important; word-break:keep-all!important; overflow:visible!important; }
table { width:100%; border-collapse:collapse; table-layout:fixed; }
th,td { font-size:7pt; line-height:1.2; }
.print-totals-section { display:grid; grid-template-columns:minmax(0,1fr) 72mm; gap:4mm; align-items:start; margin-top:3mm; break-inside:avoid; page-break-inside:avoid; }
.print-charges-box,.print-totals-side { border:1px solid #cbd5e1; padding:2mm; min-width:0; }
.print-charges-title { margin:0 0 1mm; font-size:7.4pt; font-weight:800; }
.print-charge-row,.print-total-row { display:flex; justify-content:space-between; gap:3mm; padding:.8mm 0; border-bottom:1px solid #edf0f4; font-size:7pt; }
.print-charge-row span:last-child,.print-total-row span:last-child { white-space:nowrap; font-variant-numeric:tabular-nums; }
.print-grand-total { margin-top:1mm; padding-top:1.5mm; border-top:1.2px solid #111827; border-bottom:0; font-size:9pt; font-weight:900; }
.print-payment-summary { margin-top:3mm!important; padding:2mm!important; break-inside:avoid; page-break-inside:avoid; }
.print-payment-summary > div:nth-child(2) { grid-template-columns:repeat(4,minmax(0,1fr))!important; gap:2mm!important; }
.print-signatures { display:grid; grid-template-columns:repeat(3,1fr); gap:8mm; margin-top:8mm; break-inside:avoid; page-break-inside:avoid; }
.print-signature-block { text-align:center; }
.print-signature-line { border-top:1px solid #64748b; margin-bottom:1mm; }
.print-signature-label { font-size:7pt; }
.print-footer { margin-top:4mm; padding-top:2mm; border-top:1px solid #e2e8f0; text-align:center; }
.print-footer p { margin:.5mm 0; font-size:6.8pt; color:#64748b; }
.print-page-number { font-size:6.8pt!important; }
@media print { body { width:194mm!important; } .print-document,.print-page { position:static!important; transform:none!important; zoom:1!important; overflow:visible!important; } }
`;

export function triggerPrint(): void {
  const invoiceSource = document.querySelector<HTMLElement>(".print-document");
  const reportSource = document.querySelector<HTMLElement>(".print-report");
  const source = invoiceSource || reportSource;
  if (!source) {
    window.print();
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "1px",
    height: "1px",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(iframe);

  const printDoc = iframe.contentDocument;
  const printWin = iframe.contentWindow;
  if (!printDoc || !printWin) {
    iframe.remove();
    window.print();
    return;
  }

  printDoc.open();
  printDoc.write('<!doctype html><html><head><meta charset="utf-8"><title>Print</title>');

  if (invoiceSource) {
    printDoc.write(`<style>${INVOICE_PRINT_CSS}</style>`);
  } else {
    const styles = Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'));
    styles.forEach((node) => printDoc.write(node.outerHTML));
    printDoc.write('<style>@page{size:A4;margin:10mm}html,body{margin:0!important;padding:0!important;background:#fff!important}.print-report{display:block!important;position:static!important;width:100%!important;transform:none!important}</style>');
  }

  printDoc.write('</head><body></body></html>');
  printDoc.close();
  printDoc.body.appendChild(source.cloneNode(true));

  const doPrint = () => {
    printWin.focus();
    printWin.print();
    window.setTimeout(() => iframe.remove(), 1500);
  };

  Promise.all([
    waitForImages(printDoc),
    printDoc.fonts?.ready ?? Promise.resolve(),
  ]).then(() => window.setTimeout(doPrint, 350));
}
