import * as Lucide from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { canViewModule, roleLabel, type ModuleKey } from "@/auth/permissions";
import { APP_CONFIG } from "@/config/app";

type NavNode = {
  key: string;
  label: string;
  to?: string;
  end?: boolean;
  module?: ModuleKey;
  ownerOnly?: boolean;
  icon?: Lucide.LucideIcon;
  children?: NavNode[];
};

const navigation: NavNode[] = [
  {
    key: "dashboard",
    to: "/",
    label: "Dashboard / ڈیش بورڈ",
    icon: Lucide.LayoutDashboard,
    end: true,
    module: "dashboard",
  },
  {
    key: "master",
    label: "Master Data / ماسٹر ڈیٹا",
    icon: Lucide.Database,
    module: "master",
    children: [
      {
        key: "master-parties",
        label: "Items & Parties / آئٹمز و پارٹیز",
        children: [
          { key: "items", to: "/master-data", label: "Items / آئٹمز", end: true, module: "master" },
          { key: "customers", to: "/master-data/customers", label: "Customers / گاہک", module: "master" },
          { key: "suppliers", to: "/master-data/suppliers", label: "Suppliers / سپلائرز", module: "master" },
          { key: "employees", to: "/master-data/employees", label: "Employees / ملازمین", module: "master" },
        ],
      },
      {
        key: "master-logistics",
        label: "Locations & Units / مقامات و اکائیاں",
        children: [
          { key: "warehouses", to: "/master-data/warehouses", label: "Warehouses / ویئرہاؤسز", module: "master" },
          { key: "uom", to: "/master-data/uom", label: "Units of Measure / پیمائشی اکائیاں", module: "master" },
          { key: "transporters", to: "/master-data/transporters", label: "Transporters / ٹرانسپورٹرز", module: "master" },
        ],
      },
      {
        key: "master-commercial",
        label: "Commercial Masters / کمرشل ماسٹرز",
        children: [
          { key: "charges", to: "/sales/charges", label: "Charge Master / چارج ماسٹر", module: "master" },
        ],
      },
    ],
  },
  {
    key: "sales",
    label: "Sales / سیلز",
    icon: Lucide.ShoppingCart,
    module: "sales",
    children: [
      {
        key: "sales-docs",
        label: "Sales Documents / سیلز دستاویزات",
        children: [
          { key: "sales-invoices", to: "/sales", label: "Sales Invoices / سیلز انوائسز", end: true, module: "sales" },
          { key: "sales-consolidated", to: "/sales/consolidated", label: "Consolidated Invoices / مشترکہ انوائسز", module: "sales" },
        ],
      },
    ],
  },
  {
    key: "purchase",
    to: "/purchase",
    label: "Purchase / خریداری",
    icon: Lucide.Truck,
    module: "purchase",
  },
  {
    key: "inventory",
    label: "Inventory / Stock / اسٹاک",
    icon: Lucide.Boxes,
    module: "inventory",
    children: [
      {
        key: "inventory-operations",
        label: "Stock Operations / اسٹاک آپریشنز",
        children: [
          { key: "current-stock", to: "/godown", label: "Current Stock / موجودہ اسٹاک", end: true, module: "inventory" },
          { key: "stock-movements", to: "/godown/movements", label: "Stock Movements / اسٹاک موومنٹس", module: "inventory" },
        ],
      },
      {
        key: "inventory-reports",
        label: "Inventory Reports / اسٹاک رپورٹس",
        children: [
          { key: "stock-aging", to: "/godown/aging", label: "Stock Aging / اسٹاک ایجنگ", module: "reports" },
        ],
      },
      {
        key: "inventory-setup",
        label: "Inventory Setup / اسٹاک سیٹ اپ",
        children: [
          { key: "godowns-master", to: "/godown/master", label: "Godowns Master / گودام ماسٹر", module: "inventory" },
        ],
      },
    ],
  },
  {
    key: "production",
    label: "Production / Furnace & Mill",
    icon: Lucide.Factory,
    module: "production",
    children: [
      {
        key: "production-operations",
        label: "Production Operations / پروڈکشن آپریشنز",
        children: [
          { key: "work-orders", to: "/production", label: "Work Orders / ورک آرڈرز", end: true, module: "production" },
        ],
      },
      {
        key: "production-analysis",
        label: "Production Analysis / پروڈکشن تجزیہ",
        children: [
          { key: "furnace-yield", to: "/production/yields", label: "Furnace Yield / فرنس پیداوار", module: "production" },
        ],
      },
    ],
  },
  {
    key: "cutting",
    label: "Cutting & Loading / کٹنگ و لوڈنگ",
    icon: Lucide.Scissors,
    module: "production",
    children: [
      {
        key: "cutting-operations",
        label: "Cutting Operations / کٹنگ آپریشنز",
        children: [
          { key: "cutting-orders", to: "/cutting", label: "Cutting Orders / کٹنگ آرڈرز", end: true, module: "production" },
        ],
      },
      {
        key: "gate-operations",
        label: "Gate & Weighbridge / گیٹ و وزن کانٹا",
        children: [
          { key: "gate-pass", to: "/cutting/gate-pass", label: "Gate Pass & Weighbridge / گیٹ پاس و وزن کانٹا", module: "production" },
        ],
      },
    ],
  },
  {
    key: "accounting",
    label: "Accounting / اکاؤنٹنگ",
    icon: Lucide.Calculator,
    module: "accounting",
    children: [
      {
        key: "accounting-transactions",
        label: "Transactions / لین دین",
        children: [
          { key: "journal", to: "/accounting", label: "Journal Entries / جرنل اندراجات", end: true, module: "accounting" },
          { key: "cash-counter", to: "/accounting/cash-counter", label: "Cash Counter / کیش کاؤنٹر", module: "accounting" },
          { key: "returns", to: "/accounting/returns", label: "Credit / Debit Notes / ریٹرن نوٹس", module: "accounting" },
        ],
      },
      {
        key: "accounting-books",
        label: "Books & Ledgers / بکس و لیجرز",
        children: [
          { key: "day-book", to: "/accounting/day-book", label: "Day Book / روزنامچہ", module: "accounting" },
          { key: "ledgers", to: "/accounting/ledgers", label: "General Ledgers / جنرل لیجر", module: "accounting" },
          { key: "trial-balance", to: "/accounting/trial-balance", label: "Trial Balance / ٹرائل بیلنس", module: "accounting" },
        ],
      },
      {
        key: "accounting-statements",
        label: "Financial Statements / مالی بیانات",
        children: [
          { key: "profit-loss", to: "/accounting/profit-loss", label: "Profit & Loss / نفع و نقصان", module: "accounting" },
          { key: "balance-sheet", to: "/accounting/balance-sheet", label: "Balance Sheet / بیلنس شیٹ", module: "accounting" },
          { key: "cash-flow", to: "/accounting/cash-flow", label: "Cash Flow / کیش فلو", module: "accounting" },
        ],
      },
      {
        key: "accounting-closing",
        label: "Reconciliation & Closing / ریکنسیلی ایشن و کلوزنگ",
        children: [
          { key: "bank-recon", to: "/accounting/bank-reconciliation", label: "Bank Reconciliation / بینک ریکنسیلی ایشن", module: "accounting" },
          { key: "period-closing", to: "/accounting/periods", label: "Period Closing / پیریڈ کلوزنگ", module: "accounting" },
          { key: "year-closing", to: "/accounting/year-closing", label: "Year Closing / سالانہ اختتام", module: "accounting" },
        ],
      },
      {
        key: "accounting-setup",
        label: "Setup & Controls / سیٹ اپ و کنٹرولز",
        children: [
          { key: "coa", to: "/accounting/accounts", label: "Chart of Accounts / چارٹ آف اکاؤنٹس", module: "accounting" },
          { key: "mapping", to: "/accounting/mappings", label: "Account Mapping / اکاؤنٹ میپنگ", module: "accounting" },
          { key: "financial-controls", to: "/accounting/controls", label: "Financial Controls / مالی کنٹرولز", module: "accounting" },
          { key: "audit-trail", to: "/accounting/audit-trail", label: "Audit Trail / آڈٹ ٹریل", module: "accounting" },
        ],
      },
    ],
  },
  {
    key: "reports",
    label: "Reports / رپورٹس",
    icon: Lucide.ChartNoAxesCombined,
    module: "reports",
    children: [
      { key: "reports-overview", to: "/reports", label: "Reports Overview / رپورٹس", end: true, module: "reports" },
      {
        key: "reports-inventory",
        label: "Inventory Reports / اسٹاک رپورٹس",
        children: [
          { key: "steel-stock", to: "/reports/steel-stock", label: "Steel Stock Control / اسٹیل اسٹاک کنٹرول", module: "reports" },
          { key: "aging-report", to: "/godown/aging", label: "Stock Aging Report / اسٹاک ایجنگ", module: "reports" },
        ],
      },
      {
        key: "reports-sales",
        label: "Sales Reports / سیلز رپورٹس",
        children: [
          { key: "salesperson-report", to: "/sales/report", label: "Salesperson Performance / سیلز پرسن", module: "reports" },
        ],
      },
      {
        key: "reports-accounting",
        label: "Accounting Reports / اکاؤنٹنگ رپورٹس",
        children: [
          { key: "customer-statement", to: "/accounting/customer-invoice-statement", label: "Customer Statement & Aging / گاہک اسٹیٹمنٹ", module: "accounting" },
        ],
      },
    ],
  },
  {
    key: "owner",
    to: "/owner",
    label: "Owner Control / مالک کنٹرول",
    icon: Lucide.ShieldCheck,
    ownerOnly: true,
  },
  {
    key: "settings",
    label: "Settings / سیٹنگز",
    icon: Lucide.Settings,
    module: "settings",
    children: [
      { key: "company-settings", to: "/settings", label: "Company / کمپنی", end: true, module: "settings" },
      { key: "tax-settings", to: "/settings/tax", label: "Tax & Charges / ٹیکس و چارجز", module: "settings" },
      { key: "document-settings", to: "/settings/documents", label: "Document & Print / ڈاکومنٹ و پرنٹ", module: "settings" },
    ],
  },
];

