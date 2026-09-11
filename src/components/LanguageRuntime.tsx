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

type UiLanguage = "en" | "ur" | "ar";

const ENGLISH_ONLY: RuntimeLanguage = {
  mode: "single",
  primary: "en",
  secondary: null,
  documentMode: "single",
  documentPrimary: "en",
  documentSecondary: null,
};

const UI_TRANSLATIONS: Record<string, Translation> = {
  "Dashboard": { ur: "ڈیش بورڈ", ar: "لوحة التحكم" },
  "Business Overview": { ur: "کاروباری خلاصہ", ar: "نظرة عامة على الأعمال" },
  "Master Data": { ur: "ماسٹر ڈیٹا", ar: "البيانات الأساسية" },
  "Items": { ur: "آئٹمز", ar: "الأصناف" },
  "Item": { ur: "آئٹم", ar: "الصنف" },
  "Categories": { ur: "کیٹیگریز", ar: "الفئات" },
  "Category": { ur: "کیٹیگری", ar: "الفئة" },
  "Customers": { ur: "گاہک", ar: "العملاء" },
  "Customer": { ur: "گاہک", ar: "العميل" },
  "Suppliers": { ur: "سپلائرز", ar: "الموردون" },
  "Supplier": { ur: "سپلائر", ar: "المورد" },
  "Employees": { ur: "ملازمین", ar: "الموظفون" },
  "Employee": { ur: "ملازم", ar: "الموظف" },
  "Warehouses": { ur: "ویئرہاؤسز", ar: "المستودعات" },
  "Warehouse": { ur: "ویئرہاؤس", ar: "المستودع" },
  "Godowns": { ur: "گودام", ar: "المخازن" },
  "Godown": { ur: "گودام", ar: "المخزن" },
  "Units of Measure": { ur: "پیمائشی اکائیاں", ar: "وحدات القياس" },
  "Unit of Measure": { ur: "پیمائشی اکائی", ar: "وحدة القياس" },
  "Transporters": { ur: "ٹرانسپورٹرز", ar: "الناقلون" },
  "Transporter": { ur: "ٹرانسپورٹر", ar: "الناقل" },
  "Charge Master": { ur: "چارج ماسٹر", ar: "دليل الرسوم" },
  "Sales": { ur: "سیلز", ar: "المبيعات" },
  "Sales Invoices": { ur: "سیلز انوائسز", ar: "فواتير المبيعات" },
  "Sales Invoice": { ur: "سیلز انوائس", ar: "فاتورة المبيعات" },
  "New Sales Invoice": { ur: "نئی سیلز انوائس", ar: "فاتورة مبيعات جديدة" },
  "Sales Order Book": { ur: "سیلز آرڈر بک", ar: "سجل أوامر المبيعات" },
  "Consolidated Invoices": { ur: "مشترکہ انوائسز", ar: "الفواتير المجمعة" },
  "Purchase": { ur: "خریداری", ar: "المشتريات" },
  "Purchases": { ur: "خریداریاں", ar: "المشتريات" },
  "Purchase Invoices": { ur: "خریداری انوائسز", ar: "فواتير المشتريات" },
  "Purchase Invoice": { ur: "خریداری انوائس", ar: "فاتورة المشتريات" },
  "New Purchase": { ur: "نئی خریداری", ar: "عملية شراء جديدة" },
  "Consolidated Purchase": { ur: "مشترکہ خریداری", ar: "المشتريات المجمعة" },
  "Purchase Order Book": { ur: "پرچیز آرڈر بک", ar: "سجل أوامر الشراء" },
  "Inventory": { ur: "اسٹاک", ar: "المخزون" },
  "Inventory / Stock": { ur: "اسٹاک", ar: "المخزون" },
  "Current Stock": { ur: "موجودہ اسٹاک", ar: "المخزون الحالي" },
  "Stock Movements": { ur: "اسٹاک موومنٹس", ar: "حركات المخزون" },
  "Stock Movement": { ur: "اسٹاک موومنٹ", ar: "حركة المخزون" },
  "Production": { ur: "پیداوار", ar: "الإنتاج" },
  "Production / Furnace & Mill": { ur: "پیداوار / فرنس و مل", ar: "الإنتاج / الفرن والدرفلة" },
  "Work Orders": { ur: "ورک آرڈرز", ar: "أوامر العمل" },
  "Work Order": { ur: "ورک آرڈر", ar: "أمر العمل" },
  "Furnace Yield": { ur: "فرنس پیداوار", ar: "إنتاجية الفرن" },
  "Cutting & Loading": { ur: "کٹنگ و لوڈنگ", ar: "القطع والتحميل" },
  "Cutting Orders": { ur: "کٹنگ آرڈرز", ar: "أوامر القطع" },
  "Cutting Order": { ur: "کٹنگ آرڈر", ar: "أمر القطع" },
  "Gate Pass & Weighbridge": { ur: "گیٹ پاس و وزن کانٹا", ar: "تصريح البوابة والميزان" },
  "Gate Pass": { ur: "گیٹ پاس", ar: "تصريح البوابة" },
  "Accounting": { ur: "اکاؤنٹنگ", ar: "المحاسبة" },
  "Transactions": { ur: "لین دین", ar: "المعاملات" },
  "Journal Entries": { ur: "جرنل اندراجات", ar: "قيود اليومية" },
  "Journal Entry": { ur: "جرنل اندراج", ar: "قيد اليومية" },
  "Cash Counter": { ur: "کیش کاؤنٹر", ar: "الصندوق النقدي" },
  "Payment Reversals": { ur: "ادائیگی واپسی", ar: "عكس المدفوعات" },
  "Credit / Debit Notes": { ur: "کریڈٹ / ڈیبٹ نوٹس", ar: "إشعارات الدائن / المدين" },
  "Return Notes": { ur: "ریٹرن نوٹس", ar: "إشعارات المرتجعات" },
  "Return Note": { ur: "ریٹرن نوٹ", ar: "إشعار مرتجع" },
  "Books & Registers": { ur: "بکس و رجسٹر", ar: "الدفاتر والسجلات" },
  "VAT Register": { ur: "وی اے ٹی رجسٹر", ar: "سجل ضريبة القيمة المضافة" },
  "Day Book": { ur: "روزنامچہ", ar: "دفتر اليومية" },
  "General Ledgers": { ur: "جنرل لیجر", ar: "دفاتر الأستاذ العام" },
  "General Ledger": { ur: "جنرل لیجر", ar: "دفتر الأستاذ العام" },
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
  "Salesperson Performance": { ur: "سیلز پرسن کارکردگی", ar: "أداء مندوب المبيعات" },
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
  "Monthly Business Performance / MIS": { ur: "ماہانہ کاروباری کارکردگی / MIS", ar: "الأداء الشهري للأعمال / MIS" },
  "Control & Reconciliation": { ur: "کنٹرول و ریکنسیلی ایشن", ar: "الرقابة والتسويات" },
  "Returns Register": { ur: "ریٹرنز رجسٹر", ar: "سجل المرتجعات" },
  "AR / AP Reconciliation": { ur: "اے آر / اے پی ریکنسیلی ایشن", ar: "تسوية العملاء / الموردين" },
  "Exceptions": { ur: "ایکسیپشنز", ar: "الاستثناءات" },
  "Service Charges": { ur: "سروس چارجز", ar: "رسوم الخدمات" },
  "Operations": { ur: "آپریشنز", ar: "العمليات" },
  "Gate Pass Report": { ur: "گیٹ پاس رپورٹ", ar: "تقرير تصريح البوابة" },
  "Owner Control": { ur: "مالک کنٹرول", ar: "تحكم المالك" },
  "Settings": { ur: "سیٹنگز", ar: "الإعدادات" },
  "Company": { ur: "کمپنی", ar: "الشركة" },
  "Company Settings": { ur: "کمپنی سیٹنگز", ar: "إعدادات الشركة" },
  "Tax Settings": { ur: "ٹیکس سیٹنگز", ar: "إعدادات الضريبة" },
  "Document & Print": { ur: "ڈاکومنٹ و پرنٹ", ar: "المستندات والطباعة" },
  "Document & Print Settings": { ur: "ڈاکومنٹ و پرنٹ سیٹنگز", ar: "إعدادات المستندات والطباعة" },
  "Order Book Settings": { ur: "آرڈر بک سیٹنگز", ar: "إعدادات سجل الطلبات" },
  "Language Settings": { ur: "زبان کی سیٹنگز", ar: "إعدادات اللغة" },
  "Screen Language": { ur: "اسکرین زبان", ar: "لغة الشاشة" },
  "Document Language": { ur: "دستاویز کی زبان", ar: "لغة المستند" },
  "Single Language": { ur: "ایک زبان", ar: "لغة واحدة" },
  "Bilingual": { ur: "دو زبانیں", ar: "ثنائي اللغة" },
  "Primary Language": { ur: "بنیادی زبان", ar: "اللغة الأساسية" },
  "Secondary Language": { ur: "ثانوی زبان", ar: "اللغة الثانوية" },
  "English": { ur: "انگریزی", ar: "الإنجليزية" },
  "Urdu": { ur: "اردو", ar: "الأردية" },
  "Arabic": { ur: "عربی", ar: "العربية" },
  "Back": { ur: "واپس", ar: "رجوع" },
  "Sign out": { ur: "لاگ آؤٹ", ar: "تسجيل الخروج" },
  "Active Company": { ur: "فعال کمپنی", ar: "الشركة النشطة" },
  "Refresh": { ur: "تازہ کریں", ar: "تحديث" },
  "Reset": { ur: "ری سیٹ", ar: "إعادة ضبط" },
  "Search": { ur: "تلاش", ar: "بحث" },
  "Save": { ur: "محفوظ کریں", ar: "حفظ" },
  "Save Settings": { ur: "سیٹنگز محفوظ کریں", ar: "حفظ الإعدادات" },
  "Loading…": { ur: "لوڈ ہو رہا ہے…", ar: "جارٍ التحميل…" },
  "Loading...": { ur: "لوڈ ہو رہا ہے...", ar: "جارٍ التحميل..." },
  "Saving...": { ur: "محفوظ ہو رہا ہے...", ar: "جارٍ الحفظ..." },
  "No data found": { ur: "کوئی ڈیٹا نہیں ملا", ar: "لم يتم العثور على بيانات" },
  "No records found": { ur: "کوئی ریکارڈ نہیں ملا", ar: "لم يتم العثور على سجلات" },
  "No result found": { ur: "کوئی نتیجہ نہیں ملا", ar: "لم يتم العثور على نتيجة" },
  "Are you sure?": { ur: "کیا آپ کو یقین ہے؟", ar: "هل أنت متأكد؟" },
  "Add": { ur: "شامل کریں", ar: "إضافة" },
  "Edit": { ur: "ترمیم", ar: "تعديل" },
  "Delete": { ur: "حذف کریں", ar: "حذف" },
  "Cancel": { ur: "منسوخ", ar: "إلغاء" },
  "Close": { ur: "بند کریں", ar: "إغلاق" },
  "Create": { ur: "بنائیں", ar: "إنشاء" },
  "Update": { ur: "اپ ڈیٹ", ar: "تحديث" },
  "Apply": { ur: "لاگو کریں", ar: "تطبيق" },
  "Clear": { ur: "صاف کریں", ar: "مسح" },
  "Export": { ur: "ایکسپورٹ", ar: "تصدير" },
  "Print": { ur: "پرنٹ", ar: "طباعة" },
  "Print Preview": { ur: "پرنٹ پیش نظارہ", ar: "معاينة الطباعة" },
  "PDF": { ur: "پی ڈی ایف", ar: "PDF" },
  "Excel": { ur: "ایکسل", ar: "Excel" },
  "New": { ur: "نیا", ar: "جديد" },
  "View": { ur: "دیکھیں", ar: "عرض" },
  "Details": { ur: "تفصیلات", ar: "التفاصيل" },
  "Actions": { ur: "کارروائیاں", ar: "الإجراءات" },
  "Status": { ur: "حالت", ar: "الحالة" },
  "Draft": { ur: "مسودہ", ar: "مسودة" },
  "Posted": { ur: "پوسٹ شدہ", ar: "مرحّل" },
  "Pending": { ur: "زیر التوا", ar: "قيد الانتظار" },
  "Approved": { ur: "منظور شدہ", ar: "معتمد" },
  "Rejected": { ur: "مسترد", ar: "مرفوض" },
  "Completed": { ur: "مکمل", ar: "مكتمل" },
  "Closed": { ur: "بند", ar: "مغلق" },
  "Active": { ur: "فعال", ar: "نشط" },
  "Inactive": { ur: "غیر فعال", ar: "غير نشط" },
  "Date": { ur: "تاریخ", ar: "التاريخ" },
  "From Date": { ur: "تاریخ سے", ar: "من تاريخ" },
  "To Date": { ur: "تاریخ تک", ar: "إلى تاريخ" },
  "Reference": { ur: "حوالہ", ar: "المرجع" },
  "Description": { ur: "تفصیل", ar: "الوصف" },
  "Notes": { ur: "نوٹس", ar: "ملاحظات" },
  "Amount": { ur: "رقم", ar: "المبلغ" },
  "Total": { ur: "کل", ar: "الإجمالي" },
  "Grand Total": { ur: "مجموعی کل", ar: "الإجمالي العام" },
  "Subtotal": { ur: "ذیلی کل", ar: "المجموع الفرعي" },
  "Tax": { ur: "ٹیکس", ar: "الضريبة" },
  "VAT": { ur: "وی اے ٹی", ar: "ضريبة القيمة المضافة" },
  "Discount": { ur: "رعایت", ar: "الخصم" },
  "Charges": { ur: "چارجز", ar: "الرسوم" },
  "Quantity": { ur: "مقدار", ar: "الكمية" },
  "Qty": { ur: "مقدار", ar: "الكمية" },
  "Rate": { ur: "ریٹ", ar: "السعر" },
  "Price": { ur: "قیمت", ar: "السعر" },
  "Cost": { ur: "لاگت", ar: "التكلفة" },
  "Unit": { ur: "اکائی", ar: "الوحدة" },
  "Name": { ur: "نام", ar: "الاسم" },
  "Code": { ur: "کوڈ", ar: "الرمز" },
  "SKU": { ur: "ایس کے یو", ar: "SKU" },
  "Grade": { ur: "گریڈ", ar: "الدرجة" },
  "Size": { ur: "سائز", ar: "المقاس" },
  "Weight": { ur: "وزن", ar: "الوزن" },
  "Vehicle": { ur: "گاڑی", ar: "المركبة" },
  "Vehicle No": { ur: "گاڑی نمبر", ar: "رقم المركبة" },
  "Driver": { ur: "ڈرائیور", ar: "السائق" },
  "Salesperson": { ur: "سیلز پرسن", ar: "مندوب المبيعات" },
  "Payment": { ur: "ادائیگی", ar: "الدفع" },
  "Receipt": { ur: "وصولی", ar: "الإيصال" },
  "Payment Method": { ur: "ادائیگی کا طریقہ", ar: "طريقة الدفع" },
  "Cash": { ur: "نقد", ar: "نقد" },
  "Bank": { ur: "بینک", ar: "البنك" },
  "Credit": { ur: "کریڈٹ", ar: "دائن" },
  "Debit": { ur: "ڈیبٹ", ar: "مدين" },
  "Balance": { ur: "بیلنس", ar: "الرصيد" },
  "Opening Balance": { ur: "ابتدائی بیلنس", ar: "الرصيد الافتتاحي" },
  "Closing Balance": { ur: "اختتامی بیلنس", ar: "الرصيد الختامي" },
  "Outstanding": { ur: "بقایا", ar: "المستحق" },
  "Due Date": { ur: "واجب الادا تاریخ", ar: "تاريخ الاستحقاق" },
  "Invoice": { ur: "انوائس", ar: "الفاتورة" },
  "Invoice No": { ur: "انوائس نمبر", ar: "رقم الفاتورة" },
  "Order No": { ur: "آرڈر نمبر", ar: "رقم الطلب" },
  "Purchase Order": { ur: "پرچیز آرڈر", ar: "أمر الشراء" },
  "Account": { ur: "اکاؤنٹ", ar: "الحساب" },
  "Accounts": { ur: "اکاؤنٹس", ar: "الحسابات" },
  "Debit Balance": { ur: "ڈیبٹ بیلنس", ar: "الرصيد المدين" },
  "Credit Balance": { ur: "کریڈٹ بیلنس", ar: "الرصيد الدائن" },
  "Phone": { ur: "فون", ar: "الهاتف" },
  "Email": { ur: "ای میل", ar: "البريد الإلكتروني" },
  "Address": { ur: "پتہ", ar: "العنوان" },
  "Location": { ur: "مقام", ar: "الموقع" },
  "Branch": { ur: "برانچ", ar: "الفرع" },
  "Business Unit": { ur: "بزنس یونٹ", ar: "وحدة الأعمال" },
  "Search results": { ur: "تلاش کے نتائج", ar: "نتائج البحث" },
  "Show": { ur: "دکھائیں", ar: "إظهار" },
  "Hide": { ur: "چھپائیں", ar: "إخفاء" },
  "Show All": { ur: "سب دکھائیں", ar: "إظهار الكل" },
  "Customize": { ur: "ترتیب", ar: "تخصيص" },
  "Filters": { ur: "فلٹرز", ar: "عوامل التصفية" },
  "Filter": { ur: "فلٹر", ar: "تصفية" },
  "All": { ur: "سب", ar: "الكل" },
  "Yes": { ur: "ہاں", ar: "نعم" },
  "No": { ur: "نہیں", ar: "لا" },
  "Required": { ur: "ضروری", ar: "مطلوب" },
  "Optional": { ur: "اختیاری", ar: "اختياري" },
  "Type": { ur: "قسم", ar: "النوع" },
  "Mode": { ur: "موڈ", ar: "الوضع" },
  "Currency": { ur: "کرنسی", ar: "العملة" },
  "Print Date": { ur: "پرنٹ تاریخ", ar: "تاريخ الطباعة" },
  "Page": { ur: "صفحہ", ar: "الصفحة" },
  "Page Size": { ur: "صفحہ سائز", ar: "حجم الصفحة" },
  "Orientation": { ur: "سمت", ar: "الاتجاه" },
  "Portrait": { ur: "عمودی", ar: "عمودي" },
  "Landscape": { ur: "افقی", ar: "أفقي" },
  "Logo": { ur: "لوگو", ar: "الشعار" },
  "Header": { ur: "ہیڈر", ar: "الرأس" },
  "Footer": { ur: "فوٹر", ar: "التذييل" },
  "Signature": { ur: "دستخط", ar: "التوقيع" },
  "Prepared By": { ur: "تیار کردہ", ar: "أعده" },
  "Checked By": { ur: "جانچ کردہ", ar: "راجعه" },
  "Approved By": { ur: "منظور کردہ", ar: "اعتمده" },
};

