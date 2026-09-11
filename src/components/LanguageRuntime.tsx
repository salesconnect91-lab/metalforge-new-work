import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { languageByCode, type LanguageMode } from "@/lib/languageConfig";

type RuntimeLanguage = {
  mode: LanguageMode;
  primary: string;
  secondary: string | null;
  documentMode: LanguageMode;
  documentPrimary: string;
  documentSecondary: string | null;
};

type Translation = { ur?: string; ar?: string };

const ENGLISH_ONLY: RuntimeLanguage = {
  mode: "single",
  primary: "en",
  secondary: null,
  documentMode: "single",
  documentPrimary: "en",
  documentSecondary: null,
};

// Canonical UI phrases which are sometimes English-only in legacy screens.
// Existing "English / Urdu" labels still supply their Urdu text directly;
// this table adds Arabic and covers common English-only controls/headings.
const UI_TRANSLATIONS: Record<string, Translation> = {
  "Dashboard": { ur: "ڈیش بورڈ", ar: "لوحة التحكم" },
  "Master Data": { ur: "ماسٹر ڈیٹا", ar: "البيانات الأساسية" },
  "Items": { ur: "آئٹمز", ar: "الأصناف" },
  "Categories": { ur: "کیٹیگریز", ar: "الفئات" },
  "Customers": { ur: "گاہک", ar: "العملاء" },
  "Suppliers": { ur: "سپلائرز", ar: "الموردون" },
  "Employees": { ur: "ملازمین", ar: "الموظفون" },
  "Warehouses": { ur: "ویئرہاؤسز", ar: "المستودعات" },
  "Godowns": { ur: "گودام", ar: "المخازن" },
  "Units of Measure": { ur: "پیمائشی اکائیاں", ar: "وحدات القياس" },
  "Transporters": { ur: "ٹرانسپورٹرز", ar: "الناقلون" },
  "Charge Master": { ur: "چارج ماسٹر", ar: "دليل الرسوم" },
  "Sales": { ur: "سیلز", ar: "المبيعات" },
  "Sales Invoices": { ur: "سیلز انوائسز", ar: "فواتير المبيعات" },
  "Sales Order Book": { ur: "سیلز آرڈر بک", ar: "سجل أوامر المبيعات" },
  "Consolidated Invoices": { ur: "مشترکہ انوائسز", ar: "الفواتير المجمعة" },
  "Purchase": { ur: "خریداری", ar: "المشتريات" },
  "Purchase Invoices": { ur: "خریداری انوائسز", ar: "فواتير المشتريات" },
  "Consolidated Purchase": { ur: "مشترکہ خریداری", ar: "المشتريات المجمعة" },
  "Purchase Order Book": { ur: "پرچیز آرڈر بک", ar: "سجل أوامر الشراء" },
  "Inventory": { ur: "اسٹاک", ar: "المخزون" },
  "Inventory / Stock": { ur: "اسٹاک", ar: "المخزون" },
  "Current Stock": { ur: "موجودہ اسٹاک", ar: "المخزون الحالي" },
  "Stock Movements": { ur: "اسٹاک موومنٹس", ar: "حركات المخزون" },
  "Production": { ur: "پیداوار", ar: "الإنتاج" },
  "Production / Furnace & Mill": { ur: "پیداوار", ar: "الإنتاج / الفرن والدرفلة" },
  "Work Orders": { ur: "ورک آرڈرز", ar: "أوامر العمل" },
  "Furnace Yield": { ur: "فرنس پیداوار", ar: "إنتاجية الفرن" },
  "Cutting & Loading": { ur: "کٹنگ و لوڈنگ", ar: "القطع والتحميل" },
  "Cutting Orders": { ur: "کٹنگ آرڈرز", ar: "أوامر القطع" },
  "Gate Pass & Weighbridge": { ur: "گیٹ پاس و وزن کانٹا", ar: "تصريح البوابة والميزان" },
  "Accounting": { ur: "اکاؤنٹنگ", ar: "المحاسبة" },
  "Transactions": { ur: "لین دین", ar: "المعاملات" },
  "Journal Entries": { ur: "جرنل اندراجات", ar: "قيود اليومية" },
  "Cash Counter": { ur: "کیش کاؤنٹر", ar: "الصندوق النقدي" },
  "Payment Reversals": { ur: "ادائیگی واپسی", ar: "عكس المدفوعات" },
  "Credit / Debit Notes": { ur: "ریٹرن نوٹس", ar: "إشعارات الدائن / المدين" },
  "Books & Registers": { ur: "بکس و رجسٹر", ar: "الدفاتر والسجلات" },
  "VAT Register": { ur: "وی اے ٹی رجسٹر", ar: "سجل ضريبة القيمة المضافة" },
  "Day Book": { ur: "روزنامچہ", ar: "دفتر اليومية" },
  "General Ledgers": { ur: "جنرل لیجر", ar: "دفاتر الأستاذ العام" },
  "Bank Reconciliation": { ur: "بینک ریکنسیلی ایشن", ar: "تسوية البنك" },
  "Financial Statements": { ur: "مالی بیانات", ar: "القوائم المالية" },
  "Trial Balance": { ur: "ٹرائل بیلنس", ar: "ميزان المراجعة" },
  "Profit & Loss": { ur: "نفع و نقصان", ar: "الأرباح والخسائر" },
  "Balance Sheet": { ur: "بیلنس شیٹ", ar: "الميزانية العمومية" },
  "Cash Flow": { ur: "کیش فلو", ar: "التدفق النقدي" },
  "Controls & Closing": { ur: "کنٹرول و کلوزنگ", ar: "الضوابط والإقفال" },
  "Period Closing": { ur: "پیریڈ کلوزنگ", ar: "إقفال الفترة" },
  "Year Closing": { ur: "سالانہ اختتام", ar: "الإقفال السنوي" },
  "Financial Controls": { ur: "مالی کنٹرولز", ar: "الضوابط المالية" },
  "Audit Trail": { ur: "آڈٹ ٹریل", ar: "سجل التدقيق" },
  "Accounting Setup": { ur: "اکاؤنٹنگ سیٹ اپ", ar: "إعداد المحاسبة" },
  "Chart of Accounts": { ur: "چارٹ آف اکاؤنٹس", ar: "دليل الحسابات" },
  "Account Mapping": { ur: "اکاؤنٹ میپنگ", ar: "ربط الحسابات" },
  "Reports": { ur: "رپورٹس", ar: "التقارير" },
  "Sales & Customer": { ur: "سیلز و گاہک", ar: "المبيعات والعملاء" },
  "Sales & Margin": { ur: "سیلز و مارجن", ar: "المبيعات والهامش" },
  "Sales Register": { ur: "سیلز رجسٹر", ar: "سجل المبيعات" },
  "Customer Aging": { ur: "گاہک ایجنگ", ar: "أعمار ديون العملاء" },
  "Customer Item History": { ur: "گاہک آئٹم ہسٹری", ar: "سجل أصناف العميل" },
  "Salesperson Performance": { ur: "سیلز پرسن", ar: "أداء مندوب المبيعات" },
  "Customer Statement": { ur: "گاہک اسٹیٹمنٹ", ar: "كشف حساب العميل" },
  "Purchase & Supplier": { ur: "خریداری و سپلائر", ar: "المشتريات والموردون" },
  "Purchase Register": { ur: "پرچیز رجسٹر", ar: "سجل المشتريات" },
  "Supplier Aging": { ur: "سپلائر ایجنگ", ar: "أعمار ديون الموردين" },
  "Supplier Item History": { ur: "سپلائر آئٹم ہسٹری", ar: "سجل أصناف المورد" },
  "Inventory Reports": { ur: "اسٹاک رپورٹس", ar: "تقارير المخزون" },
  "Stock Valuation": { ur: "اسٹاک ویلیو", ar: "تقييم المخزون" },
  "Stock Aging": { ur: "اسٹاک ایجنگ", ar: "أعمار المخزون" },
  "Steel Stock Control": { ur: "اسٹیل اسٹاک کنٹرول", ar: "التحكم في مخزون الحديد" },
  "Customer Profitability": { ur: "گاہک منافع", ar: "ربحية العملاء" },
  "Item Profitability": { ur: "آئٹم منافع", ar: "ربحية الأصناف" },
  "Salesperson Profitability": { ur: "سیلز پرسن منافع", ar: "ربحية مندوب المبيعات" },
  "Customer Collection Performance": { ur: "گاہک وصولی کارکردگی", ar: "أداء تحصيل العملاء" },
  "Supplier Performance": { ur: "سپلائر کارکردگی", ar: "أداء الموردين" },
  "Purchase Price Variance": { ur: "پرچیز ریٹ فرق", ar: "انحراف سعر الشراء" },
  "Inventory Aging / Slow Moving": { ur: "اسٹاک ایجنگ / سست رفتار", ar: "أعمار المخزون / بطيء الحركة" },
  "Inventory Turnover": { ur: "اسٹاک ٹرن اوور", ar: "دوران المخزون" },
  "Stock Exceptions": { ur: "اسٹاک مسائل", ar: "استثناءات المخزون" },
  "Business Unit Performance": { ur: "بزنس یونٹ کارکردگی", ar: "أداء وحدة الأعمال" },
  "Monthly Business Performance / MIS": { ur: "ماہانہ کاروباری کارکردگی", ar: "الأداء الشهري للأعمال / MIS" },
  "Control & Reconciliation": { ur: "کنٹرول رپورٹس", ar: "الرقابة والتسويات" },
  "Returns Register": { ur: "ریٹرنز رجسٹر", ar: "سجل المرتجعات" },
  "AR / AP Reconciliation": { ur: "ریکَنسیلی ایشن", ar: "تسوية العملاء / الموردين" },
  "Exceptions": { ur: "ایکسیپشنز", ar: "الاستثناءات" },
  "Service Charges": { ur: "سروس چارجز", ar: "رسوم الخدمات" },
  "Operations": { ur: "آپریشن رپورٹس", ar: "العمليات" },
  "Gate Pass Report": { ur: "گیٹ پاس رپورٹ", ar: "تقرير تصريح البوابة" },
  "Owner Control": { ur: "مالک کنٹرول", ar: "تحكم المالك" },
  "Settings": { ur: "سیٹنگز", ar: "الإعدادات" },
  "Company": { ur: "کمپنی", ar: "الشركة" },
  "Company Settings": { ur: "کمپنی سیٹنگز", ar: "إعدادات الشركة" },
  "Tax Settings": { ur: "ٹیکس سیٹنگز", ar: "إعدادات الضريبة" },
  "Document & Print": { ur: "ڈاکومنٹ و پرنٹ", ar: "المستندات والطباعة" },
  "Order Book Settings": { ur: "آرڈر بک سیٹنگز", ar: "إعدادات سجل الطلبات" },
  "Back": { ur: "واپس", ar: "رجوع" },
  "Sign out": { ur: "لاگ آؤٹ", ar: "تسجيل الخروج" },
  "Active Company": { ur: "فعال کمپنی", ar: "الشركة النشطة" },
  "Active Company / فعال کمپنی": { ur: "فعال کمپنی", ar: "الشركة النشطة" },
  "Refresh": { ur: "تازہ کریں", ar: "تحديث" },
  "Reset": { ur: "ری سیٹ", ar: "إعادة ضبط" },
  "Search": { ur: "تلاش", ar: "بحث" },
  "Save": { ur: "محفوظ کریں", ar: "حفظ" },
  "Save Settings": { ur: "محفوظ کریں", ar: "حفظ الإعدادات" },
  "Loading…": { ur: "لوڈ ہو رہا ہے…", ar: "جارٍ التحميل…" },
};

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label"] as const;

