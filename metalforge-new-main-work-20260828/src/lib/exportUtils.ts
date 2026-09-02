export interface ExportColumn {
  key: string;
  label: string;
}

export function exportToCSV(
  filename: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
): void {
  const header = columns.map((c) => escapeCSV(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCSV(String(row[c.key] ?? ""))).join(","))
    .join("\n");
  const csv = `${header}\n${body}`;
  downloadFile(filename, csv, "text/csv;charset=utf-8;");
}

export function exportToExcel(
  filename: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
): void {
  const header = columns.map((c) => `<th>${escapeXML(c.label)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${columns.map((c) => `<td>${escapeXML(String(row[c.key] ?? ""))}</td>`).join("")}</tr>`,
    )
    .join("");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  downloadFile(filename, html, "application/vnd.ms-excel;charset=utf-8;");
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeXML(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

export function triggerPrint(): void {
  window.print();
}