const WORD_TRANSLATIONS: Record<string, Translation> = {
  add:{ur:"شامل",ar:"إضافة"}, edit:{ur:"ترمیم",ar:"تعديل"}, delete:{ur:"حذف",ar:"حذف"}, remove:{ur:"ہٹائیں",ar:"إزالة"}, save:{ur:"محفوظ",ar:"حفظ"}, cancel:{ur:"منسوخ",ar:"إلغاء"}, close:{ur:"بند",ar:"إغلاق"}, open:{ur:"کھولیں",ar:"فتح"}, create:{ur:"بنائیں",ar:"إنشاء"}, update:{ur:"اپ ڈیٹ",ar:"تحديث"}, apply:{ur:"لاگو",ar:"تطبيق"}, clear:{ur:"صاف",ar:"مسح"}, reset:{ur:"ری سیٹ",ar:"إعادة ضبط"}, refresh:{ur:"تازہ کریں",ar:"تحديث"}, search:{ur:"تلاش",ar:"بحث"}, select:{ur:"منتخب",ar:"اختيار"}, choose:{ur:"منتخب کریں",ar:"اختيار"}, view:{ur:"دیکھیں",ar:"عرض"}, details:{ur:"تفصیلات",ar:"التفاصيل"}, print:{ur:"پرنٹ",ar:"طباعة"}, preview:{ur:"پیش نظارہ",ar:"معاينة"}, export:{ur:"ایکسپورٹ",ar:"تصدير"}, download:{ur:"ڈاؤن لوڈ",ar:"تنزيل"}, upload:{ur:"اپ لوڈ",ar:"رفع"}, import:{ur:"امپورٹ",ar:"استيراد"}, duplicate:{ur:"نقل",ar:"تكرار"}, copy:{ur:"کاپی",ar:"نسخ"}, confirm:{ur:"تصدیق",ar:"تأكيد"}, approve:{ur:"منظور",ar:"اعتماد"}, post:{ur:"پوسٹ",ar:"ترحيل"}, reverse:{ur:"واپس",ar:"عكس"}, continue:{ur:"جاری",ar:"متابعة"}, submit:{ur:"جمع",ar:"إرسال"},
  new:{ur:"نیا",ar:"جديد"}, all:{ur:"سب",ar:"الكل"}, active:{ur:"فعال",ar:"نشط"}, inactive:{ur:"غیر فعال",ar:"غير نشط"}, draft:{ur:"مسودہ",ar:"مسودة"}, posted:{ur:"پوسٹ شدہ",ar:"مرحّل"}, pending:{ur:"زیر التوا",ar:"قيد الانتظار"}, completed:{ur:"مکمل",ar:"مكتمل"}, closed:{ur:"بند",ar:"مغلق"}, cancelled:{ur:"منسوخ",ar:"ملغى"}, approved:{ur:"منظور شدہ",ar:"معتمد"}, rejected:{ur:"مسترد",ar:"مرفوض"}, status:{ur:"حالت",ar:"الحالة"}, type:{ur:"قسم",ar:"النوع"}, mode:{ur:"موڈ",ar:"الوضع"}, required:{ur:"ضروری",ar:"مطلوب"}, optional:{ur:"اختیاری",ar:"اختياري"},
  name:{ur:"نام",ar:"الاسم"}, code:{ur:"کوڈ",ar:"الرمز"}, number:{ur:"نمبر",ar:"الرقم"}, no:{ur:"نمبر",ar:"رقم"}, date:{ur:"تاریخ",ar:"التاريخ"}, time:{ur:"وقت",ar:"الوقت"}, from:{ur:"سے",ar:"من"}, to:{ur:"تک",ar:"إلى"}, reference:{ur:"حوالہ",ar:"المرجع"}, description:{ur:"تفصیل",ar:"الوصف"}, note:{ur:"نوٹ",ar:"ملاحظة"}, notes:{ur:"نوٹس",ar:"ملاحظات"}, reason:{ur:"وجہ",ar:"السبب"}, remarks:{ur:"ریمارکس",ar:"ملاحظات"},
  item:{ur:"آئٹم",ar:"الصنف"}, items:{ur:"آئٹمز",ar:"الأصناف"}, customer:{ur:"گاہک",ar:"العميل"}, customers:{ur:"گاہک",ar:"العملاء"}, supplier:{ur:"سپلائر",ar:"المورد"}, suppliers:{ur:"سپلائرز",ar:"الموردون"}, employee:{ur:"ملازم",ar:"الموظف"}, employees:{ur:"ملازمین",ar:"الموظفون"}, warehouse:{ur:"ویئرہاؤس",ar:"المستودع"}, warehouses:{ur:"ویئرہاؤسز",ar:"المستودعات"}, godown:{ur:"گودام",ar:"المخزن"}, godowns:{ur:"گودام",ar:"المخازن"}, branch:{ur:"برانچ",ar:"الفرع"}, company:{ur:"کمپنی",ar:"الشركة"}, business:{ur:"کاروبار",ar:"الأعمال"}, unit:{ur:"اکائی",ar:"الوحدة"}, location:{ur:"مقام",ar:"الموقع"}, category:{ur:"کیٹیگری",ar:"الفئة"}, grade:{ur:"گریڈ",ar:"الدرجة"}, size:{ur:"سائز",ar:"المقاس"}, sku:{ur:"ایس کے یو",ar:"SKU"},
  sales:{ur:"سیلز",ar:"المبيعات"}, sale:{ur:"فروخت",ar:"بيع"}, purchase:{ur:"خریداری",ar:"الشراء"}, purchases:{ur:"خریداریاں",ar:"المشتريات"}, invoice:{ur:"انوائس",ar:"فاتورة"}, invoices:{ur:"انوائسز",ar:"فواتير"}, order:{ur:"آرڈر",ar:"طلب"}, orders:{ur:"آرڈرز",ar:"طلبات"}, consolidated:{ur:"مشترکہ",ar:"مجمعة"}, return:{ur:"واپسی",ar:"مرتجع"}, returns:{ur:"واپسیاں",ar:"مرتجعات"}, charge:{ur:"چارج",ar:"رسم"}, charges:{ur:"چارجز",ar:"رسوم"},
  stock:{ur:"اسٹاک",ar:"المخزون"}, inventory:{ur:"اسٹاک",ar:"المخزون"}, movement:{ur:"موومنٹ",ar:"حركة"}, movements:{ur:"موومنٹس",ar:"حركات"}, quantity:{ur:"مقدار",ar:"الكمية"}, qty:{ur:"مقدار",ar:"الكمية"}, rate:{ur:"ریٹ",ar:"السعر"}, price:{ur:"قیمت",ar:"السعر"}, cost:{ur:"لاگت",ar:"التكلفة"}, value:{ur:"مالیت",ar:"القيمة"}, weight:{ur:"وزن",ar:"الوزن"}, opening:{ur:"ابتدائی",ar:"افتتاحي"}, closing:{ur:"اختتامی",ar:"ختامي"}, current:{ur:"موجودہ",ar:"الحالي"}, available:{ur:"دستیاب",ar:"متاح"}, transfer:{ur:"منتقلی",ar:"تحويل"}, adjustment:{ur:"ایڈجسٹمنٹ",ar:"تسوية"},
  production:{ur:"پیداوار",ar:"الإنتاج"}, furnace:{ur:"فرنس",ar:"الفرن"}, mill:{ur:"مل",ar:"الدرفلة"}, work:{ur:"کام",ar:"عمل"}, cutting:{ur:"کٹنگ",ar:"القطع"}, loading:{ur:"لوڈنگ",ar:"التحميل"}, unloading:{ur:"ان لوڈنگ",ar:"التفريغ"}, gate:{ur:"گیٹ",ar:"البوابة"}, pass:{ur:"پاس",ar:"تصريح"}, vehicle:{ur:"گاڑی",ar:"المركبة"}, driver:{ur:"ڈرائیور",ar:"السائق"}, tare:{ur:"خالی وزن",ar:"الوزن الفارغ"}, gross:{ur:"مجموعی",ar:"الإجمالي"}, net:{ur:"خالص",ar:"الصافي"},
  accounting:{ur:"اکاؤنٹنگ",ar:"المحاسبة"}, account:{ur:"اکاؤنٹ",ar:"الحساب"}, accounts:{ur:"اکاؤنٹس",ar:"الحسابات"}, journal:{ur:"جرنل",ar:"اليومية"}, entry:{ur:"اندراج",ar:"قيد"}, entries:{ur:"اندراجات",ar:"قيود"}, ledger:{ur:"لیجر",ar:"دفتر الأستاذ"}, ledgers:{ur:"لیجرز",ar:"دفاتر الأستاذ"}, debit:{ur:"ڈیبٹ",ar:"مدين"}, credit:{ur:"کریڈٹ",ar:"دائن"}, cash:{ur:"نقد",ar:"نقد"}, bank:{ur:"بینک",ar:"البنك"}, payment:{ur:"ادائیگی",ar:"الدفع"}, payments:{ur:"ادائیگیاں",ar:"المدفوعات"}, receipt:{ur:"وصولی",ar:"الإيصال"}, receipts:{ur:"وصولیاں",ar:"الإيصالات"}, balance:{ur:"بیلنس",ar:"الرصيد"}, balances:{ur:"بیلنس",ar:"الأرصدة"}, amount:{ur:"رقم",ar:"المبلغ"}, total:{ur:"کل",ar:"الإجمالي"}, subtotal:{ur:"ذیلی کل",ar:"المجموع الفرعي"}, outstanding:{ur:"بقایا",ar:"المستحق"}, receivable:{ur:"قابل وصول",ar:"مستحق القبض"}, receivables:{ur:"قابل وصول",ar:"الذمم المدينة"}, payable:{ur:"قابل ادائیگی",ar:"مستحق الدفع"}, payables:{ur:"قابل ادائیگی",ar:"الذمم الدائنة"}, profit:{ur:"منافع",ar:"الربح"}, loss:{ur:"نقصان",ar:"الخسارة"}, margin:{ur:"مارجن",ar:"الهامش"}, revenue:{ur:"آمدنی",ar:"الإيراد"}, expense:{ur:"خرچ",ar:"المصروف"}, expenses:{ur:"اخراجات",ar:"المصروفات"}, tax:{ur:"ٹیکس",ar:"الضريبة"}, vat:{ur:"وی اے ٹی",ar:"ضريبة القيمة المضافة"}, discount:{ur:"رعایت",ar:"الخصم"}, mapping:{ur:"میپنگ",ar:"الربط"}, reconciliation:{ur:"ریکَنسیلی ایشن",ar:"التسوية"}, period:{ur:"پیریڈ",ar:"الفترة"}, year:{ur:"سال",ar:"السنة"}, audit:{ur:"آڈٹ",ar:"التدقيق"}, trail:{ur:"ٹریل",ar:"السجل"},
  report:{ur:"رپورٹ",ar:"تقرير"}, reports:{ur:"رپورٹس",ar:"التقارير"}, summary:{ur:"خلاصہ",ar:"ملخص"}, performance:{ur:"کارکردگی",ar:"الأداء"}, aging:{ur:"ایجنگ",ar:"الأعمار"}, history:{ur:"ہسٹری",ar:"السجل"}, profitability:{ur:"منافع",ar:"الربحية"}, collection:{ur:"وصولی",ar:"التحصيل"}, turnover:{ur:"ٹرن اوور",ar:"الدوران"}, valuation:{ur:"مالیت",ar:"التقييم"}, exception:{ur:"مسئلہ",ar:"استثناء"}, exceptions:{ur:"مسائل",ar:"الاستثناءات"}, control:{ur:"کنٹرول",ar:"الرقابة"}, controls:{ur:"کنٹرولز",ar:"الضوابط"}, settings:{ur:"سیٹنگز",ar:"الإعدادات"}, setup:{ur:"سیٹ اپ",ar:"الإعداد"}, document:{ur:"دستاویز",ar:"المستند"}, documents:{ur:"دستاویزات",ar:"المستندات"}, language:{ur:"زبان",ar:"اللغة"}, screen:{ur:"اسکرین",ar:"الشاشة"}, primary:{ur:"بنیادی",ar:"أساسية"}, secondary:{ur:"ثانوی",ar:"ثانوية"}, single:{ur:"ایک",ar:"واحدة"}, bilingual:{ur:"دو زبانیں",ar:"ثنائي اللغة"}, logo:{ur:"لوگو",ar:"الشعار"}, header:{ur:"ہیڈر",ar:"الرأس"}, footer:{ur:"فوٹر",ar:"التذييل"}, page:{ur:"صفحہ",ar:"الصفحة"}, pages:{ur:"صفحات",ar:"الصفحات"}, orientation:{ur:"سمت",ar:"الاتجاه"}, portrait:{ur:"عمودی",ar:"عمودي"}, landscape:{ur:"افقی",ar:"أفقي"}, signature:{ur:"دستخط",ar:"التوقيع"}, signatures:{ur:"دستخط",ar:"التوقيعات"},
  filter:{ur:"فلٹر",ar:"تصفية"}, filters:{ur:"فلٹرز",ar:"عوامل التصفية"}, show:{ur:"دکھائیں",ar:"إظهار"}, hide:{ur:"چھپائیں",ar:"إخفاء"}, selected:{ur:"منتخب",ar:"محدد"}, visible:{ur:"ظاہر",ar:"ظاهر"}, hidden:{ur:"چھپا",ar:"مخفي"}, column:{ur:"کالم",ar:"عمود"}, columns:{ur:"کالمز",ar:"أعمدة"}, row:{ur:"قطار",ar:"صف"}, rows:{ur:"قطاریں",ar:"صفوف"}, result:{ur:"نتیجہ",ar:"نتيجة"}, results:{ur:"نتائج",ar:"نتائج"}, found:{ur:"ملا",ar:"موجود"}, loading:{ur:"لوڈنگ",ar:"تحميل"}, saving:{ur:"محفوظ",ar:"حفظ"}, live:{ur:"لائیو",ar:"مباشر"}, data:{ur:"ڈیٹا",ar:"بيانات"}, details:{ur:"تفصیلات",ar:"التفاصيل"}, information:{ur:"معلومات",ar:"معلومات"}, alert:{ur:"الرٹ",ar:"تنبيه"}, alerts:{ur:"الرٹس",ar:"تنبيهات"}, quick:{ur:"فوری",ar:"سريع"}, links:{ur:"روابط",ar:"روابط"},
  phone:{ur:"فون",ar:"الهاتف"}, email:{ur:"ای میل",ar:"البريد الإلكتروني"}, address:{ur:"پتہ",ar:"العنوان"}, website:{ur:"ویب سائٹ",ar:"الموقع الإلكتروني"}, currency:{ur:"کرنسی",ar:"العملة"}, salesperson:{ur:"سیلز پرسن",ar:"مندوب المبيعات"}, method:{ur:"طریقہ",ar:"الطريقة"}, prepared:{ur:"تیار",ar:"أعد"}, checked:{ur:"جانچ",ar:"راجع"}, by:{ur:"بذریعہ",ar:"بواسطة"}, approved:{ur:"منظور",ar:"معتمد"},
  with:{ur:"کے ساتھ",ar:"مع"}, without:{ur:"کے بغیر",ar:"بدون"}, and:{ur:"اور",ar:"و"}, or:{ur:"یا",ar:"أو"}, only:{ur:"صرف",ar:"فقط"}, this:{ur:"یہ",ar:"هذا"}, month:{ur:"مہینہ",ar:"الشهر"}, months:{ur:"مہینے",ar:"أشهر"}, today:{ur:"آج",ar:"اليوم"}, previous:{ur:"پچھلا",ar:"السابق"}, next:{ur:"اگلا",ar:"التالي"}, first:{ur:"پہلا",ar:"الأول"}, last:{ur:"آخری",ar:"الأخير"},
};

