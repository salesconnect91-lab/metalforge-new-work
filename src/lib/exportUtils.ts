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

function waitForStyles(doc: Document): Promise<void> {
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
  if (!links.length) return Promise.resolve();
  return Promise.all(
    links.map((link) => new Promise<void>((resolve) => {
      if (link.sheet) {
        resolve();
        return;
      }
      const done = () => resolve();
      link.addEventListener("load", done, { once: true });
      link.addEventListener("error", done, { once: true });
      window.setTimeout(done, 2500);
    })),
  ).then(() => undefined);
}

function waitForImages(doc: Document): Promise<void> {
  const images = Array.from(doc.images);
  if (!images.length) return Promise.resolve();
  return Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
        window.setTimeout(done, 2500);
      });
    }),
  ).then(() => undefined);
}

export function triggerPrint(): void {
  const source = document.querySelector<HTMLElement>(".print-document") || document.querySelector<HTMLElement>(".print-report");
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

  const styles = Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'));
  printDoc.open();
  printDoc.write('<!doctype html><html><head><meta charset="utf-8"><title>Print</title>');
  styles.forEach((node) => printDoc.write(node.outerHTML));
  printDoc.write(`<style>
    @page { size: A4 portrait; margin: 8mm; }
    html, body { margin:0!important; padding:0!important; background:#fff!important; color:#111827!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
    body > * { visibility:visible!important; }
    .print-document,.print-report { display:block!important; visibility:visible!important; position:static!important; inset:auto!important; width:100%!important; max-width:none!important; margin:0!important; transform:none!important; zoom:1!important; }
    .print-document *,.print-report * { visibility:visible!important; }
    @media print {
      html,body { width:auto!important; min-width:0!important; overflow:visible!important; }
      .print-document,.print-report { position:static!important; float:none!important; overflow:visible!important; }
    }
  </style></head><body></body></html>`);
  printDoc.close();
  printDoc.body.appendChild(source.cloneNode(true));

  const doPrint = () => {
    printWin.focus();
    printWin.print();
    window.setTimeout(() => iframe.remove(), 1200);
  };

  Promise.all([
    waitForStyles(printDoc),
    waitForImages(printDoc),
    printDoc.fonts?.ready ?? Promise.resolve(),
  ]).then(() => window.setTimeout(doPrint, 300));
}
