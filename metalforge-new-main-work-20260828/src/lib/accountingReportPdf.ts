import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  loadDocumentPrintSettings,
  documentContactText,
  documentTaxText,
  documentPageFormat,
  documentOrientation,
} from "@/lib/documentPrintSettings";

interface ReportPdfOptions {
  fileName: string;
  title: string;
  subtitle?: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  summaryRows?: Array<[string, string | number]>;
}

export async function downloadAccountingReportPdf({
  fileName,
  title,
  subtitle,
  columns,
  rows,
  summaryRows = [],
}: ReportPdfOptions) {
  const settings = await loadDocumentPrintSettings("reports");
  const company = settings.company;
  const visibility = settings.visibility;

  const doc = new jsPDF({
    orientation: documentOrientation(company.page_orientation),
    unit: "mm",
    format: documentPageFormat(company.page_size),
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = 14;

  if (visibility.show_logo && company.logo_url) {
    try {
      const response = await fetch(company.logo_url);
      const blob = await response.blob();

      if (!blob.type.includes("svg")) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        doc.addImage(
          dataUrl,
          blob.type.includes("jpeg") ? "JPEG" : "PNG",
          margin,
          y,
          22,
          16,
        );
      }
    } catch {
      // PDF continues without logo if browser/image format cannot be rendered.
    }
  }

  if (visibility.show_company_name) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(company.company_name || "Company", pageWidth / 2, y + 5, {
      align: "center",
    });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  if (visibility.show_address && company.address) {
    y += 10;
    doc.text(company.address, pageWidth / 2, y, { align: "center" });
  }

  if (visibility.show_phone_email) {
    const contact = documentContactText(company);
    if (contact) {
      y += 4.5;
      doc.text(contact, pageWidth / 2, y, { align: "center" });
    }
  }

  if (visibility.show_tax_details) {
    const tax = documentTaxText(company);
    if (tax) {
      y += 4.5;
      doc.text(tax, pageWidth / 2, y, { align: "center" });
    }
  }

  if (visibility.show_header && company.document_header) {
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text(company.document_header, pageWidth / 2, y, { align: "center" });
  }

  y += 8;
  doc.setDrawColor(180);
  doc.line(margin, y, pageWidth - margin, y);

  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, pageWidth / 2, y, { align: "center" });

  if (subtitle) {
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(subtitle, pageWidth / 2, y, { align: "center" });
  }

  y += 6;

  autoTable(doc, {
    startY: y,
    head: [columns],
    body: rows,
    theme: "grid",
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      overflow: "linebreak",
    },
    headStyles: {
      fontStyle: "bold",
    },
    margin: {
      left: margin,
      right: margin,
      bottom: 26,
    },
  });

  const tableEnd =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
    y;

  let summaryY = tableEnd + 7;

  if (summaryRows.length > 0) {
    doc.setFontSize(9);

    for (const [label, value] of summaryRows) {
      if (summaryY > pageHeight - 35) {
        doc.addPage();
        summaryY = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.text(String(label), margin, summaryY);

      doc.setFont("helvetica", "normal");
      doc.text(String(value), pageWidth - margin, summaryY, { align: "right" });

      summaryY += 6;
    }
  }

  if (visibility.show_signatures) {
    if (summaryY > pageHeight - 38) {
      doc.addPage();
      summaryY = 30;
    } else {
      summaryY += 18;
    }

    const labels = [
      company.prepared_by_label || "Prepared By",
      company.checked_by_label || "Checked By",
      company.approved_by_label || "Approved By",
    ];

    const usableWidth = pageWidth - margin * 2;
    const sectionWidth = usableWidth / 3;

    labels.forEach((label, index) => {
      const x1 = margin + sectionWidth * index;
      const center = x1 + sectionWidth / 2;

      doc.line(x1 + 4, summaryY, x1 + sectionWidth - 4, summaryY);
      doc.setFontSize(8);
      doc.text(label, center, summaryY + 5, { align: "center" });
    });
  }

  const pages = doc.getNumberOfPages();

  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);

    if (visibility.show_footer && company.document_footer) {
      doc.text(
        company.document_footer,
        pageWidth / 2,
        pageHeight - 12,
        { align: "center" },
      );
    }

    if (visibility.show_print_datetime) {
      doc.text(
        `Printed: ${new Date().toLocaleString("en-PK")}`,
        margin,
        pageHeight - 6,
      );
    }

    if (visibility.show_page_numbers) {
      doc.text(
        `Page ${page} of ${pages}`,
        pageWidth - margin,
        pageHeight - 6,
        { align: "right" },
      );
    }
  }

  doc.save(fileName);
}
