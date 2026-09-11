import { supabase } from "@/lib/supabase";

export type PrintTemplateKey = "standard" | "compact" | "executive" | "letterhead";

export const PRINT_TEMPLATES: Array<{
  key: PrintTemplateKey;
  label: string;
  description: string;
}> = [
  { key: "standard", label: "Standard", description: "Balanced professional layout for everyday ERP documents." },
  { key: "compact", label: "Compact", description: "Denser layout for high-line-count invoices and operational documents." },
  { key: "executive", label: "Executive", description: "Stronger hierarchy and totals emphasis for customer-facing documents." },
  { key: "letterhead", label: "Letterhead", description: "Cleaner top area for companies using branded letterhead/logo stationery." },
];

export type CompanyDocumentSettings = {
  company_name?: string | null;
  company_name_urdu?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  ntn?: string | null;
  strn?: string | null;
  logo_url?: string | null;

  document_header?: string | null;
  document_header_urdu?: string | null;
  document_footer?: string | null;
  document_footer_urdu?: string | null;

  prepared_by_label?: string | null;
  checked_by_label?: string | null;
  approved_by_label?: string | null;

  page_size?: string | null;
  page_orientation?: string | null;
};

export type DocumentVisibility = {
  show_company_name: boolean;
  show_logo: boolean;
  show_address: boolean;
  show_phone_email: boolean;
  show_tax_details: boolean;
  show_header: boolean;
  show_footer: boolean;
  show_signatures: boolean;
  show_print_datetime: boolean;
  show_page_numbers: boolean;
  show_previous_balance: boolean;
  show_closing_balance: boolean;
  show_qr_code: boolean;
  template_key: PrintTemplateKey;
};

export type DocumentType =
  | "sales_invoice"
  | "purchase"
  | "work_order"
  | "receipt_payment"
  | "gate_pass"
  | "reports";

export const DEFAULT_DOCUMENT_VISIBILITY: DocumentVisibility = {
  show_company_name: true,
  show_logo: true,
  show_address: true,
  show_phone_email: true,
  show_tax_details: true,
  show_header: true,
  show_footer: true,
  show_signatures: true,
  show_print_datetime: false,
  show_page_numbers: true,
  show_previous_balance: true,
  show_closing_balance: true,
  show_qr_code: true,
  template_key: "standard",
};

const RUNTIME_TEMPLATE_STYLE_ID = "navilo-runtime-print-template";

function templateCss(template: PrintTemplateKey) {
  if (template === "compact") {
    return `
      .navilo-live-preview,.navilo-print-output{font-size:7.7pt!important;line-height:1.18!important}
      .navilo-live-preview .print-header,.navilo-print-output .print-header{gap:5mm!important;margin-bottom:2mm!important;padding-bottom:2mm!important}
      .navilo-live-preview .print-logo,.navilo-print-output .print-logo{height:13mm!important;max-height:13mm!important}
      .navilo-live-preview .print-company-name,.navilo-print-output .print-company-name{font-size:13pt!important}
      .navilo-live-preview .print-voucher-title,.navilo-print-output .print-voucher-title{font-size:11.5pt!important}
      .navilo-live-preview .print-meta,.navilo-print-output .print-meta{gap:2mm!important;margin-bottom:2mm!important}
      .navilo-live-preview .print-meta-col,.navilo-live-preview .print-party-box,.navilo-print-output .print-meta-col,.navilo-print-output .print-party-box{padding:1.4mm!important}
      .navilo-live-preview .invoice-items-grid>div,.navilo-print-output .invoice-items-grid>div{padding:1.1mm .9mm!important;font-size:6.6pt!important}
      .navilo-live-preview .print-totals-section,.navilo-print-output .print-totals-section{margin-top:2mm!important;gap:3mm!important}
      .navilo-live-preview .print-signatures,.navilo-print-output .print-signatures{margin-top:5mm!important}
      .navilo-live-preview .print-footer,.navilo-print-output .print-footer{margin-top:2.5mm!important;padding-top:1.5mm!important}
      .navilo-generic-report table th,.navilo-generic-report table td{padding:3px 5px!important;font-size:7.2pt!important}
    `;
  }

  if (template === "executive") {
    return `
      .navilo-live-preview .print-header,.navilo-print-output .print-header{border-bottom:2px solid #0f172a!important;padding-bottom:4mm!important;margin-bottom:4mm!important}
      .navilo-live-preview .print-logo,.navilo-print-output .print-logo{height:18mm!important;max-height:18mm!important}
      .navilo-live-preview .print-company-name,.navilo-print-output .print-company-name{font-size:17pt!important;letter-spacing:-.2px!important}
      .navilo-live-preview .print-voucher-title-box,.navilo-print-output .print-voucher-title-box{padding-left:4mm!important;border-left:2px solid #cbd5e1!important}
      .navilo-live-preview .print-voucher-title,.navilo-print-output .print-voucher-title{font-size:14pt!important}
      .navilo-live-preview .invoice-items-head,.navilo-print-output .invoice-items-head{background:#e2e8f0!important;border-top:1px solid #94a3b8!important}
      .navilo-live-preview .print-totals-side,.navilo-print-output .print-totals-side{border:2px solid #64748b!important;background:#f8fafc!important}
      .navilo-live-preview .print-grand-total,.navilo-print-output .print-grand-total{font-size:10pt!important;border-top:2px solid #0f172a!important}
      .navilo-generic-report .navilo-report-header{border-bottom:2px solid #0f172a!important;padding-bottom:10px!important}
      .navilo-generic-report .navilo-report-title{font-size:18pt!important}
      .navilo-generic-report table thead{background:#e2e8f0!important}
    `;
  }

  if (template === "letterhead") {
    return `
      .navilo-live-preview .print-header,.navilo-print-output .print-header{border-bottom:0!important;padding-bottom:2mm!important;margin-bottom:5mm!important}
      .navilo-live-preview .print-logo,.navilo-print-output .print-logo{height:20mm!important;max-height:20mm!important;max-width:75mm!important}
      .navilo-live-preview .print-company-name,.navilo-print-output .print-company-name{font-size:16pt!important}
      .navilo-live-preview .print-voucher-title-box,.navilo-print-output .print-voucher-title-box{padding-top:2mm!important}
      .navilo-live-preview .print-meta,.navilo-print-output .print-meta{border-top:1px solid #cbd5e1!important;padding-top:3mm!important}
      .navilo-live-preview .invoice-items-head,.navilo-print-output .invoice-items-head{background:#fff!important;border-top:1.5px solid #0f172a!important;border-bottom:1.5px solid #0f172a!important}
      .navilo-live-preview .print-footer,.navilo-print-output .print-footer{border-top:0!important;margin-top:6mm!important}
      .navilo-generic-report .navilo-report-header{border-bottom:0!important;margin-bottom:16px!important}
      .navilo-generic-report table{border-top:1.5px solid #0f172a!important}
    `;
  }

  return "";
}

