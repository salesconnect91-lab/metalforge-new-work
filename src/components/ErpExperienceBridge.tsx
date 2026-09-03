import { useEffect, useMemo, useRef, useState } from "react";

const URDU: Record<string, string> = {
  "Dashboard": "ڈیش بورڈ",
  "Master Data": "ماسٹر ڈیٹا",
  "Customers": "گاہک",
  "Customer": "گاہک",
  "Suppliers": "سپلائرز",
  "Supplier": "سپلائر",
  "Items": "آئٹمز",
  "Item": "آئٹم",
  "Categories": "کیٹیگریز",
  "Category": "کیٹیگری",
  "Employees": "ملازمین",
  "Employee": "ملازم",
  "Transporters": "ٹرانسپورٹرز",
  "Transporter": "ٹرانسپورٹر",
  "Warehouses": "گودام",
  "Warehouse": "گودام",
  "Godowns": "گوڈاؤن",
  "Godown": "گوڈاؤن",
  "Sales": "فروخت",
  "Sales Invoice": "فروخت کا بل",
  "Sales Invoices": "فروخت کے بل",
  "New Sales Invoice": "نیا فروخت بل",
  "Purchase": "خریداری",
  "Purchase Invoice": "خریداری کا بل",
  "Purchase Invoices": "خریداری کے بل",
  "Inventory": "اسٹاک",
  "Stock": "اسٹاک",
  "Stock Movements": "اسٹاک نقل و حرکت",
  "Warehouse Stock": "گودام اسٹاک",
  "Production": "پیداوار",
  "Work Orders": "ورک آرڈرز",
  "Work Order": "ورک آرڈر",
  "Cutting": "کٹنگ",
  "Accounting": "اکاؤنٹنگ",
  "Chart of Accounts": "چارٹ آف اکاؤنٹس",
  "Journal Entries": "جرنل انٹریز",
  "Journal Entry": "جرنل انٹری",
  "General Ledger": "جنرل لیجر",
  "Ledgers": "لیجرز",
  "Trial Balance": "ٹرائل بیلنس",
  "Profit & Loss": "نفع و نقصان",
  "Profit and Loss": "نفع و نقصان",
  "Balance Sheet": "بیلنس شیٹ",
  "Cash Flow Statement": "کیش فلو اسٹیٹمنٹ",
  "Day Book": "روزنامچہ",
  "Bank Reconciliation": "بینک مفاہمت",
  "Fiscal Year Closing": "مالی سال اختتام",
  "Financial Controls": "مالی کنٹرول",
  "Reports": "رپورٹس",
  "Report": "رپورٹ",
  "Salesperson Report": "سیلز پرسن رپورٹ",
  "Customer Statement": "گاہک اسٹیٹمنٹ",
  "Settings": "ترتیبات",
  "Company Settings": "کمپنی ترتیبات",
  "Tax Settings": "ٹیکس ترتیبات",
  "Print Settings": "پرنٹ ترتیبات",
  "Owner Control": "مالک کنٹرول",
  "Platform Owner": "پلیٹ فارم مالک",
  "Company": "کمپنی",
  "Companies": "کمپنیاں",
  "Users": "صارفین",
  "User": "صارف",
  "Role": "کردار",
  "Status": "حالت",
  "Active": "فعال",
  "Inactive": "غیر فعال",
  "Draft": "مسودہ",
  "Posted": "پوسٹ شدہ",
  "Closed": "بند",
  "Pending": "زیر التوا",
  "Completed": "مکمل",
  "Name": "نام",
  "Code": "کوڈ",
  "Date": "تاریخ",
  "From Date": "ابتدائی تاریخ",
  "To Date": "آخری تاریخ",
  "Description": "تفصیل",
  "Reference": "حوالہ",
  "Phone": "فون",
  "Email": "ای میل",
  "Address": "پتہ",
  "Quantity": "مقدار",
  "Qty": "مقدار",
  "Rate": "ریٹ",
  "Price": "قیمت",
  "Amount": "رقم",
  "Total": "کل",
  "Grand Total": "مجموعی کل",
  "Debit": "ڈیبٹ",
  "Credit": "کریڈٹ",
  "Balance": "بیلنس",
  "Opening Balance": "ابتدائی بیلنس",
  "Closing Balance": "اختتامی بیلنس",
  "Received": "وصول شدہ",
  "Paid": "ادا شدہ",
  "Outstanding": "بقایا",
  "Payment": "ادائیگی",
  "Payment Method": "ادائیگی طریقہ",
  "Cash": "نقد",
  "Bank": "بینک",
  "Search": "تلاش",
  "Filter": "فلٹر",
  "All": "تمام",
  "Select": "منتخب کریں",
  "Create": "بنائیں",
  "Add": "شامل کریں",
  "New": "نیا",
  "Edit": "ترمیم",
  "Update": "اپ ڈیٹ",
  "Save": "محفوظ کریں",
  "Save Changes": "تبدیلیاں محفوظ کریں",
  "Delete": "حذف کریں",
  "Remove": "ہٹائیں",
  "Cancel": "منسوخ",
  "Close": "بند کریں",
  "Back": "واپس",
  "Next": "اگلا",
  "Previous": "پچھلا",
  "Refresh": "تازہ کریں",
  "View": "دیکھیں",
  "Details": "تفصیلات",
  "Print": "پرنٹ",
  "Print Preview": "پرنٹ پیش منظر",
  "Print Now": "ابھی پرنٹ کریں",
  "Export": "ایکسپورٹ",
  "Download": "ڈاؤن لوڈ",
  "Upload": "اپ لوڈ",
  "Import": "امپورٹ",
  "Actions": "کارروائیاں",
  "Loading": "لوڈ ہو رہا ہے",
  "No data found": "کوئی ڈیٹا نہیں ملا",
  "No records found": "کوئی ریکارڈ نہیں ملا",
  "Sign out": "لاگ آؤٹ",
  "Logout": "لاگ آؤٹ",
  "Retry": "دوبارہ کوشش",
  "Error": "خرابی",
  "Success": "کامیابی",
  "Notes": "نوٹس",
  "Invoice No": "بل نمبر",
  "Order No": "آرڈر نمبر",
  "Entry No": "انٹری نمبر",
  "Account": "اکاؤنٹ",
  "Account Code": "اکاؤنٹ کوڈ",
  "Account Name": "اکاؤنٹ نام",
  "Type": "قسم",
  "Grade": "گریڈ",
  "Size": "سائز",
  "Unit": "یونٹ",
  "UOM": "پیمائش اکائی",
  "Charges": "چارجز",
  "Tax": "ٹیکس",
  "VAT": "وی اے ٹی",
};

