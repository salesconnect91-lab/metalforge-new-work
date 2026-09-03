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

export function roleLabel(role: CompanyRole | null | undefined) {
  if (!role) return "No role";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
