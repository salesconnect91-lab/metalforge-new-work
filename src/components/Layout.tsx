import * as Lucide from "lucide-react";
import { useMemo, useState, type ReactNode, type ReactElement, useEffect} from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { canViewModule, roleLabel, type ModuleKey } from "@/auth/permissions";
import { APP_CONFIG } from "@/config/app";

type ChildItem = {
  to: string;
  label: string;
  end?: boolean;
  module?: ModuleKey;
};

type MainItem = {
  to: string;
  label: string;
  icon: () => ReactElement;
  end?: boolean;
  excludePaths?: string[];
  children?: ChildItem[];
  ownerOnly?: boolean;
  module?: ModuleKey;
};

const navigation: MainItem[] = [
  { to: "/", label: "Dashboard / ڈیش بورڈ", icon: HomeIcon, end: true, module: "dashboard" },
  {
    to: "/master-data",
    label: "Master Data / ماسٹر ڈیٹا",
    icon: DatabaseIcon,
    module: "master",
    children: [
      {
        to: "/master-data",
        label: "All Master Data / تمام ماسٹر ڈیٹا",
        end: true,
        module: "master",
      },
      {
        to: "/sales/charges",
        label: "Charge Master / چارج ماسٹر",
        module: "master",
      },
      {
        to: "/godown/master",
        label: "Godowns Master / گودام ماسٹر",
        module: "inventory",
      },
    ],
  },
  {
    to: "/sales",
    label: "Sales / سیلز",
    icon: SalesIcon,
    module: "sales",
    excludePaths: ["/sales/report", "/sales/charges"],
    children: [
      {
        to: "/sales",
        label: "Sales Invoices / سیلز انوائسز",
        end: true,
        module: "sales",
      },
    ],
  },
  { to: "/purchase", label: "Purchase / خریداری", icon: PurchaseIcon, module: "purchase" },
  {
    to: "/godown",
    label: "Inventory / Stock / اسٹاک",
    icon: InventoryIcon,
    module: "inventory",
    excludePaths: ["/godown/aging", "/godown/master"],
    children: [
      { to: "/godown", label: "Current Stock / موجودہ اسٹاک", end: true, module: "inventory" },
      { to: "/godown/movements", label: "Stock Movements / اسٹاک حرکت", module: "inventory" },
    ],
  },
  { to: "/production", label: "Production / Furnace & Mill", icon: ProductionIcon, module: "production" },
  { to: "/cutting", label: "Cutting & Loading / کٹنگ و لوڈنگ", icon: CuttingIcon, module: "production" },
  {
    to: "/accounting",
    label: "Accounting / اکاؤنٹنگ",
    icon: AccountingIcon,
    module: "accounting",
    excludePaths: ["/accounting/customer-invoice-statement"],
  },
  {
    to: "/reports",
    label: "Reports / رپورٹس",
    icon: ReportsIcon,
    module: "reports",
    children: [
      { to: "/reports", label: "Reports Overview / رپورٹس", end: true, module: "reports" },
      {
        to: "/sales/report",
        label: "Salesperson Performance / سیلز پرسن",
        module: "reports",
      },
      {
        to: "/godown/aging",
        label: "Stock Aging Report / اسٹاک ایجنگ",
        module: "reports",
      },
      {
        to: "/accounting/customer-invoice-statement",
        label: "Customer Statement & Aging",
        module: "accounting",
      },
    ],
  },
  {
    to: "/owner",
    label: "Owner Control / مالک کنٹرول",
    icon: OwnerIcon,
    ownerOnly: true,
  },
  { to: "/settings", label: "Settings / سیٹنگز", icon: SettingsIcon, module: "settings" },
];

