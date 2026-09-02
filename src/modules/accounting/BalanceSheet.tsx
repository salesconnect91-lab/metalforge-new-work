import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  loadDocumentPrintSettings,
  documentContactText,
  documentTaxText,
} from "@/lib/documentPrintSettings";
import { ErrorBanner, formatCurrency } from "@/components/ui";
import { Printer, FileSpreadsheet, RefreshCw } from "lucide-react";
import { downloadAccountingReportPdf } from "@/lib/accountingReportPdf";

interface BSItem {
  name: string;
  amount: number;
  parentHead?: string;
  detailType?: string;
}

interface BSSection {
  total: number;
  items: BSItem[];
}

interface BSGroup {
  head: string;
  total: number;
  items: BSItem[];
}

function getLocalToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatReportDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function normalizedDetailType(value?: string) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function balanceSheetAccountName(
  type: string,
  accountName: string,
  detailType?: string
) {
  const detail = normalizedDetailType(detailType);

  if (type === "asset" && detail === "accountsreceivable") {
    return "Accounts Receivable (Total)";
  }

  if (type === "liability" && detail === "accountspayable") {
    return "Accounts Payable (Total)";
  }

  return accountName;
}

function professionalParentHead(
  type: string,
  accountName: string,
  detailType?: string,
  configuredHead?: string
) {
  const text = normalizedDetailType(
    `${accountName} ${detailType ?? ""} ${configuredHead ?? ""}`
  );

  if (type === "asset") {
    const isNonCurrent = [
      "noncurrent",
      "fixedasset",
      "machinery",
      "equipment",
      "building",
      "land",
      "vehicle",
      "furniture",
      "accumulateddepreciation",
    ].some((keyword) => text.includes(keyword));

    return isNonCurrent ? "Non-Current Assets" : "Current Assets";
  }

  if (type === "liability") {
    const isNonCurrent = [
      "noncurrent",
      "longterm",
      "termloan",
      "deferredtax",
    ].some((keyword) => text.includes(keyword));

    return isNonCurrent
      ? "Non-Current Liabilities"
      : "Current Liabilities";
  }

  return "Capital & Reserves";
}