export function normalizePrintTemplate(value?: string | null): PrintTemplateKey {
  return value === "compact" || value === "executive" || value === "letterhead" ? value : "standard";
}

export function applyDocumentPrintTemplate(template?: string | null) {
  if (typeof document === "undefined") return;
  const normalized = normalizePrintTemplate(template);
  document.documentElement.dataset.printTemplate = normalized;
  let style = document.getElementById(RUNTIME_TEMPLATE_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = RUNTIME_TEMPLATE_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = templateCss(normalized);
}

export async function loadDocumentPrintSettings(
  documentType: DocumentType
): Promise<{
  company: CompanyDocumentSettings;
  visibility: DocumentVisibility;
}> {
  // Company scoping is enforced by current_company_id() + RLS.
  // Do not filter by the logged-in user's legacy user_id: multiple users can
  // work inside the same company and must share the same print configuration.
  const [companyResult, visibilityResult] = await Promise.all([
    supabase
      .from("company_settings")
      .select("*")
      .maybeSingle(),

    supabase
      .from("document_print_visibility")
      .select("*")
      .eq("document_type", documentType)
      .maybeSingle(),
  ]);

  if (companyResult.error) {
    throw companyResult.error;
  }

  if (visibilityResult.error) {
    throw visibilityResult.error;
  }

  const visibility = {
    ...DEFAULT_DOCUMENT_VISIBILITY,
    ...(visibilityResult.data ?? {}),
    template_key: normalizePrintTemplate((visibilityResult.data as any)?.template_key),
  } as DocumentVisibility;

  applyDocumentPrintTemplate(visibility.template_key);

  return {
    company: (companyResult.data ?? {}) as CompanyDocumentSettings,
    visibility,
  };
}

export function documentTaxText(
  company: CompanyDocumentSettings
) {
  return [
    company.ntn ? `NTN: ${company.ntn}` : "",
    company.strn ? `STRN: ${company.strn}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

export function documentContactText(
  company: CompanyDocumentSettings
) {
  return [
    company.phone ? `Phone: ${company.phone}` : "",
    company.email ? `Email: ${company.email}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

export function documentPageFormat(
  pageSize?: string | null
): "a4" | "letter" {
  return String(pageSize || "")
    .toLowerCase()
    .includes("letter")
    ? "letter"
    : "a4";
}

export function documentOrientation(
  orientation?: string | null
): "portrait" | "landscape" {
  return String(orientation || "")
    .toLowerCase()
    .includes("landscape")
    ? "landscape"
    : "portrait";
}
