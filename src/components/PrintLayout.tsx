import { formatCurrency, formatDate } from "@/components/ui";
import { ChargeBreakdownEntry } from "@/lib/chargeTypes";

export interface PrintPartyInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface PrintItemRow {
  name: string;
  grade?: string | null;
  size?: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PrintLayoutProps {
  voucherTitle: string;
  voucherNo: string;
  voucherDate: string;
  company: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    taxId?: string;
    logoUrl?: string;
  };
  party: PrintPartyInfo;
  items: PrintItemRow[];
  chargeBreakdown: ChargeBreakdownEntry[];
  itemsTotal: number;
  chargesTotal: number;
  taxAmount?: number;
  grandTotal: number;
  extraFields?: { label: string; value: string }[];

  hawalaDocuments?: {
    id: string;
    invoiceNo: string;
    invoiceDate?: string | null;
    referenceName?: string | null;
    referenceNo?: string | null;
    referenceNotes?: string | null;
    amount: number;
  }[];

  normalInvoiceTotal?: number;
  documentNotice?: string;
  documentNoticeUrdu?: string;

  paymentSummary?: {
    previousBalance?: number;
    totalReceived?: number;
    todayReceived?: number;
    lastPaymentAmount?: number;
    lastPaymentDate?: string | null;
    lastPaymentMode?: string | null;
    currentOutstanding?: number;
  };
  bilingual?: boolean;
  signatureLabels?: string[];
  visibility?: {
    showCompanyName?: boolean;
    showLogo?: boolean;
    showAddress?: boolean;
    showPhoneEmail?: boolean;
    showTaxDetails?: boolean;
    showHeader?: boolean;
    showFooter?: boolean;
    showSignatures?: boolean;
    showPrintDatetime?: boolean;
    showPageNumbers?: boolean;
  };
  documentHeader?: string | null;
  documentHeaderUrdu?: string | null;
  documentFooter?: string | null;
  documentFooterUrdu?: string | null;
}