function groupItems(items: BSItem[], preferredOrder: string[]): BSGroup[] {
  const groups = new Map<string, BSItem[]>();

  items.forEach((item) => {
    const head = item.parentHead || "Other";
    groups.set(head, [...(groups.get(head) ?? []), item]);
  });

  return Array.from(groups.entries())
    .map(([head, group]) => ({
      head,
      items: [...group].sort((a, b) => a.name.localeCompare(b.name)),
      total: group.reduce((sum, item) => sum + item.amount, 0),
    }))
    .sort((a, b) => {
      const aIndex = preferredOrder.indexOf(a.head);
      const bIndex = preferredOrder.indexOf(b.head);
      if (aIndex === -1 && bIndex === -1) return a.head.localeCompare(b.head);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
}

function StatementSection({
  title,
  groups,
  totalLabel,
  total,
  totalColor,
  showTotalFooter = true,
}: {
  title: string;
  groups: BSGroup[];
  totalLabel: string;
  total: number;
  totalColor: string;
  showTotalFooter?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
        <h3 className="text-sm font-bold uppercase tracking-[0.12em]">{title}</h3>
      </div>

      {groups.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400">
          No balances found.
        </div>
      ) : (
        <div>
          {groups.map((group) => (
            <div key={group.head} className="border-b border-slate-200 last:border-b-0">
              <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  {group.head}
                </h4>
                <span className="font-mono text-xs font-semibold text-slate-700">
                  {formatCurrency(group.total)}
                </span>
              </div>

              <div className="divide-y divide-slate-100 px-4">
                {group.items.map((item) => (
                  <div
                    key={`${group.head}-${item.name}`}
                    className="flex items-center justify-between gap-4 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">
                        {item.name}
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {item.detailType || "General"}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 font-mono font-semibold ${
                        item.amount < 0 ? "text-rose-600" : "text-slate-900"
                      }`}
                    >
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showTotalFooter && (
        <div className="flex items-center justify-between border-t-2 border-slate-900 bg-slate-50 px-4 py-3">
          <span className="text-sm font-bold uppercase tracking-wide text-slate-900">
            {totalLabel}
          </span>
          <span className={`font-mono text-base font-bold ${totalColor}`}>
            {formatCurrency(total)}
          </span>
        </div>
      )}
    </section>
  );
}

export default function BalanceSheet() {
  const [assets, setAssets] = useState<BSSection>({ total: 0, items: [] });
  const [liabilities, setLiabilities] = useState<BSSection>({ total: 0, items: [] });
  const [equity, setEquity] = useState<BSSection>({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportPrintSettings, setReportPrintSettings] = useState<any>(null);
  const [asOfDate, setAsOfDate] = useState(getLocalToday);
  const [hideZeroBalances, setHideZeroBalances] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchBalanceSheet = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [accountsRes, ledgerRes] = await Promise.all([
      supabase
        .from("chart_of_accounts")
        .select("id, code, name, type, parent_head, detail_type, is_group, allow_manual_entries, is_active"),
      supabase
        .from("ledgers")
        .select("account_id, entry_date, debit, credit")
        .lte("entry_date", asOfDate),
    ]);

    if (accountsRes.error || ledgerRes.error) {
      setError(accountsRes.error?.message ?? ledgerRes.error?.message ?? "Unable to load balance sheet.");
      setLoading(false);
      return;
    }

    const accounts = accountsRes.data ?? [];
    const ledgerLines = ledgerRes.data ?? [];

    const accountMetaMap: Record<
      string,
      {
        name: string;
        type: string;
        parentHead: string;
        detailType: string;
        isGroup: boolean;
        allowManualEntries: boolean;
        isActive: boolean;
      }
    > = {};

    accounts.forEach((acc) => {
      const type = acc.type?.toLowerCase() || "";
      accountMetaMap[acc.id] = {
        name: `${acc.code} - ${acc.name}`,
        type,
        parentHead: professionalParentHead(
          type,
          `${acc.code} - ${acc.name}`,
          acc.detail_type,
          acc.parent_head
        ),
        detailType: acc.detail_type || "General",
        isGroup: Boolean(acc.is_group),
        allowManualEntries: Boolean(acc.allow_manual_entries),
        isActive: acc.is_active !== false,
      };
    });

    const assetMap: { [key: string]: { amount: number; parentHead: string; detailType: string } } = {};
    const liabilityMap: { [key: string]: { amount: number; parentHead: string; detailType: string } } = {};
    const equityMap: { [key: string]: { amount: number; parentHead: string; detailType: string } } = {};
    let totalRevenue = 0;
    let totalExpenses = 0;

    // Preload all Balance Sheet accounts so the user can optionally show
    // accounts that currently have a zero balance.
    accounts.forEach((acc) => {
      const meta = accountMetaMap[acc.id];
      if (!meta) return;

      const target =
        meta.type === "asset"
          ? assetMap
          : meta.type === "liability"
            ? liabilityMap
            : meta.type === "equity"
              ? equityMap
              : null;
      const displayName = balanceSheetAccountName(
        meta.type,
        meta.name,
        meta.detailType
      );

      if (
        target &&
        !meta.isGroup &&
        meta.allowManualEntries &&
        meta.isActive &&
        !target[displayName]
      ) {
        target[displayName] = {
          amount: 0,
          parentHead: meta.parentHead,
          detailType: meta.detailType,
        };
      }
    });

    ledgerLines.forEach((line) => {
      const meta = accountMetaMap[line.account_id];
      if (!meta) return;

      const type = meta.type;
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);
      const accountName = balanceSheetAccountName(
        meta.type,
        meta.name,
        meta.detailType
      );

      if (type === "asset") {
        const net = debit - credit;
        if (!assetMap[accountName]) {
          assetMap[accountName] = { amount: 0, parentHead: meta.parentHead, detailType: meta.detailType };
        }
        assetMap[accountName].amount += net;
      } else if (type === "liability") {
        const net = credit - debit;
        if (!liabilityMap[accountName]) {
          liabilityMap[accountName] = { amount: 0, parentHead: meta.parentHead, detailType: meta.detailType };
        }
        liabilityMap[accountName].amount += net;
      } else if (type === "equity") {
        const net = credit - debit;
        if (!equityMap[accountName]) {
          equityMap[accountName] = { amount: 0, parentHead: meta.parentHead, detailType: meta.detailType };
        }
        equityMap[accountName].amount += net;
      } else if (type === "revenue") {
        totalRevenue += credit - debit;
      } else if (type === "expense") {
        totalExpenses += debit - credit;
      }
    });

    const currentProfitOrLoss = totalRevenue - totalExpenses;
    if (Math.abs(currentProfitOrLoss) >= 0.005) {
      equityMap["Current Profit / (Loss)"] = {
        amount: currentProfitOrLoss,
        parentHead: "Capital & Reserves",
        detailType: "Current Earnings",
      };
    }

    // Professional presentation reclassifications. These do not alter ledger
    // entries; they only place abnormal control balances on the correct side.
    Object.entries(assetMap).forEach(([name, item]) => {
      const detail = normalizedDetailType(`${name} ${item.detailType ?? ""}`);

      if (item.amount < -0.005 && detail.includes("accountsreceivable")) {
        liabilityMap["Customer Advances"] = {
          amount: (liabilityMap["Customer Advances"]?.amount ?? 0) + Math.abs(item.amount),
          parentHead: "Current Liabilities",
          detailType: "Customer Credit Balances",
        };
        delete assetMap[name];
      } else if (
        item.amount < -0.005 &&
        (detail.includes("bankaccount") || detail.includes("bankbalance"))
      ) {
        liabilityMap["Bank Overdraft"] = {
          amount: (liabilityMap["Bank Overdraft"]?.amount ?? 0) + Math.abs(item.amount),
          parentHead: "Current Liabilities",
          detailType: "Bank Overdraft",
        };
        delete assetMap[name];
      }
    });

    Object.entries(liabilityMap).forEach(([name, item]) => {
      const detail = normalizedDetailType(`${name} ${item.detailType ?? ""}`);

      if (item.amount < -0.005 && detail.includes("accountspayable")) {
        assetMap["Supplier Advances"] = {
          amount: (assetMap["Supplier Advances"]?.amount ?? 0) + Math.abs(item.amount),
          parentHead: "Current Assets",
          detailType: "Supplier Debit Balances",
        };
        delete liabilityMap[name];
      }
    });

    const assetList: BSItem[] = Object.keys(assetMap).map((k) => ({
      name: k,
      amount: assetMap[k].amount,
      parentHead: assetMap[k].parentHead,
      detailType: assetMap[k].detailType
    })).filter((item) => !hideZeroBalances || Math.abs(item.amount) >= 0.005);

    const liabilityList: BSItem[] = Object.keys(liabilityMap).map((k) => ({
      name: k,
      amount: liabilityMap[k].amount,
      parentHead: liabilityMap[k].parentHead,
      detailType: liabilityMap[k].detailType
    })).filter((item) => !hideZeroBalances || Math.abs(item.amount) >= 0.005);

    const equityList: BSItem[] = Object.keys(equityMap).map((k) => ({
      name: k,
      amount: equityMap[k].amount,
      parentHead: equityMap[k].parentHead,
      detailType: equityMap[k].detailType
    })).filter((item) => !hideZeroBalances || Math.abs(item.amount) >= 0.005);

    const totalAssets = assetList.reduce((sum, i) => sum + i.amount, 0);
    const totalLiabilities = liabilityList.reduce((sum, i) => sum + i.amount, 0);
    const totalEquity = equityList.reduce((sum, i) => sum + i.amount, 0);

    setAssets({ total: totalAssets, items: assetList });
    setLiabilities({ total: totalLiabilities, items: liabilityList });
    setEquity({ total: totalEquity, items: equityList });
    setLastUpdated(new Date());
    setLoading(false);
  }, [asOfDate, hideZeroBalances]);

  useEffect(() => {
    void loadDocumentPrintSettings("reports")
      .then(setReportPrintSettings)
      .catch(() => setReportPrintSettings(null));
  }, []);

  useEffect(() => {
    fetchBalanceSheet();
  }, [fetchBalanceSheet]);

  const totalLiabilitiesAndEquity = liabilities.total + equity.total;
  const equationDifference = assets.total - totalLiabilitiesAndEquity;
  const isBalanced = Math.abs(equationDifference) < 0.01;
  const assetGroups = groupItems(assets.items, [
    "Current Assets",
    "Non-Current Assets",
  ]);
  const liabilityGroups = groupItems(liabilities.items, [
    "Current Liabilities",
    "Non-Current Liabilities",
  ]);
  const equityGroups = groupItems(equity.items, ["Capital & Reserves"]);
  const negativeInventoryItems = assets.items.filter(
    (item) =>
      normalizedDetailType(`${item.name} ${item.detailType ?? ""}`).includes(
        "inventory"
      ) && item.amount < -0.005
  );

  const handlePrint = () => {
    window.print();
  };

  const handlePdf = async () => {
    try {
      const pdfRows: Array<Array<string | number>> = [];

      assets.items.forEach((item) => {
        pdfRows.push([
          "Asset",
          item.parentHead || "",
          item.detailType || "",
          item.name,
          item.amount.toFixed(2),
        ]);
      });

      liabilities.items.forEach((item) => {
        pdfRows.push([
          "Liability",
          item.parentHead || "",
          item.detailType || "",
          item.name,
          item.amount.toFixed(2),
        ]);
      });

      equity.items.forEach((item) => {
        pdfRows.push([
          "Equity",
          item.parentHead || "",
          item.detailType || "",
          item.name,
          item.amount.toFixed(2),
        ]);
      });

      await downloadAccountingReportPdf({
        fileName: `Balance_Sheet_${asOfDate}.pdf`,
        title: "Balance Sheet",
        subtitle: `As of ${formatReportDate(asOfDate)}`,
        columns: [
          "Category",
          "Parent Head",
          "Detail Type",
          "Account",
          "Amount (PKR)",
        ],
        rows: pdfRows,
        summaryRows: [
          ["Total Assets", assets.total.toFixed(2)],
          ["Total Liabilities", liabilities.total.toFixed(2)],
          ["Total Equity", equity.total.toFixed(2)],
          ["Liabilities + Equity", totalLiabilitiesAndEquity.toFixed(2)],
          ["Status", isBalanced ? "Balanced" : "Difference"],
          ["Difference", equationDifference.toFixed(2)],
        ],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create Balance Sheet PDF.");
    }
  };

  const handleExportExcel = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += `"Balance Sheet As Of","${formatReportDate(asOfDate)}"\r\n`;
    csvContent += `"Accounting Equation","${isBalanced ? "Balanced" : "Difference"}"\r\n`;
    csvContent += `"Difference","${equationDifference.toFixed(2)}"\r\n\r\n`;
    csvContent += "Category,Parent Head,Detail Type,Account Name,Amount (PKR)\r\n";

    assets.items.forEach((item) => {
      csvContent += `"Asset","${item.parentHead}","${item.detailType}","${item.name}",${item.amount}\r\n`;
    });
    csvContent += `"Total Assets","","",${assets.total}\r\n`;

    liabilities.items.forEach((item) => {
      csvContent += `"Liability","${item.parentHead}","${item.detailType}","${item.name}",${item.amount}\r\n`;
    });
    csvContent += `"Total Liabilities","","",${liabilities.total}\r\n`;

    equity.items.forEach((item) => {
      csvContent += `"Equity","${item.parentHead}","${item.detailType}","${item.name}",${item.amount}\r\n`;
    });
    csvContent += `"Total Equity","","",${equity.total}\r\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Balance_Sheet_${asOfDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-balance-sheet, #printable-balance-sheet * {
            visibility: visible;
          }
          #printable-balance-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div id="printable-balance-sheet" className="space-y-6">
        {reportPrintSettings && (
          <div className="hidden print:block border-b border-slate-300 pb-4 text-center">
            {reportPrintSettings.visibility.show_logo &&
              reportPrintSettings.company.logo_url && (
                <img
                  src={reportPrintSettings.company.logo_url}
                  alt="Company Logo"
                  className="mx-auto mb-2 max-h-16 max-w-40 object-contain"
                />
              )}

            {reportPrintSettings.visibility.show_company_name && (
              <div className="text-xl font-bold">
                {reportPrintSettings.company.company_name}
              </div>
            )}

            {reportPrintSettings.visibility.show_address &&
              reportPrintSettings.company.address && (
                <div className="mt-1 text-xs">
                  {reportPrintSettings.company.address}
                </div>
              )}

            {reportPrintSettings.visibility.show_phone_email &&
              documentContactText(reportPrintSettings.company) && (
                <div className="mt-1 text-xs">
                  {documentContactText(reportPrintSettings.company)}
                </div>
              )}

            {reportPrintSettings.visibility.show_tax_details &&
              documentTaxText(reportPrintSettings.company) && (
                <div className="mt-1 text-xs">
                  {documentTaxText(reportPrintSettings.company)}
                </div>
              )}

            {reportPrintSettings.visibility.show_header &&
              (reportPrintSettings.company.document_header ||
                reportPrintSettings.company.document_header_urdu) && (
                <div className="mt-2 text-xs font-medium">
                  {reportPrintSettings.company.document_header}
                  {reportPrintSettings.company.document_header_urdu && (
                    <div>{reportPrintSettings.company.document_header_urdu}</div>
                  )}
                </div>
              )}
          </div>
        )}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Balance Sheet / بیلنس شیٹ</h1>
            <p className="text-sm text-slate-500 mt-1">
              Financial position as at {formatReportDate(asOfDate)}
            </p>
          </div>
          <div className="flex items-center gap-2 no-print">
            <button
              type="button"
              onClick={fetchBalanceSheet}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />Refresh / تازہ کریں</button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition"
            >
              <FileSpreadsheet className="w-4 h-4" /> Export Excel
            </button>
            <button
              type="button"
              onClick={() => void handlePdf()}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
            >
              PDF / پی ڈی ایف
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 transition"
            >
              <Printer className="w-4 h-4" />Print / پرنٹ</button>
          </div>
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="no-print rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[260px_1fr_auto] lg:items-end">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                As-of Date
              </span>
              <input
                type="date"
                value={asOfDate}
                max={getLocalToday()}
                onChange={(event) => setAsOfDate(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="flex h-10 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3">
              <input
                type="checkbox"
                checked={hideZeroBalances}
                onChange={(event) => setHideZeroBalances(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">Hide zero-balance accounts / صفر بیلنس اکاؤنٹس چھپائیں</span>
                <span className="block text-[11px] text-slate-500">Untick to display the complete chart of accounts. / مکمل چارٹ آف اکاؤنٹس دیکھنے کیلئے نشان ہٹائیں۔</span>
              </span>
            </label>

            <div className="text-left text-xs text-slate-500 lg:text-right">
              <div>Posted ledger entries through selected date / منتخب تاریخ تک پوسٹ شدہ لیجر اندراجات</div>
              {lastUpdated && <div>Updated {lastUpdated.toLocaleTimeString()}</div>}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-400 shadow-sm">
            Loading Balance Sheet...
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([
                ["Total Assets", assets.total, "text-emerald-700"],
                ["Total Liabilities", liabilities.total, "text-rose-700"],
                ["Total Equity", equity.total, "text-blue-700"],
                [
                  "Liabilities + Equity",
                  totalLiabilitiesAndEquity,
                  isBalanced ? "text-emerald-700" : "text-rose-700",
                ],
              ] as Array<[string, number, string]>).map(([label, amount, color]) => (
                <div
                  key={String(label)}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {label}
                  </span>
                  <span className={`mt-1 block font-mono text-lg font-bold ${color}`}>
                    {formatCurrency(Number(amount))}
                  </span>
                </div>
              ))}
            </div>

            {negativeInventoryItems.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">Inventory warning: / اسٹاک تنبیہ:</span>{" "}
                {negativeInventoryItems.map((item) => item.name).join(", ")} has a
                negative balance. Review stock posting and valuation entries.
              </div>
            )}

            <div className="grid items-stretch gap-6 lg:grid-cols-2">
              <div className="flex h-full flex-col gap-6">
                <StatementSection
                  title="Assets / اثاثے"
                  groups={assetGroups}
                  totalLabel="Total Assets"
                  total={assets.total}
                  totalColor="text-emerald-700"
                  showTotalFooter={false}
                />

                <div className="mt-auto flex min-h-[62px] items-center justify-between rounded-xl border-2 border-emerald-400 bg-slate-900 px-4 py-3 text-white">
                  <div>
                    <span className="block text-sm font-bold uppercase tracking-wide">
                      Total Assets
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-300">
                      Assets as at {formatReportDate(asOfDate)}
                    </span>
                  </div>
                  <span className="font-mono text-lg font-bold">
                    {formatCurrency(assets.total)}
                  </span>
                </div>
              </div>

              <div className="flex h-full flex-col gap-6">
                <StatementSection
                  title="Liabilities / واجبات"
                  groups={liabilityGroups}
                  totalLabel="Total Liabilities"
                  total={liabilities.total}
                  totalColor="text-rose-700"
                />

                <StatementSection
                  title="Equity / سرمایہ"
                  groups={equityGroups}
                  totalLabel="Total Equity"
                  total={equity.total}
                  totalColor="text-blue-700"
                />

                <div
                  className={`mt-auto flex min-h-[62px] items-center justify-between rounded-xl border-2 px-4 py-3 ${
                    isBalanced
                      ? "border-emerald-400 bg-slate-900 text-white"
                      : "border-rose-400 bg-rose-950 text-white"
                  }`}
                >
                  <div>
                    <span className="block text-sm font-bold uppercase tracking-wide">
                      Total Liabilities & Equity
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-300">
                      Liabilities {formatCurrency(liabilities.total)} + Equity{" "}
                      {formatCurrency(equity.total)}
                    </span>
                  </div>
                  <span className="font-mono text-lg font-bold">
                    {formatCurrency(totalLiabilitiesAndEquity)}
                  </span>
                </div>
              </div>
            </div>

            <div
              className={`flex flex-col items-start justify-between gap-4 rounded-xl border-2 p-5 sm:flex-row sm:items-center ${
                isBalanced
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-rose-300 bg-rose-50"
              }`}
            >
              <div>
                <span className="block text-base font-bold text-slate-900">
                  Accounting Equation Check
                </span>
                <span className="text-xs text-slate-600">
                  Total Assets must equal Total Liabilities plus Equity
                </span>
              </div>
              <div className="text-left sm:text-right">
                <span className="block font-mono text-xl font-bold text-slate-900">
                  Difference: {formatCurrency(equationDifference)}
                </span>
                <span
                  className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                    isBalanced
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {isBalanced ? "Balanced" : "Out of Balance"}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {reportPrintSettings && (
        <div className="hidden print:block mt-8 border-t border-slate-300 pt-3 text-xs text-slate-500">
          {reportPrintSettings.visibility.show_footer &&
            (reportPrintSettings.company.document_footer ||
              reportPrintSettings.company.document_footer_urdu) && (
              <div className="text-center">
                {reportPrintSettings.company.document_footer}
                {reportPrintSettings.company.document_footer_urdu && (
                  <div>{reportPrintSettings.company.document_footer_urdu}</div>
                )}
              </div>
            )}

          {reportPrintSettings.visibility.show_signatures && (
            <div className="mt-10 flex justify-between text-slate-700">
              <span>
                {reportPrintSettings.company.prepared_by_label || "Prepared By"}
              </span>
              <span>
                {reportPrintSettings.company.checked_by_label || "Checked By"}
              </span>
              <span>
                {reportPrintSettings.company.approved_by_label || "Approved By"}
              </span>
            </div>
          )}

          {reportPrintSettings.visibility.show_print_datetime && (
            <div className="mt-4">
              Printed: {new Date().toLocaleString("en-PK")}
            </div>
          )}

          {reportPrintSettings.visibility.show_page_numbers && (
            <div className="text-right">Page</div>
          )}
        </div>
      )}
    </div>
  );
}
