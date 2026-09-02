import { supabase } from "@/lib/supabase";

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
};

export async function loadDocumentPrintSettings(
  documentType: DocumentType
): Promise<{
  company: CompanyDocumentSettings;
  visibility: DocumentVisibility;
}> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error(
      "Authentication required to load document settings."
    );
  }

  const [companyResult, visibilityResult] =
    await Promise.all([
      supabase
        .from("company_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),

      supabase
        .from("document_print_visibility")
        .select("*")
        .eq("user_id", user.id)
        .eq("document_type", documentType)
        .maybeSingle(),
    ]);

  if (companyResult.error) {
    throw companyResult.error;
  }

  if (visibilityResult.error) {
    throw visibilityResult.error;
  }

  return {
    company:
      (companyResult.data ??
        {}) as CompanyDocumentSettings,

    visibility: {
      ...DEFAULT_DOCUMENT_VISIBILITY,
      ...(visibilityResult.data ?? {}),
    },
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