async function loadRuntimeLanguage(): Promise<RuntimeLanguage> {
  const result = await supabase
    .from("company_settings")
    .select("screen_language_mode,screen_primary_language,screen_secondary_language,document_language_mode,document_primary_language,document_secondary_language")
    .maybeSingle();
  if (result.error) throw result.error;

  const mode = (result.data?.screen_language_mode || "single") as LanguageMode;
  const documentMode = (result.data?.document_language_mode || "single") as LanguageMode;
  return {
    mode,
    primary: result.data?.screen_primary_language || "en",
    secondary: mode === "bilingual" ? result.data?.screen_secondary_language || null : null,
    documentMode,
    documentPrimary: result.data?.document_primary_language || "en",
    documentSecondary: documentMode === "bilingual" ? result.data?.document_secondary_language || null : null,
  };
}

function applyDocumentLanguage(language: RuntimeLanguage) {
  const primary = languageByCode(language.primary);
  document.documentElement.lang = language.primary || "en";
  document.documentElement.dir = language.mode === "single" && primary.direction === "rtl" ? "rtl" : "ltr";
  document.documentElement.dataset.languageMode = language.mode;
  document.documentElement.dataset.primaryLanguage = language.primary;
  if (language.secondary) document.documentElement.dataset.secondaryLanguage = language.secondary;
  else delete document.documentElement.dataset.secondaryLanguage;

  document.documentElement.dataset.documentLanguageMode = language.documentMode;
  document.documentElement.dataset.documentPrimaryLanguage = language.documentPrimary;
  if (language.documentSecondary) document.documentElement.dataset.documentSecondaryLanguage = language.documentSecondary;
  else delete document.documentElement.dataset.documentSecondaryLanguage;
}