const PHRASE_REPLACEMENTS: Array<[string, Translation]> = [
  ["click to view details", { ur: "تفصیلات دیکھنے کے لیے کلک کریں", ar: "انقر لعرض التفاصيل" }],
  ["posted documents", { ur: "پوسٹ شدہ دستاویزات", ar: "المستندات المرحلة" }],
  ["current stock quantity", { ur: "موجودہ اسٹاک مقدار", ar: "كمية المخزون الحالية" }],
  ["stock items need attention", { ur: "اسٹاک آئٹمز توجہ چاہتے ہیں", ar: "أصناف المخزون تحتاج إلى مراجعة" }],
  ["work orders pending", { ur: "ورک آرڈرز زیر التوا", ar: "أوامر العمل قيد الانتظار" }],
  ["posted ledger balance", { ur: "پوسٹ شدہ لیجر بیلنس", ar: "رصيد دفتر الأستاذ المرحّل" }],
  ["mapped cash account", { ur: "میپ شدہ کیش اکاؤنٹ", ar: "حساب النقد المرتبط" }],
  ["mapped bank account", { ur: "میپ شدہ بینک اکاؤنٹ", ar: "حساب البنك المرتبط" }],
  ["auto refreshes every minute", { ur: "ہر منٹ خودکار تازہ ہوتا ہے", ar: "يتم التحديث تلقائياً كل دقيقة" }],
  ["no balances for this period", { ur: "اس مدت کے لیے کوئی بیلنس نہیں", ar: "لا توجد أرصدة لهذه الفترة" }],
  ["from date cannot be after to date", { ur: "شروع کی تاریخ اختتامی تاریخ کے بعد نہیں ہو سکتی", ar: "لا يمكن أن يكون تاريخ البداية بعد تاريخ النهاية" }],
  ["unable to load", { ur: "لوڈ نہیں ہو سکا", ar: "تعذر التحميل" }],
  ["search invoice, party, item, payment, journal, work order, gate pass", { ur: "انوائس، پارٹی، آئٹم، ادائیگی، جرنل، ورک آرڈر، گیٹ پاس تلاش کریں", ar: "ابحث عن فاتورة أو طرف أو صنف أو دفعة أو قيد أو أمر عمل أو تصريح بوابة" }],
];

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label"] as const;
const GENERIC_UI_TAGS = new Set(["BUTTON", "LABEL", "H1", "H2", "H3", "H4", "H5", "H6", "TH", "OPTION", "LEGEND", "SUMMARY"]);
const UI_CLASS_HINT = /(btn|button|label|title|heading|menu|nav|tab|badge|pill|filter|toolbar|action|error|warning|alert|hint|help|subtitle)/i;

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

