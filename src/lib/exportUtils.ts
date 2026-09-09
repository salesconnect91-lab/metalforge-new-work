import * as XLSX from "xlsx";

export interface ExportColumn {
  key: string;
  label: string;
}

export function exportToCSV(filename: string, columns: ExportColumn[], rows: Record<string, unknown>[]): void {
  const header = columns.map((c) => escapeCSV(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCSV(String(row[c.key] ?? ""))).join(",")).join("\n");
  downloadTextFile(ensureExtension(filename, ".csv"), `${header}\n${body}`, "text/csv;charset=utf-8;");
}

export function exportToExcel(filename: string, columns: ExportColumn[], rows: Record<string, unknown>[]): void {
  const data = [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => normalizeExcelValue(row[column.key]))),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  worksheet["!cols"] = columns.map((_column, index) => {
    const values = data.map((row) => String(row[index] ?? ""));
    const width = Math.min(40, Math.max(12, ...values.map((value) => value.length + 2)));
    return { wch: width };
  });
  worksheet["!autofilter"] = { ref: worksheet["!ref"] || `A1:A${Math.max(1, data.length)}` };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  XLSX.writeFile(workbook, ensureExtension(filename, ".xlsx"), { compression: true });
}

function normalizeExcelValue(value: unknown): string | number | boolean {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function ensureExtension(filename: string, extension: string): string {
  const trimmed = filename.trim() || `NAVILO_Export${extension}`;
  return trimmed.toLowerCase().endsWith(extension) ? trimmed : `${trimmed.replace(/\.[^.]+$/, "")}${extension}`;
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadTextFile(filename: string, content: string, mimeType: string): void {
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

export function triggerPrint(selector?: string): void {
  const target = selector
    ? document.querySelector<HTMLElement>(selector)
    : document.querySelector<HTMLElement>(".print-document") ||
      document.querySelector<HTMLElement>("[data-print-root]") ||
      document.querySelector<HTMLElement>(".print-report");

  if (!target) {
    window.print();
    return;
  }

  const stableSelector = selector ||
    (target.id ? `#${CSS.escape(target.id)}` : target.classList.contains("print-document") ? ".print-document" : target.classList.contains("print-report") ? ".print-report" : undefined);

  window.dispatchEvent(new CustomEvent("navilo:print-preview", {
    detail: {
      selector: stableSelector,
      title: document.title || "NAVILO",
    },
  }));
}
