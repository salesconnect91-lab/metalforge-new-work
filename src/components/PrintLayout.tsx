import { formatCurrency, formatDate } from "@/components/ui";
import { ChargeBreakdownEntry } from "@/lib/chargeTypes";
import { QRCodeSVG } from "qrcode.react";

export interface PrintPartyInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface PrintItemRow {
  name: string;
  description?: string | null;
  grade?: string | null;
  size?: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  taxPercent?: number;
  taxAmount?: number;
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
  showTaxSummary?: boolean;
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

function urduTitle(title: string) {
  if (title === "Sales Invoice") return "فروخت کا بل";
  if (title === "Cash Bill") return "نقد بل";
  if (title === "Tax Invoice") return "ٹیکس انوائس";
  if (title === "Purchase Invoice") return "خریداری انوائس";
  if (title === "Purchase Tax Invoice") return "خریداری ٹیکس انوائس";
  if (title === "Unbilled Dispatch") return "حوالہ ڈسپیچ";
  return "دستاویز";
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
  showTaxSummary = false,
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

  const itemGridClass = showTaxSummary
    ? "invoice-items-grid invoice-items-grid-tax"
    : "invoice-items-grid invoice-items-grid-no-tax";

  const qrPayload = JSON.stringify({
    company: company.name || "",
    taxId: company.taxId || "",
    documentType: voucherTitle,
    documentNo: voucherNo,
    documentDate: voucherDate,
    party: party.name,
    amount: Number(grandTotal || 0).toFixed(2),
    tax: Number(taxAmount || 0).toFixed(2),
  });

  return (
    <div className="print-document">
      <div className="print-page">
        <div className="print-header">
          <div className="print-company">
            {showLogo && company.logoUrl && (
              <img src={company.logoUrl} alt="Company Logo" className="print-logo" />
            )}
            <div>
              {showCompanyName && company.name && (!showLogo || !company.logoUrl) && (
                <h1 className="print-company-name">{company.name}</h1>
              )}
              {showAddress && company.address && <p className="print-company-addr">{company.address}</p>}
              {showPhoneEmail && (company.phone || company.email) && (
                <p className="print-company-addr">
                  {[company.phone ? `Phone / فون: ${company.phone}` : "", company.email || ""]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {showTaxDetails && company.taxId && (
                <p className="print-company-tax">NTN / STRN / ٹیکس نمبر: {company.taxId}</p>
              )}
            </div>
          </div>
          <div className="print-voucher-title-box" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "12px" }}>
            <div>
              <h2 className="print-voucher-title">
                {voucherTitle}{bilingual ? ` / ${urduTitle(voucherTitle)}` : ""}
              </h2>
              <div style={{ marginTop: "4px", textAlign: "right", fontSize: "10px", color: "#64748b" }}>
                Scan to verify / اسکین کریں
              </div>
            </div>
            <div style={{ background: "#fff", padding: "3px", lineHeight: 0, breakInside: "avoid" }}>
              <QRCodeSVG value={qrPayload} size={82} level="M" includeMargin={false} />
            </div>
          </div>
        </div>

        {showHeader && (documentHeader || documentHeaderUrdu) && (
          <div style={{ textAlign: "center", margin: "8px 0 12px", fontSize: "12px", color: "#475569" }}>
            {documentHeader && <div>{documentHeader}</div>}
            {documentHeaderUrdu && <div>{documentHeaderUrdu}</div>}
          </div>
        )}

        {(documentNotice || documentNoticeUrdu) && (
          <div style={{ margin: "0 0 12px", border: "1px solid #cbd5e1", background: "#f8fafc", padding: "7px 10px", textAlign: "center", fontSize: "12px", fontWeight: 700, color: "#334155" }}>
            {documentNotice && <div>{documentNotice}</div>}
            {documentNoticeUrdu && <div>{documentNoticeUrdu}</div>}
          </div>
        )}

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

        <div className="invoice-items-wrap">
          <div className={`${itemGridClass} invoice-items-head`}>
            <div>#</div>
            <div>Item / آئٹم</div>
            <div>Grade / گریڈ</div>
            <div>Size / سائز</div>
            <div className="invoice-num">Qty / مقدار</div>
            <div className="invoice-num">Rate / ریٹ</div>
            {showTaxSummary && <div className="invoice-num">VAT / ٹیکس</div>}
            <div className="invoice-num invoice-amount-col">Amount / رقم</div>
          </div>

          {items.map((item, i) => (
            <div key={i} className={`${itemGridClass} invoice-items-row`}>
              <div className="invoice-center">{i + 1}</div>
              <div className="invoice-item-name">
                <div>{item.name}</div>
                {item.description && <div className="invoice-item-description">{item.description}</div>}
              </div>
              <div>{item.grade ?? "—"}</div>
              <div>{item.size ?? "—"}</div>
              <div className="invoice-num">{item.qty}</div>
              <div className="invoice-num">{formatCurrency(item.unitPrice)}</div>
              {showTaxSummary && (
                <div className="invoice-num invoice-vat-col">
                  <div>{formatCurrency(item.taxAmount || 0)}</div>
                  <div className="invoice-tax-rate">{item.taxPercent || 0}%</div>
                </div>
              )}
              <div className="invoice-num invoice-amount-col">{formatCurrency(item.lineTotal)}</div>
            </div>
          ))}
        </div>

        {hawalaDocuments.length > 0 && (
          <div style={{ marginTop: "14px", border: "1px solid #cbd5e1", borderRadius: "4px", overflow: "hidden", breakInside: "avoid" }}>
            <div style={{ padding: "8px 10px", background: "#f1f5f9", borderBottom: "1px solid #cbd5e1" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>Unbilled Dispatch Details / حوالہ تفصیل</div>
              <div style={{ marginTop: "2px", fontSize: "12px", color: "#64748b" }}>Unbilled dispatch documents included in this Sales Invoice / اس فروخت بل میں شامل حوالہ دستاویزات</div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ padding: "6px", borderBottom: "1px solid #cbd5e1", textAlign: "left" }}>Dispatch No. / حوالہ نمبر</th>
                  <th style={{ padding: "6px", borderBottom: "1px solid #cbd5e1", textAlign: "left" }}>Date / تاریخ</th>
                  <th style={{ padding: "6px", borderBottom: "1px solid #cbd5e1", textAlign: "left" }}>Reference Name / حوالہ نام</th>
                  <th style={{ padding: "6px", borderBottom: "1px solid #cbd5e1", textAlign: "left" }}>Reference No. / ریفرنس نمبر</th>
                  <th style={{ padding: "6px", borderBottom: "1px solid #cbd5e1", textAlign: "right", whiteSpace: "nowrap" }}>Amount / رقم</th>
                </tr>
              </thead>
              <tbody>
                {hawalaDocuments.map((hawala) => (
                  <tr key={hawala.id}>
                    <td style={{ padding: "6px", borderBottom: "1px solid #e2e8f0", fontWeight: 600 }}>{hawala.invoiceNo}</td>
                    <td style={{ padding: "6px", borderBottom: "1px solid #e2e8f0" }}>{hawala.invoiceDate ? formatDate(hawala.invoiceDate) : "—"}</td>
                    <td style={{ padding: "6px", borderBottom: "1px solid #e2e8f0" }}>{hawala.referenceName || "—"}</td>
                    <td style={{ padding: "6px", borderBottom: "1px solid #e2e8f0" }}>{hawala.referenceNo || "—"}</td>
                    <td style={{ padding: "6px", borderBottom: "1px solid #e2e8f0", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{formatCurrency(hawala.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f8fafc" }}>
                  <td colSpan={4} style={{ padding: "7px", textAlign: "right", fontWeight: 700 }}>Unbilled Dispatch Total / کل حوالہ رقم</td>
                  <td style={{ padding: "7px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>
                    {formatCurrency(hawalaDocuments.reduce((sum, row) => sum + Number(row.amount || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="print-totals-section">
          <div className="print-charges-side">
            {chargeBreakdown.length > 0 && (
              <div className="print-charges-box">
                <div className="print-charges-title">Charges Breakdown / چارجز کی تفصیل</div>
                {chargeBreakdown.map((c) => (
                  <div key={c.label} className="print-charge-row"><span>{c.label}</span><span>{formatCurrency(c.amount)}</span></div>
                ))}
                <div className="print-charge-row print-charge-total"><span>Charges Total / کل چارجز</span><span>{formatCurrency(chargesTotal)}</span></div>
              </div>
            )}
          </div>
          <div className="print-totals-side">
            <div className="print-total-row"><span>Items Total / آئٹمز کل</span><span>{formatCurrency(itemsTotal)}</span></div>
            <div className="print-total-row"><span>Charges Total / کل چارجز</span><span>{formatCurrency(chargesTotal)}</span></div>
            {showTaxSummary && <div className="print-total-row"><span>Total VAT / کل ٹیکس</span><span>{formatCurrency(taxAmount)}</span></div>}
            {hawalaDocuments.length > 0 && (
              <>
                <div className="print-total-row"><span>Normal Invoice Total / اصل انوائس رقم</span><span>{formatCurrency(normalInvoiceTotal ?? Math.max(grandTotal - hawalaDocuments.reduce((sum, row) => sum + Number(row.amount || 0), 0), 0))}</span></div>
                <div className="print-total-row"><span>Unbilled Dispatch Total / کل حوالہ رقم</span><span>{formatCurrency(hawalaDocuments.reduce((sum, row) => sum + Number(row.amount || 0), 0))}</span></div>
              </>
            )}
            <div className="print-total-row print-grand-total"><span>Grand Total / کل رقم</span><span>{formatCurrency(grandTotal)}</span></div>
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

        {showSignatures && signatureLabels.length > 0 && (
          <div className="print-signatures">
            {signatureLabels.map((label, index) => (
              <div key={`${label}-${index}`} className="print-signature-block">
                <div className="print-signature-line" />
                <div className="print-signature-label">{label}</div>
              </div>
            ))}
          </div>
        )}

        {showFooter && (
          <div className="print-footer">
            {documentFooter && <p>{documentFooter}</p>}
            {documentFooterUrdu && <p>{documentFooterUrdu}</p>}
            {!documentFooter && !documentFooterUrdu && <p>This is a computer-generated document. / یہ کمپیوٹر سے تیار کردہ دستاویز ہے۔</p>}
          </div>
        )}

        {showPrintDatetime && (
          <div style={{ marginTop: "8px", textAlign: "right", fontSize: "12px", color: "#94a3b8" }}>
            Printed / پرنٹ: {new Date().toLocaleString("en-PK")}
          </div>
        )}

        {showPageNumbers && <div className="print-page-number" style={{ marginTop: "4px", textAlign: "right", fontSize: "12px", color: "#94a3b8" }} />}
      </div>
    </div>
  );
}