const pageLabels: Record<string, string> = {
  "/": "Dashboard",
  "/master-data": "Master Data",
  "/sales": "Sales / سیلز",
  "/sales/report": "Sales Person Report / سیلز پرسن رپورٹ",
  "/sales/charges": "Charge Master / چارج ماسٹر",
  "/purchase": "Purchase",
  "/godown": "Godown / گودام",
  "/godown/movements": "Stock Movements / اسٹاک حرکت",
  "/godown/aging": "Stock Aging Report / اسٹاک ایجنگ",
  "/godown/master": "Godowns Master / گودام ماسٹر",
  "/production": "Production / Furnace & Mill",
  "/cutting": "Cutting & Loading",
  "/accounting": "Accounting",
  "/accounting/mappings": "Account Mapping Setup / اکاؤنٹ میپنگ",
  "/accounting/periods": "Accounting Period Closing / پیریڈ کلوزنگ",
  "/accounting/returns": "Credit / Debit Notes / ریٹرن نوٹس",
  "/accounting/bank-reconciliation": "Bank Reconciliation / بینک ریکنسیلی ایشن",
  "/accounting/year-closing": "Financial Year Closing / سالانہ اختتام",
  "/accounting/cash-flow": "Cash Flow Statement / کیش فلو",
  "/accounting/controls": "Financial Controls / مالی کنٹرولز",
  "/accounting/customer-invoice-statement": "Customer Statement & Aging",
  "/reports": "Reports / رپورٹس",
  "/owner": "Owner Control / مالک کنٹرول",
  "/settings": "Settings / سیٹنگز",
};

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
      label:
        pageLabels[current] ??
        part.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    });
  }

  return items;
}