export default function PrintLayout({
  voucherTitle,
  voucherNo,
  voucherDate,
  company,
  party,
  items,
  chargeBreakdown,
  itemsTotal,
  chargesTotal,
  taxAmount = 0,
  grandTotal,
  extraFields,
  hawalaDocuments = [],
  normalInvoiceTotal,
  documentNotice,
  documentNoticeUrdu,
  paymentSummary,
  bilingual = true,
  signatureLabels = ["Authorized Signature / مجاز دستخط", "Customer Signature / گاہک دستخط"],
  visibility = {},
  documentHeader,
  documentHeaderUrdu,
  documentFooter,
  documentFooterUrdu,
}: PrintLayoutProps) {
  const {
    showCompanyName = true,
    showLogo = true,
    showAddress = true,
    showPhoneEmail = true,
    showTaxDetails = true,
    showHeader = true,
    showFooter = true,
    showSignatures = true,
    showPrintDatetime = false,
    showPageNumbers = true,
  } = visibility;
  return (
    <div className="print-document">
      <div className="print-page">
        {/* Header */}
        <div className="print-header">
          <div className="print-company">
            {showLogo && company.logoUrl && (
              <img
                src={company.logoUrl}
                alt="Company Logo"
                className="print-logo"
              />
            )}

            <div>
              {showCompanyName && company.name && (!showLogo || !company.logoUrl) && (
                <h1 className="print-company-name">
                  {company.name}
                </h1>
              )}

              {showAddress && company.address && (
                <p className="print-company-addr">
                  {company.address}
                </p>
              )}

              {showPhoneEmail &&
                (company.phone || company.email) && (
                  <p className="print-company-addr">
                    {[
                      company.phone
                        ? `Phone / فون: ${company.phone}`
                        : "",
                      company.email || "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}

              {showTaxDetails && company.taxId && (
                <p className="print-company-tax">
                  NTN / STRN / ٹیکس نمبر: {company.taxId}
                </p>
              )}
            </div>
          </div>
          <div className="print-voucher-title-box">
            <h2 className="print-voucher-title">
              {voucherTitle}
              {bilingual
                ? ` / ${
                    voucherTitle === "Sales Invoice"
                      ? "فروخت کا بل"
                      : voucherTitle === "Unbilled Dispatch"
                        ? "حوالہ ڈسپیچ"
                        : "دستاویز"
                  }`
                : ""}
            </h2>
          </div>
        </div>

        {showHeader &&
          (documentHeader || documentHeaderUrdu) && (
            <div
              style={{
                textAlign: "center",
                margin: "8px 0 12px",
                fontSize: "12px",
                color: "#475569",
              }}
            >
              {documentHeader && <div>{documentHeader}</div>}
              {documentHeaderUrdu && <div>{documentHeaderUrdu}</div>}
            </div>
          )}

        {(documentNotice || documentNoticeUrdu) && (
          <div
            style={{
              margin: "0 0 12px",
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              padding: "7px 10px",
              textAlign: "center",
              fontSize: "12px",
              fontWeight: 700,
              color: "#334155",
            }}
          >
            {documentNotice && <div>{documentNotice}</div>}
            {documentNoticeUrdu && <div>{documentNoticeUrdu}</div>}
          </div>
        )}

        {/* Voucher Meta */}
        <div className="print-meta">
          <div className="print-meta-col">
            <div className="print-meta-row">
              <span className="print-meta-label">{voucherTitle} No / بل نمبر:</span>
              <span className="print-meta-value">{voucherNo}</span>
            </div>
            <div className="print-meta-row">
              <span className="print-meta-label">Date / تاریخ:</span>
              <span className="print-meta-value">{formatDate(voucherDate)}</span>
            </div>
            {extraFields?.map((f) => (
              <div key={f.label} className="print-meta-row">
                <span className="print-meta-label">{f.label}:</span>
                <span className="print-meta-value">{f.value}</span>
              </div>
            ))}
          </div>
          <div className="print-meta-col">
            <div className="print-party-box">
              <div className="print-party-label">Bill To / گاہک</div>
              <div className="print-party-name">{party.name}</div>
              {party.address && <div className="print-party-addr">{party.address}</div>}
              {party.phone && <div className="print-party-phone">Phone / فون: {party.phone}</div>}
              {party.email && <div className="print-party-email">{party.email}</div>}
            </div>
          </div>
        </div>

        {/* Item Table */}
        <table className="print-table">
          <thead>
            <tr>
              <th className="print-th" style={{ width: "4%" }}>#</th>
              <th className="print-th" style={{ width: "34%" }}>Item / آئٹم</th>
              <th className="print-th" style={{ width: "12%" }}>Grade / گریڈ</th>
              <th className="print-th" style={{ width: "10%" }}>Size / سائز</th>
              <th className="print-th" style={{ width: "12%", textAlign: "right" }}>Qty / مقدار</th>
              <th className="print-th" style={{ width: "14%", textAlign: "right" }}>Rate / ریٹ</th>
              <th className="print-th" style={{ width: "14%", textAlign: "right" }}>Amount / رقم</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="print-tr">
                <td className="print-td" style={{ textAlign: "center" }}>{i + 1}</td>
                <td className="print-td" style={{ fontWeight: 500 }}>{item.name}</td>
                <td className="print-td">{item.grade ?? "—"}</td>
                <td className="print-td">{item.size ?? "—"}</td>
                <td className="print-td" style={{ textAlign: "right" }}>{item.qty}</td>
                <td className="print-td" style={{ textAlign: "right" }}>{formatCurrency(item.unitPrice)}</td>
                <td className="print-td" style={{ textAlign: "right", fontWeight: 500 }}>{formatCurrency(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {hawalaDocuments.length > 0 && (
          <div
            style={{
              marginTop: "14px",
              border: "1px solid #cbd5e1",
              borderRadius: "4px",
              overflow: "hidden",
              breakInside: "avoid",
            }}
          >
            <div
              style={{
                padding: "8px 10px",
                background: "#f1f5f9",
                borderBottom: "1px solid #cbd5e1",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>
                Unbilled Dispatch Details / حوالہ تفصیل
              </div>
              <div style={{ marginTop: "2px", fontSize: "12px", color: "#64748b" }}>
                Unbilled dispatch documents included in this Sales Invoice / اس فروخت بل میں شامل حوالہ دستاویزات
              </div>
            </div>

            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12px",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ padding: "6px", borderBottom: "1px solid #cbd5e1", textAlign: "left" }}>
                    Dispatch No. / حوالہ نمبر
                  </th>
                  <th style={{ padding: "6px", borderBottom: "1px solid #cbd5e1", textAlign: "left" }}>
                    Date / تاریخ
                  </th>
                  <th style={{ padding: "6px", borderBottom: "1px solid #cbd5e1", textAlign: "left" }}>
                    Reference Name / حوالہ نام
                  </th>
                  <th style={{ padding: "6px", borderBottom: "1px solid #cbd5e1", textAlign: "left" }}>
                    Reference No. / ریفرنس نمبر
                  </th>
                  <th style={{ padding: "6px", borderBottom: "1px solid #cbd5e1", textAlign: "right" }}>
                    Amount / رقم
                  </th>
                </tr>
              </thead>

              <tbody>
                {hawalaDocuments.map((hawala) => (
                  <tr key={hawala.id}>
                    <td style={{ padding: "6px", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>
                      {hawala.invoiceNo}
                    </td>
                    <td style={{ padding: "6px", borderBottom: "1px solid #e2e8f0" }}>
                      {hawala.invoiceDate ? formatDate(hawala.invoiceDate) : "—"}
                    </td>
                    <td style={{ padding: "6px", borderBottom: "1px solid #e2e8f0" }}>
                      {hawala.referenceName || "—"}
                    </td>
                    <td style={{ padding: "6px", borderBottom: "1px solid #e2e8f0" }}>
                      {hawala.referenceNo || "—"}
                    </td>
                    <td style={{ padding: "6px", borderBottom: "1px solid #e2e8f0", textAlign: "right", fontWeight: 600 }}>
                      {formatCurrency(hawala.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr style={{ background: "#f8fafc" }}>
                  <td
                    colSpan={4}
                    style={{ padding: "7px", textAlign: "right", fontWeight: 700 }}
                  >
                    Unbilled Dispatch Total / کل حوالہ رقم
                  </td>
                  <td style={{ padding: "7px", textAlign: "right", fontWeight: 700 }}>
                    {formatCurrency(
                      hawalaDocuments.reduce(
                        (sum, row) => sum + Number(row.amount || 0),
                        0
                      )
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Charges Breakdown + Totals */}
        <div className="print-totals-section">
          <div className="print-charges-side">
            {chargeBreakdown.length > 0 && (
              <div className="print-charges-box">
                <div className="print-charges-title">Charges Breakdown / چارجز کی تفصیل</div>
                {chargeBreakdown.map((c) => (
                  <div key={c.label} className="print-charge-row">
                    <span>{c.label}</span>
                    <span>{formatCurrency(c.amount)}</span>
                  </div>
                ))}
                <div className="print-charge-row print-charge-total">
                  <span>Charges Total / کل چارجز</span>
                  <span>{formatCurrency(chargesTotal)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="print-totals-side">
            <div className="print-total-row">
              <span>Items Total / آئٹمز کل</span>
              <span>{formatCurrency(itemsTotal)}</span>
            </div>
            <div className="print-total-row">
              <span>Charges Total / کل چارجز</span>
              <span>{formatCurrency(chargesTotal)}</span>
            </div>
            {taxAmount > 0 && (
              <div className="print-total-row">
                <span>VAT Amount / ویلیو ایڈڈ ٹیکس</span>
                <span>{formatCurrency(taxAmount)}</span>
              </div>
            )}
            {hawalaDocuments.length > 0 && (
              <>
                <div className="print-total-row">
                  <span>Normal Invoice Total / اصل انوائس رقم</span>
                  <span>
                    {formatCurrency(
                      normalInvoiceTotal ??
                        Math.max(
                          grandTotal -
                            hawalaDocuments.reduce(
                              (sum, row) => sum + Number(row.amount || 0),
                              0
                            ),
                          0
                        )
                    )}
                  </span>
                </div>

                <div className="print-total-row">
                  <span>Unbilled Dispatch Total / کل حوالہ رقم</span>
                  <span>
                    {formatCurrency(
                      hawalaDocuments.reduce(
                        (sum, row) => sum + Number(row.amount || 0),
                        0
                      )
                    )}
                  </span>
                </div>
              </>
            )}

            <div className="print-total-row print-grand-total">
              <span>Grand Total / کل رقم</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>

        {paymentSummary && (
          <div className="print-payment-summary" style={{ marginTop: "18px", border: "1px solid #cbd5e1", padding: "12px" }}>
            <div style={{ fontWeight: 700, marginBottom: "8px" }}>Payment & Balance / ادائیگی اور بقایا</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", fontSize: "12px" }}>
              <div>Previous Balance / سابقہ بقایا<br/><strong>{formatCurrency(paymentSummary.previousBalance || 0)}</strong></div>
              <div>Total Received / کل وصولی<br/><strong>{formatCurrency(paymentSummary.totalReceived || 0)}</strong></div>
              <div>Today's Received / آج کی وصولی<br/><strong>{formatCurrency(paymentSummary.todayReceived || 0)}</strong></div>
              <div>Outstanding / موجودہ بقایا<br/><strong>{formatCurrency(paymentSummary.currentOutstanding || 0)}</strong></div>
            </div>
            <div style={{ marginTop: "8px", fontSize: "12px" }}>Last Payment / آخری وصولی: <strong>{paymentSummary.lastPaymentDate ? formatDate(paymentSummary.lastPaymentDate) : "—"}</strong> · <strong>{formatCurrency(paymentSummary.lastPaymentAmount || 0)}</strong> · {paymentSummary.lastPaymentMode || "—"}</div>
          </div>
        )}

        {/* Signature Lines */}
        {showSignatures && signatureLabels.length > 0 && (
          <div className="print-signatures">
            {signatureLabels.map((label, index) => (
              <div
                key={`${label}-${index}`}
                className="print-signature-block"
              >
                <div className="print-signature-line" />
                <div className="print-signature-label">
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}

        {showFooter && (
          <div className="print-footer">
            {documentFooter && <p>{documentFooter}</p>}
            {documentFooterUrdu && <p>{documentFooterUrdu}</p>}

            {!documentFooter && !documentFooterUrdu && (
              <p>
                This is a computer-generated document. /
                یہ کمپیوٹر سے تیار کردہ دستاویز ہے۔
              </p>
            )}
          </div>
        )}

        {showPrintDatetime && (
          <div
            style={{
              marginTop: "8px",
              textAlign: "right",
              fontSize: "12px",
              color: "#94a3b8",
            }}
          >
            Printed / پرنٹ: {new Date().toLocaleString("en-PK")}
          </div>
        )}

        {showPageNumbers && (
          <div
            className="print-page-number"
            style={{
              marginTop: "4px",
              textAlign: "right",
              fontSize: "12px",
              color: "#94a3b8",
            }}
          />
        )}
      </div>
    </div>
  );
}
