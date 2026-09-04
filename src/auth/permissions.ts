export type CompanyRole =
  | "company_owner"
  | "admin"
  | "accounts"
  | "sales"
  | "purchase"
  | "store"
  | "production"
  | "viewer"
  | string;

export type ModuleKey =
  | "dashboard"
  | "master"
  | "sales"
  | "purchase"
  | "inventory"
  | "production"
  | "accounting"
  | "reports"
  | "settings";

export type ModuleAction = "view" | "create" | "edit" | "delete" | "post" | "print";

const VIEW_MODULES: Record<string, ModuleKey[]> = {
  company_owner: ["dashboard", "master", "sales", "purchase", "inventory", "production", "accounting", "reports", "settings"],
  admin: ["dashboard", "master", "sales", "purchase", "inventory", "production", "accounting", "reports", "settings"],
  accounts: ["dashboard", "accounting", "reports", "master"],
  sales: ["dashboard", "sales", "reports", "master", "inventory"],
  purchase: ["dashboard", "purchase", "reports", "master", "inventory"],
  store: ["dashboard", "inventory", "reports", "master"],
  production: ["dashboard", "production", "inventory", "reports", "master"],
  viewer: ["dashboard", "reports"],
};

export function canViewModule(role: CompanyRole | null | undefined, module: ModuleKey, isPlatformOwner = false) {
  if (isPlatformOwner) return true;
  if (!role) return false;
  return VIEW_MODULES[role]?.includes(module) ?? false;
}

export function canPerformModule(
  role: CompanyRole | null | undefined,
  module: ModuleKey,
  action: ModuleAction,
  permissions?: Record<string, unknown> | null,
  isPlatformOwner = false,
) {
  if (isPlatformOwner || role === "company_owner" || role === "admin") return true;
  if (!role) return false;

  const moduleOverrides = permissions?.[module];
  if (moduleOverrides && typeof moduleOverrides === "object") {
    const override = (moduleOverrides as Record<string, unknown>)[action];
    if (typeof override === "boolean") return override;
  }

  if (action === "view" || action === "print") {
    return canViewModule(role, module, false);
  }
  if (action === "delete") return false;

  const operationalModule: Partial<Record<string, ModuleKey>> = {
    accounts: "accounting",
    sales: "sales",
    purchase: "purchase",
    store: "inventory",
    production: "production",
  };
  return operationalModule[role] === module;
}

export function roleLabel(role: CompanyRole | null | undefined) {
  if (!role) return "No role";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
