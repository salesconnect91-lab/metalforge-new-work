import { useEffect } from "react";

const URDU: Record<string, string> = {
  Dashboard: "ڈیش بورڈ",
  "Master Data": "ماسٹر ڈیٹا",
  Customers: "گاہک",
  Customer: "گاہک",
  Suppliers: "سپلائرز",
  Supplier: "سپلائر",
  Items: "آئٹمز",
  Item: "آئٹم",
  Categories: "کیٹیگریز",
  Category: "کیٹیگری",
  Employees: "ملازمین",
  Employee: "ملازم",
  Transporters: "ٹرانسپورٹرز",
  Transporter: "ٹرانسپورٹر",
  Warehouses: "ویئرہاؤسز",
  Warehouse: "ویئرہاؤس",
  Godowns: "گودام",
  Godown: "گودام",
  Sales: "فروخت",
  "Sales Invoice": "فروخت کا بل",
  "Sales Invoices": "فروخت کے بل",
  "New Sales Invoice": "نیا فروخت بل",
  Purchase: "خریداری",
  "Purchase Invoice": "خریداری کا بل",
  "Purchase Invoices": "خریداری کے بل",
  Inventory: "اسٹاک",
  Stock: "اسٹاک",
  "Current Stock": "موجودہ اسٹاک",
  "Stock Movements": "اسٹاک نقل و حرکت",
  "Warehouse Stock": "ویئرہاؤس اسٹاک",
  Production: "پیداوار",
  Furnace: "بھٹی",
  Mill: "مل",
  "Work Orders": "ورک آرڈرز",
  "Work Order": "ورک آرڈر",
  Cutting: "کٹنگ",
  Accounting: "اکاؤنٹنگ",
  "Chart of Accounts": "چارٹ آف اکاؤنٹس",
  "Journal Entries": "جرنل انٹریز",
  "Journal Entry": "جرنل انٹری",
  "General Ledger": "جنرل لیجر",
  Ledgers: "لیجرز",
  "Trial Balance": "ٹرائل بیلنس",
  "Profit & Loss": "نفع و نقصان",
  "Profit and Loss": "نفع و نقصان",
  "Balance Sheet": "بیلنس شیٹ",
  "Cash Flow Statement": "کیش فلو اسٹیٹمنٹ",
  "Day Book": "روزنامچہ",
  "Bank Reconciliation": "بینک مفاہمت",
  "Fiscal Year Closing": "مالی سال اختتام",
  "Financial Controls": "مالی کنٹرول",
  Reports: "رپورٹس",
  Report: "رپورٹ",
  "Reports Overview": "رپورٹس جائزہ",
  "Salesperson Report": "سیلز پرسن رپورٹ",
  "Salesperson Performance": "سیلز پرسن کارکردگی",
  "Stock Aging Report": "اسٹاک ایجنگ رپورٹ",
  "Customer Statement": "گاہک اسٹیٹمنٹ",
  "Customer Statement & Aging": "گاہک اسٹیٹمنٹ اور ایجنگ",
  Settings: "ترتیبات",
  "Company Settings": "کمپنی ترتیبات",
  "Tax Settings": "ٹیکس ترتیبات",
  "Tax & Charges": "ٹیکس اور چارجز",
  "Document & Print": "دستاویز اور پرنٹ",
  "Print Settings": "پرنٹ ترتیبات",
  "Owner Control": "مالک کنٹرول",
  "Platform Owner": "پلیٹ فارم مالک",
  Company: "کمپنی",
  Companies: "کمپنیاں",
  "Active Company": "فعال کمپنی",
  Users: "صارفین",
  User: "صارف",
  Role: "کردار",
  Status: "حالت",
  Active: "فعال",
  Inactive: "غیر فعال",
  Draft: "مسودہ",
  Posted: "پوسٹ شدہ",
  Closed: "بند",
  Pending: "زیر التوا",
  Completed: "مکمل",
  Name: "نام",
  Code: "کوڈ",
  Date: "تاریخ",
  "From Date": "ابتدائی تاریخ",
  "To Date": "آخری تاریخ",
  Description: "تفصیل",
  Reference: "حوالہ",
  Phone: "فون",
  Email: "ای میل",
  Address: "پتہ",
  Quantity: "مقدار",
  Qty: "مقدار",
  Rate: "ریٹ",
  Price: "قیمت",
  Amount: "رقم",
  Total: "کل",
  "Grand Total": "مجموعی کل",
  Debit: "ڈیبٹ",
  Credit: "کریڈٹ",
  Balance: "بیلنس",
  "Opening Balance": "ابتدائی بیلنس",
  "Closing Balance": "اختتامی بیلنس",
  Received: "وصول شدہ",
  Paid: "ادا شدہ",
  Outstanding: "بقایا",
  Payment: "ادائیگی",
  "Payment Method": "ادائیگی کا طریقہ",
  Cash: "نقد",
  Bank: "بینک",
  Search: "تلاش",
  Filter: "فلٹر",
  All: "تمام",
  Select: "منتخب کریں",
  Create: "بنائیں",
  Add: "شامل کریں",
  New: "نیا",
  Edit: "ترمیم",
  Update: "اپ ڈیٹ",
  Save: "محفوظ کریں",
  "Save Changes": "تبدیلیاں محفوظ کریں",
  "Save Settings": "ترتیبات محفوظ کریں",
  Delete: "حذف کریں",
  Remove: "ہٹائیں",
  Cancel: "منسوخ",
  Close: "بند کریں",
  Back: "واپس",
  Next: "اگلا",
  Previous: "پچھلا",
  Refresh: "تازہ کریں",
  View: "دیکھیں",
  Details: "تفصیلات",
  Print: "پرنٹ",
  "Print / PDF": "پرنٹ / پی ڈی ایف",
  "Print Preview": "پرنٹ پیش منظر",
  "Print Now": "ابھی پرنٹ کریں",
  Export: "ایکسپورٹ",
  Download: "ڈاؤن لوڈ",
  Upload: "اپ لوڈ",
  Import: "امپورٹ",
  Actions: "کارروائیاں",
  Loading: "لوڈ ہو رہا ہے",
  "No data found": "کوئی ڈیٹا نہیں ملا",
  "No records found": "کوئی ریکارڈ نہیں ملا",
  "Sign out": "لاگ آؤٹ",
  Logout: "لاگ آؤٹ",
  Retry: "دوبارہ کوشش",
  Error: "خرابی",
  Success: "کامیابی",
  Notes: "نوٹس",
  "Invoice No": "بل نمبر",
  Invoice: "انوائس",
  "Order No": "آرڈر نمبر",
  "Entry No": "انٹری نمبر",
  Account: "اکاؤنٹ",
  "Account Code": "اکاؤنٹ کوڈ",
  "Account Name": "اکاؤنٹ نام",
  Type: "قسم",
  Grade: "گریڈ",
  Size: "سائز",
  Unit: "یونٹ",
  UOM: "پیمائش اکائی",
  Charges: "چارجز",
  Tax: "ٹیکس",
  VAT: "وی اے ٹی",
  Cost: "لاگت",
  Profit: "نفع",
  Margin: "مارجن",
  "Gross Profit": "مجموعی منافع",
  Salesperson: "سیلز پرسن",
  Party: "پارٹی",
  Today: "آج",
};