function hasLatinLetters(value: string) {
  return /[A-Za-z]/.test(value);
}

function normalizePhrase(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function splitLegacyLabel(value: string) {
  const parts = value.trim().split("/").map((part) => normalizePhrase(part)).filter(Boolean);
  const english = parts.find((part) => hasLatinLetters(part) && !hasRtlScript(part)) || normalizePhrase(value);
  const urdu = parts.find((part) => hasRtlScript(part)) || null;
  return { english, urdu, isLegacyBilingual: parts.length > 1 && Boolean(urdu) };
}

function normalizeLookup(value: string) {
  return normalizePhrase(value).replace(/\s*([:;,.!?()])\s*/g, "$1 ").trim().toLowerCase();
}

function translateWords(value: string, languageCode: UiLanguage) {
  if (languageCode === "en" || !hasLatinLetters(value)) return value;
  let output = value;
  for (const [phrase, translation] of PHRASE_REPLACEMENTS) {
    const translated = translation[languageCode];
    if (!translated) continue;
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(escaped, "gi"), translated);
  }
  output = output.replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, (token) => {
    const lower = token.toLowerCase();
    const translated = WORD_TRANSLATIONS[lower]?.[languageCode];
    return translated || token;
  });
  return output;
}

function translateExact(english: string, languageCode: UiLanguage, embeddedUrdu: string | null, allowGeneric: boolean) {
  if (languageCode === "en") return english;
  const exact = UI_TRANSLATIONS[normalizePhrase(english)]?.[languageCode];
  if (exact) return exact;
  if (languageCode === "ur" && embeddedUrdu) return embeddedUrdu;
  return allowGeneric ? translateWords(english, languageCode) : english;
}