const STYLE = `
:root {
  --mf-bg: #f3f6fb;
  --mf-surface: rgba(255,255,255,.92);
  --mf-border: #dce4ef;
  --mf-text: #0f172a;
  --mf-muted: #64748b;
  --mf-accent: #0f4c81;
  --mf-accent-2: #0b6bcb;
  --mf-shadow: 0 10px 30px rgba(15,23,42,.08);
}
html { background: var(--mf-bg); }
body { background: radial-gradient(circle at 15% 0%, #eef6ff 0, transparent 32%), var(--mf-bg); color: var(--mf-text); }
#root { min-height: 100vh; }
main { animation: mf-enter .2s ease-out; }
@keyframes mf-enter { from { opacity:.65; transform:translateY(2px) } to { opacity:1; transform:none } }
.rounded-xl.border.bg-white, .rounded-2xl.border.bg-white, .card, [class*="shadow-sm"][class*="bg-white"] {
  box-shadow: var(--mf-shadow);
  border-color: var(--mf-border) !important;
}
button, a, input, select, textarea { transition: border-color .15s ease, box-shadow .15s ease, transform .12s ease, background-color .15s ease; }
button:not(:disabled):active { transform: translateY(1px); }
input:focus, select:focus, textarea:focus { outline:none; border-color:#86b7e8 !important; box-shadow:0 0 0 3px rgba(14,116,204,.12) !important; }
table { border-collapse: separate; border-spacing: 0; }
thead th { position: sticky; top: 0; z-index: 1; backdrop-filter: blur(8px); }
tbody tr:hover { background: rgba(239,246,255,.68); }
::-webkit-scrollbar { width: 9px; height: 9px; }
::-webkit-scrollbar-thumb { background:#becada; border-radius:999px; border:2px solid transparent; background-clip:padding-box; }
.mf-print-preview-backdrop { position:fixed; inset:0; z-index:99999; background:rgba(15,23,42,.74); backdrop-filter:blur(5px); padding:24px; display:flex; flex-direction:column; }
.mf-print-preview-toolbar { max-width:1180px; width:100%; margin:0 auto 12px; background:#fff; border:1px solid #dbe3ee; border-radius:14px; box-shadow:0 18px 50px rgba(0,0,0,.22); padding:10px 12px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
.mf-print-preview-title { font-weight:800; color:#0f172a; font-size:14px; }
.mf-print-preview-actions { display:flex; gap:8px; }
.mf-print-preview-actions button { border:1px solid #cbd5e1; background:#fff; color:#0f172a; border-radius:9px; padding:8px 13px; font-weight:700; cursor:pointer; }
.mf-print-preview-actions .primary { background:#0f4c81; color:#fff; border-color:#0f4c81; }
.mf-print-preview-paper { max-width:1180px; width:100%; margin:0 auto; flex:1; overflow:auto; background:#e8edf4; border-radius:14px; padding:22px; box-shadow:0 18px 50px rgba(0,0,0,.22); }
.mf-print-preview-paper > .mf-preview-clone { background:#fff; min-height:100%; margin:auto; box-shadow:0 4px 22px rgba(15,23,42,.14); }
@media (max-width:720px) { .mf-print-preview-backdrop{padding:8px}.mf-print-preview-toolbar{border-radius:10px}.mf-print-preview-paper{padding:8px;border-radius:10px} }
@media print { .mf-print-preview-backdrop { display:none !important; } }
`;

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function bilingualText(value: string) {
  const text = normalize(value);
  if (!text || text.includes(" / ") || /[\u0600-\u06FF]/.test(text)) return null;
  const colon = text.endsWith(":");
  const key = colon ? text.slice(0, -1).trim() : text;
  const urdu = URDU[key];
  return urdu ? `${key} / ${urdu}${colon ? ":" : ""}` : null;
}