const pageLabels: Record<string, string> = {
  "/": "Dashboard / ڈیش بورڈ",
  "/master-data": "Items / آئٹمز",
  "/master-data/customers": "Customers / گاہک",
  "/master-data/suppliers": "Suppliers / سپلائرز",
  "/master-data/employees": "Employees / ملازمین",
  "/master-data/warehouses": "Warehouses / ویئرہاؤسز",
  "/master-data/uom": "Units of Measure / پیمائشی اکائیاں",
  "/master-data/transporters": "Transporters / ٹرانسپورٹرز",
  "/sales": "Sales Invoices / سیلز انوائسز",
  "/sales/consolidated": "Consolidated Invoices / مشترکہ انوائسز",
  "/sales/report": "Salesperson Performance / سیلز پرسن",
  "/sales/charges": "Charge Master / چارج ماسٹر",
  "/purchase": "Purchase / خریداری",
  "/godown": "Current Stock / موجودہ اسٹاک",
  "/godown/movements": "Stock Movements / اسٹاک موومنٹس",
  "/godown/aging": "Stock Aging Report / اسٹاک ایجنگ",
  "/godown/master": "Godowns Master / گودام ماسٹر",
  "/production": "Work Orders / ورک آرڈرز",
  "/production/yields": "Furnace Yield / فرنس پیداوار",
  "/cutting": "Cutting Orders / کٹنگ آرڈرز",
  "/cutting/gate-pass": "Gate Pass & Weighbridge / گیٹ پاس و وزن کانٹا",
  "/accounting": "Journal Entries / جرنل اندراجات",
  "/accounting/cash-counter": "Cash Counter / کیش کاؤنٹر",
  "/accounting/day-book": "Day Book / روزنامچہ",
  "/accounting/accounts": "Chart of Accounts / چارٹ آف اکاؤنٹس",
  "/accounting/ledgers": "General Ledgers / جنرل لیجر",
  "/accounting/trial-balance": "Trial Balance / ٹرائل بیلنس",
  "/accounting/profit-loss": "Profit & Loss / نفع و نقصان",
  "/accounting/balance-sheet": "Balance Sheet / بیلنس شیٹ",
  "/accounting/audit-trail": "Audit Trail / آڈٹ ٹریل",
  "/accounting/mappings": "Account Mapping / اکاؤنٹ میپنگ",
  "/accounting/periods": "Period Closing / پیریڈ کلوزنگ",
  "/accounting/returns": "Credit / Debit Notes / ریٹرن نوٹس",
  "/accounting/bank-reconciliation": "Bank Reconciliation / بینک ریکنسیلی ایشن",
  "/accounting/year-closing": "Year Closing / سالانہ اختتام",
  "/accounting/cash-flow": "Cash Flow / کیش فلو",
  "/accounting/controls": "Financial Controls / مالی کنٹرولز",
  "/accounting/customer-invoice-statement": "Customer Statement & Aging / گاہک اسٹیٹمنٹ",
  "/reports": "Reports / رپورٹس",
  "/reports/steel-stock": "Steel Stock Control / اسٹیل اسٹاک کنٹرول",
  "/owner": "Owner Control / مالک کنٹرول",
  "/settings": "Company Settings / کمپنی سیٹنگز",
  "/settings/tax": "Tax & Charges / ٹیکس و چارجز",
  "/settings/documents": "Document & Print / ڈاکومنٹ و پرنٹ",
};

