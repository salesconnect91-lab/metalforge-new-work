import { describe,expect,it } from "vitest";
import { defaultRolePermissions,hasPermission,mergePermissions,type PermissionMatrix } from "./permissions";

describe("ERP permission model",()=>{
 it("keeps company admins fully privileged",()=>{expect(hasPermission("admin","accounting","post")).toBe(true);expect(hasPermission("company_owner","settings","delete")).toBe(true)});
 it("prevents operational roles from deleting by default",()=>{expect(hasPermission("sales","sales","delete")).toBe(false);expect(hasPermission("purchase","purchase","delete")).toBe(false);expect(hasPermission("store","inventory","delete")).toBe(false)});
 it("limits viewers to read/print reporting",()=>{expect(hasPermission("viewer","reports","view")).toBe(true);expect(hasPermission("viewer","reports","print")).toBe(true);expect(hasPermission("viewer","sales","view")).toBe(false);expect(hasPermission("viewer","reports","create")).toBe(false)});
 it("honors explicit company-user overrides",()=>{const override:PermissionMatrix={sales:{view:false,create:false,edit:false,delete:false,post:false,print:false}};const merged=mergePermissions(defaultRolePermissions("sales"),override);expect(merged.sales.view).toBe(false);expect(merged.reports.view).toBe(true)});
});