function hasRtlScript(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

function normalizePhrase(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function splitLegacyLabel(value: string) {
  const parts = value.trim().split("/").map((part) => normalizePhrase(part)).filter(Boolean);
  const english = parts.find((part) => !hasRtlScript(part)) || normalizePhrase(value);
  const urdu = parts.find((part) => hasRtlScript(part)) || null;
  return { english, urdu, isLegacyBilingual: parts.length > 1 && Boolean(urdu) };
}

function translateExact(english: string, languageCode: string, embeddedUrdu: string | null) {
  if (languageCode === "en") return english;
  if (languageCode === "ur") return embeddedUrdu || UI_TRANSLATIONS[english]?.ur || english;
  if (languageCode === "ar") return UI_TRANSLATIONS[english]?.ar || english;
  return english;
}

function selectLanguageText(value: string, language: RuntimeLanguage) {
  if (!value.trim()) return value;
  const leading = value.match(/^\s*/)?.[0] || "";
  const trailing = value.match(/\s*$/)?.[0] || "";
  const { english, urdu, isLegacyBilingual } = splitLegacyLabel(value);
  const known = Boolean(UI_TRANSLATIONS[english]);

  // Do not touch business data / party names / free text. We only transform
  // legacy bilingual UI labels or exact canonical interface phrases.
  if (!isLegacyBilingual && !known) return value;

  const requested = language.mode === "bilingual" && language.secondary
    ? [language.primary, language.secondary]
    : [language.primary];
  const rendered = requested
    .map((code) => translateExact(english, code, urdu))
    .filter((part, index, all) => part && all.indexOf(part) === index);
  return `${leading}${rendered.join(" / ")}${trailing}`;
}

function processTextNode(node: Text, language: RuntimeLanguage) {
  const current = node.nodeValue || "";
  if (!current.trim()) return;
  const previousSource = originalText.get(node);
  if (!previousSource) originalText.set(node, current);
  const source = originalText.get(node) || current;
  const expected = selectLanguageText(source, language);

  // React may reuse a text node for new content. If it no longer matches the
  // stored source or our rendered output, adopt the new React value as source.
  if (previousSource && current !== source && current !== expected) {
    originalText.set(node, current);
    const next = selectLanguageText(current, language);
    if (node.nodeValue !== next) node.nodeValue = next;
    return;
  }
  if (node.nodeValue !== expected) node.nodeValue = expected;
}

function processElementAttributes(element: Element, language: RuntimeLanguage) {
  let originals = originalAttributes.get(element);
  if (!originals) {
    originals = new Map<string, string>();
    originalAttributes.set(element, originals);
  }
  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const stored = originals.get(attribute);
    const expected = stored ? selectLanguageText(stored, language) : "";
    if (!stored || (current !== stored && current !== expected)) originals.set(attribute, current);
    const source = originals.get(attribute) || current;
    const next = selectLanguageText(source, language);
    if (current !== next) element.setAttribute(attribute, next);
  }
}

function translateTree(root: Node, language: RuntimeLanguage) {
  // TreeWalker.nextNode() does not return a Text root. React often inserts text
  // nodes directly, which was the main reason Urdu leaked after initial load.
  if (root.nodeType === Node.TEXT_NODE) {
    processTextNode(root as Text, language);
    return;
  }
  if (root.nodeType === Node.ELEMENT_NODE) processElementAttributes(root as Element, language);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) processTextNode(node as Text, language);
    else if (node.nodeType === Node.ELEMENT_NODE) processElementAttributes(node as Element, language);
  }
}