function nodeMatches(node: NavNode, pathname: string): boolean {
  const ownMatch = Boolean(
    node.to &&
      (pathname === node.to ||
        (!node.end && node.to !== "/" && pathname.startsWith(`${node.to}/`)))
  );
  return ownMatch || Boolean(node.children?.some((child) => nodeMatches(child, pathname)));
}

function filterNode(node: NavNode, role: string | undefined, isPlatformOwner: boolean): NavNode | null {
  if (node.ownerOnly && !isPlatformOwner) return null;
  if (node.module && !canViewModule(role as never, node.module, isPlatformOwner)) return null;

  const children = node.children
    ?.map((child) => filterNode(child, role, isPlatformOwner))
    .filter(Boolean) as NavNode[] | undefined;

  if (node.children && !children?.length && !node.to) return null;
  return { ...node, children };
}

function pageTitle(pathname: string) {
  if (pageLabels[pathname]) return pageLabels[pathname];
  const match = Object.entries(pageLabels)
    .filter(([path]) => path !== "/" && pathname.startsWith(`${path}/`))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return match?.[1] ?? "MetalForge OS";
}

function breadcrumbItems(pathname: string) {
  if (pathname === "/") return [{ to: "/", label: "Dashboard / ڈیش بورڈ" }];
  const parts = pathname.split("/").filter(Boolean);
  const items = [{ to: "/", label: "Dashboard / ڈیش بورڈ" }];
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    items.push({
      to: current,
      label: pageLabels[current] ?? part.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    });
  }
  return items;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, signOut, isPlatformOwner, activeCompany } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const role = activeCompany?.membership_role;

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({});
  const [appTheme, setAppTheme] = useState<"light" | "dark" | "black">(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("metalforge-dashboard-preferences-v2") || "{}");
      return saved.theme === "dark" || saved.theme === "black" ? saved.theme : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-mf-theme", appTheme);
    try {
      const key = "metalforge-dashboard-preferences-v2";
      const current = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...current, theme: appTheme }));
    } catch {
      // Ignore malformed local preference.
    }
  }, [appTheme]);

  const visibleNavigation = useMemo(
    () => navigation.map((node) => filterNode(node, role, isPlatformOwner)).filter(Boolean) as NavNode[],
    [role, isPlatformOwner]
  );

  const title = useMemo(() => pageTitle(location.pathname), [location.pathname]);
  const breadcrumbs = useMemo(() => breadcrumbItems(location.pathname), [location.pathname]);
  const moduleIndex = useMemo(() => {
    if (location.pathname === "/") return "/";
    const first = location.pathname.split("/").filter(Boolean)[0];
    if (first === "accounting") return "/accounting";
    if (first === "master-data") return "/master-data";
    if (first === "godown") return "/godown";
    if (first === "production") return "/production";
    if (first === "cutting") return "/cutting";
    if (first === "settings") return "/settings";
    if (first === "reports") return "/reports";
    if (first === "sales") return "/sales";
    if (first === "purchase") return "/purchase";
    return "/";
  }, [location.pathname]);

  const logout = async () => {
    await signOut();
    navigate("/login");
  };

  const renderNode = (node: NavNode, depth = 0): ReactNode => {
    const active = nodeMatches(node, location.pathname);
    const hasChildren = Boolean(node.children?.length);
    const expanded = openNodes[node.key] ?? active;
    const Icon = node.icon;

    if (hasChildren) {
      return (
        <div key={node.key} className={depth === 0 ? "mb-0.5" : "mb-0.5"}>
          <button
            type="button"
            onClick={() => setOpenNodes((current) => ({ ...current, [node.key]: !expanded }))}
            className={[
              "flex w-full items-center rounded-md text-left transition-colors",
              depth === 0 ? "min-h-9 gap-2 px-2 py-2 text-[13px] font-bold" : "min-h-8 gap-2 px-2 py-1.5 text-[12.5px] font-semibold",
              active
                ? depth === 0
                  ? "bg-white/[0.09] text-white"
                  : "bg-blue-500/10 text-blue-200"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
            ].join(" ")}
          >
            {Icon ? (
              <span className={active ? "text-blue-400" : "text-slate-500"}><Icon className="h-4 w-4" /></span>
            ) : (
              <span className="flex h-4 w-4 items-center justify-center text-slate-600">•</span>
            )}
            <span className="min-w-0 flex-1 truncate">{node.label}</span>
            <Lucide.ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>

          {expanded && !collapsed && (
            <div className={depth === 0 ? "ml-4 mt-1 border-l border-white/10 pl-2" : "ml-3 mt-1 border-l border-white/10 pl-2"}>
              {node.children?.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    if (!node.to) return null;

    return (
      <NavLink
        key={node.key}
        to={node.to}
        end={node.end}
        onClick={() => setMobileOpen(false)}
        title={collapsed ? node.label : undefined}
        className={({ isActive }) => [
          "flex min-h-8 items-center rounded-md transition-colors",
          collapsed && depth === 0 ? "justify-center px-1" : "gap-2 px-2 py-1.5",
          depth === 0 ? "text-[13px] font-bold" : "text-[12.5px] font-semibold",
          isActive ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
        ].join(" ")}
      >
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        {!collapsed && <span className="min-w-0 flex-1 truncate">{node.label}</span>}
      </NavLink>
    );
  };

  const sidebarWidth = collapsed ? "lg:w-[68px]" : "lg:w-[252px]";
  const contentOffset = collapsed ? "lg:ml-[68px]" : "lg:ml-[252px]";

  return (
    <div className="erp-shell min-h-screen bg-[#f6f7f9] text-slate-900">
      {mobileOpen && (
        <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" />
      )}

      <aside className={[
        "fixed inset-y-0 left-0 z-50 flex w-[252px] flex-col border-r border-[#1e293b] bg-[#0f1726] text-slate-300 transition-all duration-200",
        sidebarWidth,
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      ].join(" ")}>
        <div className="flex h-16 items-center border-b border-white/10 px-3">
          <div className={`flex min-w-0 items-center ${collapsed ? "w-full justify-center" : "gap-2.5"}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <Lucide.Layers3 className="h-5 w-5" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-[14px] font-black text-white">{APP_CONFIG.name}</div>
                <div className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{APP_CONFIG.tagline}</div>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <div className="space-y-1">{visibleNavigation.map((node) => renderNode(node))}</div>
        </nav>

        <div className="border-t border-white/10 p-2">
          {!collapsed && (
            <div className="mb-2 rounded-md bg-white/[0.03] px-2 py-2">
              <div className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-600">Active Company</div>
              <div className="truncate text-[12px] font-bold text-slate-300">{activeCompany?.company_name ?? (isPlatformOwner ? "Owner Workspace" : "No company")}</div>
              <div className="mt-1 truncate text-[11px] text-slate-500">{user?.email ?? "Signed in"} · {isPlatformOwner ? "Platform Owner" : roleLabel(role)}</div>
            </div>
          )}
          <button type="button" onClick={logout} className="flex h-9 w-full items-center justify-center gap-2 rounded-md text-[12px] font-bold text-slate-500 hover:bg-white/5 hover:text-white">
            <Lucide.LogOut className="h-4 w-4" /> {!collapsed && "Sign out / لاگ آؤٹ"}
          </button>
        </div>
      </aside>

      <div className={["min-h-screen transition-all duration-200", contentOffset].join(" ")}>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center gap-3 px-4 py-2 lg:px-5">
            <button type="button" onClick={() => setMobileOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 lg:hidden">
              <Lucide.Menu className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setCollapsed((v) => !v)} className="hidden h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 lg:flex" title={collapsed ? "Expand navigation" : "Collapse navigation"}>
              <Lucide.PanelLeftClose className={`h-4 w-4 ${collapsed ? "rotate-180" : ""}`} />
            </button>

            {location.pathname !== "/" && (
              <button type="button" onClick={() => navigate(-1)} className="hidden h-9 items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 text-[13px] font-black text-blue-800 shadow-sm hover:bg-blue-100 sm:inline-flex">
                <Lucide.ArrowLeft className="h-4 w-4" /> Back / واپس
              </button>
            )}
            {location.pathname !== "/" && (
              <button type="button" onClick={() => navigate(moduleIndex)} className="hidden h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-slate-100 px-3 text-[13px] font-black text-slate-800 shadow-sm hover:bg-slate-200 md:inline-flex">
                <Lucide.ListTree className="h-4 w-4" /> Index / فہرست
              </button>
            )}

            <div className="min-w-0 flex-1">
              <div className="hidden flex-wrap items-center gap-1.5 text-[12px] font-semibold text-slate-500 sm:flex">
                {breadcrumbs.map((crumb, index) => (
                  <div key={`${crumb.to}-${index}`} className="flex min-w-0 items-center gap-1.5">
                    {index > 0 && <Lucide.ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />}
                    {index === breadcrumbs.length - 1 ? (
                      <span className="max-w-[360px] truncate rounded-md bg-blue-50 px-2 py-1 font-black text-blue-700 ring-1 ring-inset ring-blue-200">{crumb.label}</span>
                    ) : (
                      <button type="button" onClick={() => navigate(crumb.to)} className="max-w-[220px] truncate rounded px-1.5 py-1 font-bold text-slate-600 hover:bg-slate-100 hover:text-blue-700">{crumb.label}</button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-0.5 truncate text-[16px] font-black text-slate-950">{title}</div>
            </div>

            <div className="hidden text-right lg:block">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Active Company / فعال کمپنی</div>
              <div className="max-w-[220px] truncate text-[12px] font-black text-slate-800">{activeCompany?.company_name ?? (isPlatformOwner ? "Owner Workspace" : APP_CONFIG.name)}</div>
            </div>
          </div>

          <div className="mf-global-theme-switcher" title="Application theme / ایپ تھیم">
            <button type="button" className={appTheme === "light" ? "active" : ""} onClick={() => setAppTheme("light")} aria-label="Light mode"><Lucide.Sun /></button>
            <button type="button" className={appTheme === "dark" ? "active" : ""} onClick={() => setAppTheme("dark")} aria-label="Dark mode"><Lucide.Moon /></button>
            <button type="button" className={appTheme === "black" ? "active" : ""} onClick={() => setAppTheme("black")} aria-label="Black mode"><Lucide.Circle className="mf-black-theme-icon" /></button>
          </div>
        </header>

        <main className="px-4 py-4 lg:px-5 lg:py-4">
          <div className="mx-auto w-full max-w-[1560px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