function isGenericUiText(node: Text) {
  const parent = node.parentElement;
  if (!parent) return false;
  if (parent.closest("[data-i18n-skip='true']")) return false;
  if (parent.closest("input, textarea, script, style, code, pre")) return false;
  if (GENERIC_UI_TAGS.has(parent.tagName)) return true;
  if (parent.closest("button, label, nav, [role='button'], [role='menuitem'], [role='tab'], [role='alert'], [role='dialog'] h1, [role='dialog'] h2, [role='dialog'] h3")) return true;
  if (UI_CLASS_HINT.test(parent.className || "")) return true;
  return false;
}

function selectLanguageText(value: string, language: RuntimeLanguage, allowGeneric = false) {
  if (!value.trim()) return value;
  const leading = value.match(/^\s*/)?.[0] || "";
  const trailing = value.match(/\s*$/)?.[0] || "";
  const { english, urdu, isLegacyBilingual } = splitLegacyLabel(value);
  const known = Boolean(UI_TRANSLATIONS[normalizePhrase(english)]);
  const shouldTranslate = isLegacyBilingual || known || allowGeneric;
  if (!shouldTranslate) return value;

  const requested = language.mode === "bilingual" && language.secondary
    ? [language.primary, language.secondary]
    : [language.primary];
  const supported = requested.filter((code): code is UiLanguage => code === "en" || code === "ur" || code === "ar");
  const safeRequested: UiLanguage[] = supported.length ? supported : ["en"];
  const rendered = safeRequested
    .map((code) => translateExact(english, code, urdu, allowGeneric || known || isLegacyBilingual))
    .filter((part, index, all) => part && all.indexOf(part) === index);
  return `${leading}${rendered.join(" / ")}${trailing}`;
}

