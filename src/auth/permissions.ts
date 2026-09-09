export type CompanyRole =
  | "company_owner"
  | "admin"
  | "accounts"
  | "sales"
  | "purchase"
  | "store"
  | "production"
  | "transport"
  | "viewer"
  | string;

export type ModuleKey =
  | "dashboard"
  | "master"
  | "sales"
  | "purchase"
  | "inventory"
  | "production"
  | "transport"
  | "accounting"
  | "reports"
  | "settings";

export type ModuleAction = "view" | "create" | "edit" | "delete" | "post" | "print";
export type ModulePermissionSet = Record<ModuleAction, boolean>;
export type PermissionMatrix = Partial<Record<ModuleKey, Partial<ModulePermissionSet>>>;

const ALL_MODULES: ModuleKey[] = [
  "dashboard",
  "master",
  "sales",
  "purchase",
  "inventory",
  "production",
  "transport",
  "accounting",
  "reports",
  "settings",
];

const VIEW_MODULES: Record<string, ModuleKey[]> = {
  company_owner: ALL_MODULES,
  admin: ALL_MODULES,
  accounts: ["dashboard", "accounting", "reports", "master"],
  sales: ["dashboard", "sales", "reports", "master", "inventory"],
  purchase: ["dashboard", "purchase", "reports", "master", "inventory"],
  store: ["dashboard", "inventory", "reports", "master"],
  production: ["dashboard", "production", "inventory", "reports", "master"],
  transport: ["dashboard", "transport", "accounting", "reports", "master", "settings"],
  viewer: ["dashboard", "reports"],
};

const OPERATIONAL_MODULE: Partial<Record<string, ModuleKey>> = {
  accounts: "accounting",
  sales: "sales",
  purchase: "purchase",
  store: "inventory",
  production: "production",
  transport: "transport",
};

export function canViewModule(role: CompanyRole | null | undefined, module: ModuleKey, isPlatformOwner = false) {
  if (isPlatformOwner) return true;
  if (!role) return false;
  return VIEW_MODULES[role]?.includes(module) ?? false;
}

export function defaultRolePermissions(role: CompanyRole | null | undefined): PermissionMatrix {
  const matrix: PermissionMatrix = {};
  for (const module of ALL_MODULES) {
    const canView = canViewModule(role, module, false);
    const fullAccess = role === "company_owner" || role === "admin";
    const operationalAccess = OPERATIONAL_MODULE[role ?? ""] === module;
    matrix[module] = {
      view: canView,
      print: canView,
      create: fullAccess || operationalAccess,
      edit: fullAccess || operationalAccess,
      delete: fullAccess,
      post: fullAccess || operationalAccess,
    };
  }
  return matrix;
}

export function mergePermissions(base: PermissionMatrix, overrides?: PermissionMatrix | null): PermissionMatrix {
  const merged: PermissionMatrix = {};
  for (const module of ALL_MODULES) {
    merged[module] = {
      ...(base[module] ?? {}),
      ...(overrides?.[module] ?? {}),
    };
  }
  return merged;
}

export function hasPermission(
  role: CompanyRole | null | undefined,
  module: ModuleKey,
  action: ModuleAction,
  permissions?: PermissionMatrix | null,
  isPlatformOwner = false,
) {
  if (isPlatformOwner) return true;
  const effective = mergePermissions(defaultRolePermissions(role), permissions);
  return effective[module]?.[action] === true;
}

export function canPerformModule(
  role: CompanyRole | null | undefined,
  module: ModuleKey,
  action: ModuleAction,
  permissions?: Record<string, unknown> | null,
  isPlatformOwner = false,
) {
  return hasPermission(role, module, action, permissions as PermissionMatrix | null | undefined, isPlatformOwner);
}

export function roleLabel(role: CompanyRole | null | undefined) {
  if (!role) return "No role";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