export default function LanguageRuntime() {
  useEffect(() => {
    let active = true;
    let language: RuntimeLanguage = ENGLISH_ONLY;
    let frame = 0;
    let applying = false;

    const apply = () => {
      if (!active) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        applying = true;
        applyDocumentLanguage(language);
        translateTree(document.body, language);
        queueMicrotask(() => { applying = false; });
      });
    };

    const refresh = async () => {
      try {
        language = await loadRuntimeLanguage();
      } catch {
        language = ENGLISH_ONLY;
      }
      apply();
    };

    const observer = new MutationObserver((mutations) => {
      if (!active || applying) return;
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE) translateTree(node, language);
        });
        if (mutation.type === "characterData" && mutation.target.nodeType === Node.TEXT_NODE) {
          processTextNode(mutation.target as Text, language);
        }
        if (mutation.type === "attributes" && mutation.target.nodeType === Node.ELEMENT_NODE) {
          processElementAttributes(mutation.target as Element, language);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });

    void refresh();
    const handleChange = () => void refresh();
    window.addEventListener("navilo-language-changed", handleChange);
    window.addEventListener("navilo-workspace-changed", handleChange);

    return () => {
      active = false;
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("navilo-language-changed", handleChange);
      window.removeEventListener("navilo-workspace-changed", handleChange);
    };
  }, []);

  return null;
}