const STYLE = `
:root {
  --mf-bg: #f4f7fb;
  --mf-surface: rgba(255,255,255,.96);
  --mf-border: #dbe4ef;
  --mf-border-strong: #c8d4e3;
  --mf-text: #0f172a;
  --mf-muted: #64748b;
  --mf-accent: #2563eb;
  --mf-accent-dark: #1d4ed8;
  --mf-shadow-sm: 0 1px 2px rgba(15,23,42,.04);
  --mf-shadow: 0 8px 24px rgba(15,23,42,.06);
}
html { background: var(--mf-bg); }
body {
  background:
    radial-gradient(circle at 12% -8%, rgba(59,130,246,.09), transparent 28%),
    linear-gradient(180deg,#f8fbff 0,#f4f7fb 240px,#f4f7fb 100%);
  color: var(--mf-text);
}
#root { min-height:100vh; }
.erp-shell main { animation:mf-enter .18s ease-out; }
@keyframes mf-enter { from {opacity:.6;transform:translateY(2px)} to {opacity:1;transform:none} }
.erp-shell .rounded-xl.border.bg-white,
.erp-shell .rounded-2xl.border.bg-white,
.erp-shell .rounded-lg.border.bg-white,
.erp-shell .card,
.erp-shell [class*="shadow-sm"][class*="bg-white"] {
  border-color:var(--mf-border)!important;
  box-shadow:var(--mf-shadow-sm)!important;
}
.erp-shell .rounded-xl.border.bg-white:hover,
.erp-shell .rounded-lg.border.bg-white:hover { border-color:var(--mf-border-strong)!important; }
.erp-shell header,
.erp-shell [class*="sticky"][class*="top-0"] { backdrop-filter:saturate(150%) blur(12px); }
button,a,input,select,textarea { transition:border-color .15s ease,box-shadow .15s ease,transform .12s ease,background-color .15s ease,color .15s ease; }
button:not(:disabled):active { transform:translateY(1px); }
input:focus,select:focus,textarea:focus { outline:none; border-color:#7db0f5!important; box-shadow:0 0 0 3px rgba(37,99,235,.10)!important; }
.erp-shell table { border-collapse:separate; border-spacing:0; }
.erp-shell thead th { background:#f8fafc; color:#475569; font-weight:700; letter-spacing:.01em; }
.erp-shell tbody tr { transition:background-color .12s ease; }
.erp-shell tbody tr:hover { background:rgba(239,246,255,.7); }
.erp-shell .btn-primary { box-shadow:0 1px 2px rgba(37,99,235,.18); }
.erp-shell .btn-primary:hover { box-shadow:0 4px 12px rgba(37,99,235,.18); }
.erp-shell h1,.erp-shell h2,.erp-shell h3 { letter-spacing:-.015em; }
.erp-shell [role="alert"],.erp-shell .bg-red-50 { border-radius:.65rem; }
.mf-urdu { font-family:"Noto Nastaliq Urdu","Noto Naskh Arabic","Segoe UI",sans-serif; direction:rtl; unicode-bidi:isolate; }
::-webkit-scrollbar { width:8px;height:8px; }
::-webkit-scrollbar-thumb { background:#bac7d8;border-radius:999px;border:2px solid transparent;background-clip:padding-box; }
::-webkit-scrollbar-track { background:transparent; }
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
    if (!parent || parent.closest("script,style,code,pre,[data-no-bilingual]") || parent.isContentEditable) continue;
    const raw = node.nodeValue ?? "";
    const leading = raw.match(/^\s*/)?.[0] ?? "";
    const trailing = raw.match(/\s*$/)?.[0] ?? "";
    const translated = bilingualText(raw);
    if (translated) node.nodeValue = `${leading}${translated}${trailing}`;
  }

  const elements = root instanceof Element
    ? [root, ...Array.from(root.querySelectorAll("input,textarea,button,[title],[aria-label]"))]
    : Array.from(root.querySelectorAll("input,textarea,button,[title],[aria-label]"));

  for (const el of elements) {
    if (!(el instanceof HTMLElement) || el.closest("[data-no-bilingual]")) continue;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const placeholder = el.getAttribute("placeholder");
      if (placeholder) {
        const translated = bilingualText(placeholder);
        if (translated) el.setAttribute("placeholder", translated);
      }
    }
    for (const attr of ["title", "aria-label"]) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      const translated = bilingualText(value);
      if (translated) el.setAttribute(attr, translated);
    }
  }
}

export default function ErpExperienceBridge() {
  useEffect(() => {
    const existing = document.getElementById("metalforge-professional-ui");
    existing?.remove();

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

    return () => {
      observer.disconnect();
      style.remove();
    };
  }, []);

  return null;
}
