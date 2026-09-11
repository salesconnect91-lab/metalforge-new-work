import * as XLSX from "xlsx";

export interface ExportColumn { key: string; label: string; }
export type ExportMatrix = Array<Array<unknown>>;
export type ExportSheet = { name: string; rows: ExportMatrix };

function safeSpreadsheetText(value: string): string { return /^[=+\-@]/.test(value) ? `'${value}` : value; }
function normalizeExcelValue(value: unknown): string | number | boolean {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return safeSpreadsheetText(String(value ?? ""));
}
function ensureExtension(filename: string, extension: string): string {
  const trimmed = filename.trim() || `NAVILO_Export${extension}`;
  return trimmed.toLowerCase().endsWith(extension) ? trimmed : `${trimmed.replace(/\.[^.]+$/, "")}${extension}`;
}
function escapeCSV(value: unknown): string {
  const safe = safeSpreadsheetText(String(value ?? ""));
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n") || safe.includes("\r")) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}
function escapeHtml(value: unknown): string { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c] || c)); }
function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
function matrixToWorksheet(matrix: ExportMatrix): XLSX.WorkSheet {
  const rows = matrix.length ? matrix : [[]];
  const normalized = rows.map(row => row.map(normalizeExcelValue));
  const worksheet = XLSX.utils.aoa_to_sheet(normalized);
  const columnCount = Math.max(1, ...normalized.map(row => row.length));
  worksheet["!cols"] = Array.from({ length: columnCount }, (_u, index) => {
    const values = normalized.map(row => String(row[index] ?? ""));
    return { wch: Math.min(48, Math.max(12, ...values.map(value => value.length + 2))) };
  });
  return worksheet;
}

export function exportMatrixToCSV(filename: string, matrix: ExportMatrix): void {
  const rows = matrix.length ? matrix : [[]];
  downloadBlob(ensureExtension(filename, ".csv"), new Blob(["\uFEFF" + rows.map(row => row.map(escapeCSV).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
}
export function exportWorkbookToExcel(filename: string, sheets: ExportSheet[]): void {
  const workbook = XLSX.utils.book_new();
  (sheets.length ? sheets : [{ name: "Data", rows: [[]] }]).forEach((sheet, index) => {
    const ws = matrixToWorksheet(sheet.rows);
    const safeName = (sheet.name || `Sheet ${index + 1}`).replace(/[\\/?*\[\]:]/g, " ").slice(0, 31) || `Sheet ${index + 1}`;
    XLSX.utils.book_append_sheet(workbook, ws, safeName);
  });
  XLSX.writeFile(workbook, ensureExtension(filename, ".xlsx"), { compression: true });
}
export function exportMatrixToExcel(filename: string, matrix: ExportMatrix, sheetName = "Data"): void {
  exportWorkbookToExcel(filename, [{ name: sheetName, rows: matrix }]);
}
export function exportMatrixToWord(filename: string, matrix: ExportMatrix, title = "NAVILO Report"): void {
  const rows = matrix.length ? matrix : [[]];
  const table = rows.map((row, i) => `<tr>${row.map(value => i === 0 ? `<th>${escapeHtml(value)}</th>` : `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;font-size:10pt;color:#111827}h1{font-size:16pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:5px;text-align:left;vertical-align:top}th{background:#f1f5f9;font-weight:700}</style></head><body><h1>${escapeHtml(title)}</h1><table>${table}</table></body></html>`;
  downloadBlob(ensureExtension(filename, ".doc"), new Blob(["\uFEFF", html], { type: "application/msword;charset=utf-8" }));
}
export function exportToCSV(filename: string, columns: ExportColumn[], rows: Record<string, unknown>[]): void { exportMatrixToCSV(filename, [columns.map(c => c.label), ...rows.map(row => columns.map(c => row[c.key]))]); }
export function exportToExcel(filename: string, columns: ExportColumn[], rows: Record<string, unknown>[]): void { exportMatrixToExcel(filename, [columns.map(c => c.label), ...rows.map(row => columns.map(c => row[c.key]))]); }
export function exportToWord(filename: string, columns: ExportColumn[], rows: Record<string, unknown>[], title = "NAVILO Report"): void { exportMatrixToWord(filename, [columns.map(c => c.label), ...rows.map(row => columns.map(c => row[c.key]))], title); }
export function triggerPrint(selector?: string): void {
  const target = selector ? document.querySelector<HTMLElement>(selector) : document.querySelector<HTMLElement>(".print-document") || document.querySelector<HTMLElement>("[data-print-root]") || document.querySelector<HTMLElement>(".print-report");
  if (!target) { window.print(); return; }
  const stableSelector = selector || (target.id ? `#${CSS.escape(target.id)}` : target.classList.contains("print-document") ? ".print-document" : target.classList.contains("print-report") ? ".print-report" : undefined);
  window.dispatchEvent(new CustomEvent("navilo:print-preview", { detail: { selector: stableSelector, title: document.title || "NAVILO" } }));
}