function processTextNode(node: Text, language: RuntimeLanguage) {
  const current = node.nodeValue || "";
  if (!current.trim()) return;
  const previousSource = originalText.get(node);
  if (!previousSource) originalText.set(node, current);
  const source = originalText.get(node) || current;
  const expected = selectLanguageText(source, language, isGenericUiText(node));

  if (previousSource && current !== source && current !== expected) {
    originalText.set(node, current);
    const next = selectLanguageText(current, language, isGenericUiText(node));
    if (node.nodeValue !== next) node.nodeValue = next;
    return;
  }
  if (node.nodeValue !== expected) node.nodeValue = expected;
}

function processElementAttributes(element: Element, language: RuntimeLanguage) {
  if (element.closest("[data-i18n-skip='true']")) return;
  let originals = originalAttributes.get(element);
  if (!originals) {
    originals = new Map<string, string>();
    originalAttributes.set(element, originals);
  }
  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const stored = originals.get(attribute);
    const expected = stored ? selectLanguageText(stored, language, true) : "";
    if (!stored || (current !== stored && current !== expected)) originals.set(attribute, current);
    const source = originals.get(attribute) || current;
    const next = selectLanguageText(source, language, true);
    if (current !== next) element.setAttribute(attribute, next);
  }

  if (language.mode === "single" && (language.primary === "ur" || language.primary === "ar")) {
    if (element.matches("button, label, h1, h2, h3, h4, h5, h6, th, option, [role='button'], [role='menuitem'], [role='tab']")) element.setAttribute("dir", "rtl");
  } else if (element.hasAttribute("dir") && element.getAttribute("dir") === "rtl" && !element.matches("input[dir='rtl'], textarea[dir='rtl']")) {
    element.removeAttribute("dir");
  }
}

function translateTree(root: Node, language: RuntimeLanguage) {
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
