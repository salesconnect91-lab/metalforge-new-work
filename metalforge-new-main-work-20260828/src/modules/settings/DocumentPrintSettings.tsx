import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  FileText,
  Loader2,
  Save,
  X,
} from "lucide-react";
import { ErrorBanner, PageHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase";

type DocumentType =
  | "sales_invoice"
  | "purchase"
  | "work_order"
  | "receipt_payment"
  | "gate_pass"
  | "reports";

type VisibilityKey =
  | "show_company_name"
  | "show_logo"
  | "show_address"
  | "show_phone_email"
  | "show_tax_details"
  | "show_header"
  | "show_footer"
  | "show_signatures"
  | "show_print_datetime"
  | "show_page_numbers"
  | "show_previous_balance"
  | "show_closing_balance";

type VisibilityRow = {
  id?: string;
  user_id?: string;
  document_type: DocumentType;
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

const DOCUMENTS: Array<{
  type: DocumentType;
  label: string;
}> = [
  { type: "sales_invoice", label: "Sales Invoice / سیلز انوائس" },
  { type: "purchase", label: "Purchase / خریداری" },
  { type: "work_order", label: "Work Order / ورک آرڈر" },
  { type: "receipt_payment", label: "Receipt / Payment / وصولی و ادائیگی" },
  { type: "gate_pass", label: "Gate Pass / گیٹ پاس" },
  { type: "reports", label: "Reports / رپورٹس" },
];

const ELEMENTS: Array<{
  key: VisibilityKey;
  label: string;
}> = [
  { key: "show_company_name", label: "Company Name / کمپنی نام" },
  { key: "show_logo", label: "Company Logo / کمپنی لوگو" },
  { key: "show_address", label: "Address / پتہ" },
  { key: "show_phone_email", label: "Phone / Email / فون و ای میل" },
  { key: "show_tax_details", label: "NTN / STRN" },
  { key: "show_header", label: "Header / ہیڈر" },
  { key: "show_footer", label: "Footer / فوٹر" },
  { key: "show_signatures", label: "Signatures / دستخط" },
  { key: "show_print_datetime", label: "Print Date / Time / پرنٹ تاریخ و وقت" },
  { key: "show_page_numbers", label: "Page Numbers / صفحہ نمبر" },
  {
    key: "show_previous_balance",
    label: "Previous Balance / سابقہ بیلنس",
  },
  {
    key: "show_closing_balance",
    label: "Closing Balance / بقایا بیلنس",
  },
];

function defaultVisibility(document_type: DocumentType): VisibilityRow {
  return {
    document_type,
    show_company_name: true,
    show_logo: true,
    show_address: true,
    show_phone_email: true,
    show_tax_details:
      document_type !== "work_order" &&
      document_type !== "gate_pass",
    show_header: true,
    show_footer: true,
    show_signatures: document_type !== "reports",
    show_print_datetime: false,
    show_page_numbers: true,
    show_previous_balance: document_type === "receipt_payment",
    show_closing_balance: document_type === "receipt_payment",
  };
}

export default function DocumentPrintSettings() {
  const [header, setHeader] = useState("");
  const [headerUrdu, setHeaderUrdu] = useState("");
  const [footer, setFooter] = useState("");
  const [footerUrdu, setFooterUrdu] = useState("");

  const [preparedBy, setPreparedBy] = useState("Prepared By");
  const [checkedBy, setCheckedBy] = useState("Checked By");
  const [approvedBy, setApprovedBy] = useState("Approved By");

  const [pageSize, setPageSize] = useState("A4");
  const [orientation, setOrientation] = useState("portrait");

  const [matrix, setMatrix] = useState<VisibilityRow[]>(
    DOCUMENTS.map((d) => defaultVisibility(d.type))
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matrixByType = useMemo(() => {
    return Object.fromEntries(
      matrix.map((row) => [row.document_type, row])
    ) as Record<DocumentType, VisibilityRow>;
  }, [matrix]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Authentication required.");

      const [companyResult, visibilityResult] = await Promise.all([
        supabase
          .from("company_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),

        supabase
          .from("document_print_visibility")
          .select("*")
          .eq("user_id", user.id)
          .order("document_type"),
      ]);

      if (companyResult.error) throw companyResult.error;
      if (visibilityResult.error) throw visibilityResult.error;

      const company = companyResult.data;

      if (company) {
        setHeader(company.document_header || "");
        setHeaderUrdu(company.document_header_urdu || "");
        setFooter(company.document_footer || "");
        setFooterUrdu(company.document_footer_urdu || "");
        setPreparedBy(company.prepared_by_label || "Prepared By");
        setCheckedBy(company.checked_by_label || "Checked By");
        setApprovedBy(company.approved_by_label || "Approved By");
        setPageSize(company.page_size || "A4");
        setOrientation(company.page_orientation || "portrait");
      }

      let existing = (visibilityResult.data || []) as VisibilityRow[];

      // Automatically create any missing document visibility rows.
      // This keeps new users/installations fully initialized without
      // requiring manual SQL seeding.
      const missingRows = DOCUMENTS
        .filter(
          ({ type }) =>
            !existing.some((row) => row.document_type === type)
        )
        .map(({ type }) => {
          const row = defaultVisibility(type);

          return {
            user_id: user.id,
            document_type: type,
            show_company_name: row.show_company_name,
            show_logo: row.show_logo,
            show_address: row.show_address,
            show_phone_email: row.show_phone_email,
            show_tax_details: row.show_tax_details,
            show_header: row.show_header,
            show_footer: row.show_footer,
            show_signatures: row.show_signatures,
            show_print_datetime: row.show_print_datetime,
            show_page_numbers: row.show_page_numbers,
            show_previous_balance:
              row.show_previous_balance ?? false,
            show_closing_balance:
              row.show_closing_balance ?? false,
            updated_at: new Date().toISOString(),
          };
        });

      if (missingRows.length > 0) {
        const { data: createdRows, error: createError } =
          await supabase
            .from("document_print_visibility")
            .upsert(missingRows, {
              onConflict: "user_id,document_type",
            })
            .select("*");

        if (createError) throw createError;

        existing = [
          ...existing,
          ...((createdRows || []) as VisibilityRow[]),
        ];
      }

      setMatrix(
        DOCUMENTS.map(({ type }) => {
          const found = existing.find(
            (row) => row.document_type === type
          );

          return found || defaultVisibility(type);
        })
      );
    } catch (err: any) {
      setError(err?.message || "Failed to load document settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleMatrix = (
    documentType: DocumentType,
    key: VisibilityKey
  ) => {
    setMatrix((current) =>
      current.map((row) =>
        row.document_type === documentType
          ? { ...row, [key]: !row[key] }
          : row
      )
    );
  };

  const setAllForElement = (
    key: VisibilityKey,
    value: boolean
  ) => {
    setMatrix((current) =>
      current.map((row) => ({
        ...row,
        [key]: value,
      }))
    );
  };

  const setAllForDocument = (
    documentType: DocumentType,
    value: boolean
  ) => {
    setMatrix((current) =>
      current.map((row) => {
        if (row.document_type !== documentType) return row;

        return {
          ...row,
          show_company_name: value,
          show_logo: value,
          show_address: value,
          show_phone_email: value,
          show_tax_details: value,
          show_header: value,
          show_footer: value,
          show_signatures: value,
          show_print_datetime: value,
          show_page_numbers: value,
          show_previous_balance: value,
          show_closing_balance: value,
        };
      })
    );
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Authentication required.");

      const companyPayload = {
        user_id: user.id,
        document_header: header.trim() || null,
        document_header_urdu: headerUrdu.trim() || null,
        document_footer: footer.trim() || null,
        document_footer_urdu: footerUrdu.trim() || null,
        prepared_by_label: preparedBy.trim() || "Prepared By",
        checked_by_label: checkedBy.trim() || "Checked By",
        approved_by_label: approvedBy.trim() || "Approved By",
        page_size: pageSize,
        page_orientation: orientation,
        updated_at: new Date().toISOString(),
      };

      const visibilityPayload = matrix.map((row) => ({
        user_id: user.id,
        document_type: row.document_type,
        show_company_name: row.show_company_name,
        show_logo: row.show_logo,
        show_address: row.show_address,
        show_phone_email: row.show_phone_email,
        show_tax_details: row.show_tax_details,
        show_header: row.show_header,
        show_footer: row.show_footer,
        show_signatures: row.show_signatures,
        show_print_datetime: row.show_print_datetime,
        show_page_numbers: row.show_page_numbers,
        show_previous_balance:
          row.show_previous_balance ?? true,
        show_closing_balance:
          row.show_closing_balance ?? true,
        updated_at: new Date().toISOString(),
      }));

      const [companySave, visibilitySave] = await Promise.all([
        supabase
          .from("company_settings")
          .upsert(companyPayload, { onConflict: "user_id" }),

        supabase
          .from("document_print_visibility")
          .upsert(visibilityPayload, {
            onConflict: "user_id,document_type",
          })
          .select("document_type"),
      ]);

      if (companySave.error) throw companySave.error;
      if (visibilitySave.error) throw visibilitySave.error;

      const savedDocumentTypes = new Set(
        (visibilitySave.data || []).map(
          (row: { document_type: string }) => row.document_type
        )
      );

      const missingSavedTypes = DOCUMENTS.filter(
        ({ type }) => !savedDocumentTypes.has(type)
      );

      if (missingSavedTypes.length > 0) {
        throw new Error(
          `Document visibility settings were not fully saved: ${missingSavedTypes
            .map(({ type }) => type)
            .join(", ")}`
        );
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);

      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to save document settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading document settings...
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Document & Print Settings / ڈاکومنٹ اور پرنٹ سیٹنگز"
        subtitle="Control what appears on each ERP document / ہر ERP ڈاکومنٹ پر دکھائی جانے والی معلومات کنٹرول کریں"
      />

      {error && (
        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {saved && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          Document & print settings saved successfully / ڈاکومنٹ اور پرنٹ سیٹنگز کامیابی سے محفوظ ہوگئیں۔
        </div>
      )}

      <div className="mt-4 max-w-[1500px] space-y-5">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="font-bold">
                Header & Footer / ہیڈر اور فوٹر
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Common text used by enabled document types.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Area
              label="Header / ہیڈر"
              value={header}
              setValue={setHeader}
            />

            <Area
              label="Urdu Header / اردو ہیڈر"
              value={headerUrdu}
              setValue={setHeaderUrdu}
            />

            <Area
              label="Footer / فوٹر"
              value={footer}
              setValue={setFooter}
            />

            <Area
              label="Urdu Footer / اردو فوٹر"
              value={footerUrdu}
              setValue={setFooterUrdu}
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 font-bold">
            Signature Labels / دستخط لیبل
          </h2>

          <p className="mb-4 text-xs text-slate-500">
            Used only where Signatures are enabled below.
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            <Input
              label="Prepared By / تیار کردہ"
              value={preparedBy}
              setValue={setPreparedBy}
            />

            <Input
              label="Checked By / جانچ کردہ"
              value={checkedBy}
              setValue={setCheckedBy}
            />

            <Input
              label="Approved By / منظور کردہ"
              value={approvedBy}
              setValue={setApprovedBy}
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-bold">
              Page Setup / صفحہ سیٹنگ
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Default page setup for printing and PDF.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">
                Page Size / صفحہ سائز
              </label>

              <select
                className="input w-full"
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value)}
              >
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Orientation / رخ
              </label>

              <select
                className="input w-full"
                value={orientation}
                onChange={(e) => setOrientation(e.target.value)}
              >
                <option value="portrait">
                  Portrait / عمودی
                </option>

                <option value="landscape">
                  Landscape / افقی
                </option>
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-bold">
              Receipt / Payment Balance Controls / وصولی و ادائیگی بیلنس کنٹرول
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Applies to both Customer Receipts and Supplier Payments / یہ کسٹمر وصولی اور سپلائر ادائیگی دونوں پر لاگو ہوگا
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                key: "show_previous_balance" as VisibilityKey,
                label: "Previous Balance / سابقہ بیلنس",
              },
              {
                key: "show_closing_balance" as VisibilityKey,
                label: "Closing Balance / بقایا بیلنس",
              },
            ].map((item) => {
              const enabled =
                matrixByType.receipt_payment?.[item.key] ?? false;

              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
                >
                  <div>
                    <div className="font-semibold text-slate-800">
                      {item.label}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Customer Receipt + Supplier Payment
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      toggleMatrix("receipt_payment", item.key)
                    }
                    className={`inline-flex min-w-[92px] items-center justify-center gap-1.5 rounded-md border px-3 py-2 font-semibold transition ${
                      enabled
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {enabled ? (
                      <>
                        <Check className="h-4 w-4" />
                        Show
                      </>
                    ) : (
                      <>
                        <X className="h-4 w-4" />
                        Hide
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="font-bold">
              Document Visibility Matrix / ڈاکومنٹ شو ہائیڈ میٹرکس
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Click ✓ or × to control each item independently for every document.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1250px] w-full text-xs">
              <thead className="bg-slate-950 text-white">
                <tr>
                  <th className="sticky left-0 z-10 min-w-[230px] bg-slate-950 px-4 py-3 text-left font-semibold">
                    Element / عنصر
                  </th>

                  {DOCUMENTS.map((doc) => (
                    <th
                      key={doc.type}
                      className="min-w-[155px] px-3 py-3 text-center font-semibold"
                    >
                      <div>{doc.label}</div>

                      <div className="mt-2 flex justify-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setAllForDocument(doc.type, true)
                          }
                          className="rounded bg-white/10 px-2 py-1 text-[10px] hover:bg-white/20"
                        >
                          All Show
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setAllForDocument(doc.type, false)
                          }
                          className="rounded bg-white/10 px-2 py-1 text-[10px] hover:bg-white/20"
                        >
                          All Hide
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {ELEMENTS.map((element) => (
                  <tr
                    key={element.key}
                    className="hover:bg-slate-50"
                  >
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold text-slate-800">
                      <div className="flex items-center justify-between gap-3">
                        <span>{element.label}</span>

                        <span className="flex gap-1">
                          <button
                            type="button"
                            title="Show on all documents"
                            onClick={() =>
                              setAllForElement(element.key, true)
                            }
                            className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100"
                          >
                            All ✓
                          </button>

                          <button
                            type="button"
                            title="Hide on all documents"
                            onClick={() =>
                              setAllForElement(element.key, false)
                            }
                            className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100"
                          >
                            All ×
                          </button>
                        </span>
                      </div>
                    </td>

                    {DOCUMENTS.map((doc) => {
                      const enabled =
                        matrixByType[doc.type]?.[element.key] ??
                        false;

                      return (
                        <td
                          key={`${doc.type}-${element.key}`}
                          className="px-3 py-2 text-center"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              toggleMatrix(
                                doc.type,
                                element.key
                              )
                            }
                            className={`inline-flex min-w-[78px] items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 font-semibold transition ${
                              enabled
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                : "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100"
                            }`}
                          >
                            {enabled ? (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                Show
                              </>
                            ) : (
                              <>
                                <X className="h-3.5 w-3.5" />
                                Hide
                              </>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
            Changing one document does not affect the others. Uploaded company logo and details remain saved even when hidden.
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}

            Save Document Settings / محفوظ کریں
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  setValue,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">
        {label}
      </label>

      <input
        className="input w-full"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
}

function Area({
  label,
  value,
  setValue,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">
        {label}
      </label>

      <textarea
        rows={3}
        className="input w-full"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
}