export default function Layout({ children }: { children: ReactNode }) {
  const [appTheme, setAppTheme] = useState<"light" | "dark" | "black">(() => {
    const saved = localStorage.getItem("metalforge-dashboard-preferences-v2");
    if (!saved) return "light";

    try {
      const parsed = JSON.parse(saved);
      return parsed.theme === "dark" || parsed.theme === "black"
        ? parsed.theme
        : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-mf-theme", appTheme);

    try {
      const key = "metalforge-dashboard-preferences-v2";
      const current = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(
        key,
        JSON.stringify({
          ...current,
          theme: appTheme,
        })
      );
    } catch {
      // ignore malformed local preference
    }
  }, [appTheme]);

  const { user, signOut, isPlatformOwner, activeCompany } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "Master Data / ماسٹر ڈیٹا":
      location.pathname.startsWith("/master-data") ||
      location.pathname === "/sales/charges" ||
      location.pathname === "/godown/master",
    "Sales / سیلز":
      location.pathname.startsWith("/sales") &&
      location.pathname !== "/sales/report" &&
      location.pathname !== "/sales/charges",
    "Inventory / Stock / اسٹاک":
      location.pathname === "/godown" ||
      location.pathname === "/godown/movements",
    "Reports / رپورٹس":
      location.pathname.startsWith("/reports") ||
      location.pathname === "/sales/report" ||
      location.pathname === "/godown/aging" ||
      location.pathname === "/accounting/customer-invoice-statement",
  });

  const title = useMemo(
    () => pageTitle(location.pathname),
    [location.pathname]
  );

  const breadcrumbs = useMemo(
    () => breadcrumbItems(location.pathname),
    [location.pathname]
  );

  const role = activeCompany?.membership_role;

  const visibleNavigation = useMemo(
    () => navigation
      .filter((item) => {
        if (item.ownerOnly) return isPlatformOwner;
        if (!item.module) return true;
        return canViewModule(role, item.module, isPlatformOwner);
      })
      .map((item) => ({
        ...item,
        children: item.children?.filter((child) =>
          !child.module || canViewModule(role, child.module, isPlatformOwner)
        ),
      })),
    [isPlatformOwner, role]
  );

  const sidebarWidth = collapsed ? "lg:w-[68px]" : "lg:w-[218px]";
  const contentOffset = collapsed ? "lg:ml-[68px]" : "lg:ml-[218px]";

  const logout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="erp-shell min-h-screen bg-[#f6f7f9] text-slate-900">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation / نیویگیشن بند کریں"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden"
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-[218px] flex-col border-r border-[#182235] bg-[#0f1726] text-slate-300 transition-all duration-200",
          sidebarWidth,
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="flex h-14 items-center border-b border-white/10 px-3">
          <div
            className={[
              "flex min-w-0 items-center",
              collapsed ? "w-full justify-center" : "gap-2.5",
            ].join(" ")}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
              <BrandIcon />
            </div>

            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-white">
                  {APP_CONFIG.name}
                </div>
                <div className="truncate text-[12px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  {APP_CONFIG.tagline}
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2.5">
          <div className="space-y-0.5">
            {visibleNavigation.map((item) => {
              const Icon = item.icon;
              const excluded = Boolean(
                item.excludePaths?.some(
                  (path) =>
                    location.pathname === path ||
                    location.pathname.startsWith(`${path}/`)
                )
              );
              const active =
                !excluded &&
                (location.pathname === item.to ||
                  (item.to !== "/" &&
                    location.pathname.startsWith(`${item.to}/`)) ||
                  Boolean(
                    item.children?.some(
                      (child) =>
                        location.pathname === child.to ||
                        (!child.end &&
                          location.pathname.startsWith(`${child.to}/`))
                    )
                  ));

              const hasChildren = Boolean(item.children?.length);
              const expanded = openGroups[item.label] ?? active;

              if (hasChildren && !collapsed) {
                return (
                  <div key={item.to}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenGroups((v) => ({
                          ...v,
                          [item.label]: !expanded,
                        }))
                      }
                      className={[
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium transition-colors",
                        active
                          ? "bg-white/[0.08] text-white"
                          : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded",
                          active ? "text-blue-400" : "text-slate-500",
                        ].join(" ")}
                      >
                        <Icon />
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>
                      <ChevronIcon open={expanded} />
                    </button>

                    {expanded && (
                      <div className="ml-[21px] mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
                        {item.children?.map((child) => (
                          <NavLink
                            key={child.to}
                            to={child.to}
                            end={child.end}
                            onClick={() => setMobileOpen(false)}
                            className={({ isActive }) =>
                              [
                                "block rounded px-2 py-1.5 text-[12px] transition-colors",
                                isActive
                                  ? "bg-blue-600/15 font-medium text-blue-300"
                                  : "text-slate-500 hover:bg-white/5 hover:text-slate-300",
                              ].join(" ")
                            }
                          >
                            {child.label}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    [
                      "flex items-center rounded-md text-[12px] font-medium transition-colors",
                      collapsed
                        ? "justify-center px-1 py-1.5"
                        : "gap-2 px-2 py-1.5",
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                    ].join(" ")
                  }
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                    <Icon />
                  </span>
                  {!collapsed && (
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-white/10 p-2">
          {collapsed ? (
            <button
              type="button"
              onClick={logout}
              className="flex h-9 w-full items-center justify-center rounded-md text-slate-500 hover:bg-white/5 hover:text-white"
              title="Sign out / سائن آؤٹ"
            >
              <LogoutIcon />
            </button>
          ) : (
            <div className="rounded-md px-2 py-1.5">
              <div className="mb-2 flex items-center gap-2 border-b border-white/10 pb-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-800 text-slate-400">
                  <CompanyIcon />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] uppercase tracking-wider text-slate-600">
                    Active Company
                  </div>
                  <div className="truncate text-[12px] font-semibold text-slate-300">
                    {activeCompany?.company_name ?? (isPlatformOwner ? "Owner Workspace" : "No company")}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-800 text-[12px] font-semibold text-slate-300">
                  {(user?.email?.[0] ?? "U").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-slate-300">
                    {user?.email ?? "Signed in"}
                  </div>
                  <div className="text-[12px] uppercase tracking-wider text-slate-600">
                    {isPlatformOwner ? "Platform Owner" : roleLabel(role)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-white/5 hover:text-white"
                  title="Sign out / سائن آؤٹ"
                >
                  <LogoutIcon />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className={["min-h-screen transition-all duration-200", contentOffset].join(" ")}>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-5">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 lg:hidden"
            >
              <MenuIcon />
            </button>

            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="hidden h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 lg:flex"
              title={collapsed ? "Expand navigation" : "Collapse navigation"}
            >
              <PanelIcon collapsed={collapsed} />
            </button>

            <div className="min-w-0 flex-1">
              <div className="hidden items-center gap-1 text-[12px] text-slate-400 sm:flex">
                {breadcrumbs.map((crumb, index) => (
                  <div key={crumb.to} className="flex min-w-0 items-center gap-1">
                    {index > 0 && <span>/</span>}
                    {index === breadcrumbs.length - 1 ? (
                      <span className="truncate text-slate-500">
                        {crumb.label}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigate(crumb.to)}
                        className="truncate hover:text-blue-600"
                      >
                        {crumb.label}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="truncate text-[15px] font-semibold text-slate-900">
                {title}
              </div>
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <div className="text-right">
                <div className="text-[12px] uppercase tracking-wider text-slate-400">
                  Active Company
                </div>
                <div className="max-w-[220px] truncate text-[12px] font-semibold text-slate-700">
                  {activeCompany?.company_name ?? (isPlatformOwner ? "Owner Workspace" : APP_CONFIG.name)}
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                title="Sign out / سائن آؤٹ"
              >
                <LogoutIcon />
              </button>
            </div>
          </div>

          <div className="mf-global-theme-switcher" title="Application theme / ایپ تھیم">
            <button
              type="button"
              className={appTheme === "light" ? "active" : ""}
              onClick={() => setAppTheme("light")}
              aria-label="Light mode / روشن موڈ"
            >
              <Lucide.Sun />
            </button>

            <button
              type="button"
              className={appTheme === "dark" ? "active" : ""}
              onClick={() => setAppTheme("dark")}
              aria-label="Dark mode / ڈارک موڈ"
            >
              <Lucide.Moon />
            </button>

            <button
              type="button"
              className={appTheme === "black" ? "active" : ""}
              onClick={() => setAppTheme("black")}
              aria-label="Black mode / بلیک موڈ"
            >
              <Lucide.Circle className="mf-black-theme-icon" />
            </button>
          </div>
        </header>

        <main className="px-4 py-4 lg:px-5 lg:py-4">
          <div className="mx-auto w-full max-w-[1560px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function BrandIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2 3 7l9 5 9-5-9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </svg>
  );
}
function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function DatabaseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <path d="M3 12a9 3 0 0 0 18 0" />
    </svg>
  );
}
function SalesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}
function PurchaseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h3" />
      <path d="M15 18H9" />
      <path d="M19 18h3a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62L19.3 8.38A1 1 0 0 0 18.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </svg>
  );
}
function InventoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}
function ProductionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 20a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v8a3 3 0 0 0 3 3" />
      <path d="M15 20H2" />
      <path d="M15 20v-9a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3" />
    </svg>
  );
}
function CuttingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  );
}
function AccountingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <line x1="8" x2="16" y1="6" y2="6" />
      <line x1="8" x2="8" y1="14" y2="14" />
      <line x1="12" x2="12" y1="14" y2="14" />
      <line x1="16" x2="16" y1="14" y2="14" />
      <line x1="8" x2="8" y1="18" y2="18" />
      <line x1="12" x2="12" y1="18" y2="18" />
      <line x1="16" x2="16" y1="18" y2="18" />
    </svg>
  );
}
function ReportsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M4 19V5M4 19h16"/><path d="M7 15l3-4 3 2 4-6"/></svg>; }

function OwnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 4 7v5c0 5 3.5 8 8 9 4.5-1 8-4 8-9V7l-8-4Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function CompanyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 21h18" />
      <path d="M6 21V5h8v16" />
      <path d="M14 9h4v12" />
      <path d="M9 9h2M9 13h2M9 17h2" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l-.15-.09a2 2 0 0 0-.73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={open ? "rotate-180" : ""} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}
function PanelIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      {collapsed ? (
        <polyline points="13 9 16 12 13 15" />
      ) : (
        <polyline points="16 9 13 12 16 15" />
      )}
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