function translateTree(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || parent.closest("script,style,code,pre,.mf-print-preview-backdrop,[data-no-bilingual]") || parent.isContentEditable) continue;
    const raw = node.nodeValue ?? "";
    const leading = raw.match(/^\s*/)?.[0] ?? "";
    const trailing = raw.match(/\s*$/)?.[0] ?? "";
    const next = bilingualText(raw);
    if (next) node.nodeValue = `${leading}${next}${trailing}`;
  }

  const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll("input,textarea,button,[title],[aria-label]"))] : Array.from(root.querySelectorAll("input,textarea,button,[title],[aria-label]"));
  for (const el of elements) {
    if (!(el instanceof HTMLElement) || el.closest(".mf-print-preview-backdrop,[data-no-bilingual]")) continue;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const placeholder = el.getAttribute("placeholder");
      if (placeholder) {
        const next = bilingualText(placeholder);
        if (next) el.setAttribute("placeholder", next);
      }
    }
    for (const attr of ["title", "aria-label"]) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      const next = bilingualText(value);
      if (next) el.setAttribute(attr, next);
    }
  }
}

export default function ErpExperienceBridge() {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const nativePrint = useRef<(() => void) | null>(null);
  const previewTitle = useMemo(() => "Print Preview / پرنٹ پیش منظر", []);

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "metalforge-professional-ui";
    style.textContent = STYLE;
    document.head.appendChild(style);

    translateTree(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) translateTree(node);
          else if (node.parentElement) translateTree(node.parentElement);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    nativePrint.current = window.print.bind(window);
    const openPreview = () => {
      const target =
        document.querySelector<HTMLElement>(".print-document") ||
        document.querySelector<HTMLElement>("[data-print-root]") ||
        document.querySelector<HTMLElement>(".print-page") ||
        document.querySelector<HTMLElement>("main");

      if (!target) {
        nativePrint.current?.();
        return;
      }

      const clone = target.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("button,.no-print,[data-no-print]").forEach((node) => node.remove());
      setPreviewHtml(clone.outerHTML);
    };

    window.print = openPreview;

    return () => {
      observer.disconnect();
      style.remove();
      if (nativePrint.current) window.print = nativePrint.current;
    };
  }, []);

  const printNow = () => {
    setPreviewHtml(null);
    window.setTimeout(() => nativePrint.current?.(), 80);
  };

  if (!previewHtml) return null;

  return (
    <div className="mf-print-preview-backdrop" role="dialog" aria-modal="true" aria-label={previewTitle} data-no-bilingual>
      <div className="mf-print-preview-toolbar">
        <div>
          <div className="mf-print-preview-title">{previewTitle}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Review document before printing / پرنٹ سے پہلے دستاویز چیک کریں</div>
        </div>
        <div className="mf-print-preview-actions">
          <button type="button" onClick={() => setPreviewHtml(null)}>Close / بند کریں</button>
          <button type="button" className="primary" onClick={printNow}>Print Now / ابھی پرنٹ کریں</button>
        </div>
      </div>
      <div className="mf-print-preview-paper">
        <div className="mf-preview-clone" dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </div>
    </div>
  );
}
