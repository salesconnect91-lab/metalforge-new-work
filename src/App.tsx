import { useEffect, type ReactNode } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { canPerformModule, canViewModule, type ModuleAction, type ModuleKey } from "@/auth/permissions";
import Login from "@/auth/Login";
import ProtectedRoute from "@/auth/ProtectedRoute";
import Layout from "@/components/Layout";
import CompanySwitcher from "@/components/CompanySwitcher";
import BusinessUnitSwitcher from "@/components/BusinessUnitSwitcher";
import ErpExperienceBridge from "@/components/ErpExperienceBridge";
import PrintPreviewController from "@/components/PrintPreviewController";
import DashboardGlobalSearch from "@/components/DashboardGlobalSearch";
import Dashboard from "@/modules/Dashboard";
import MasterData from "@/modules/master-data/MasterData";
import SalesInvoiceList from "@/modules/sales/SalesInvoiceList";
import SalesInvoiceCreate from "@/modules/sales/SalesInvoiceCreate";
import SalesInvoiceDetail from "@/modules/sales/SalesInvoiceDetail";
import SalespersonReport from "@/modules/sales/SalespersonReport";
import ChargeMaster from "@/modules/sales/ChargeMaster";
import Purchase from "@/modules/purchase/Purchase";
import Godown from "@/modules/master-data/Godown";
import Production from "@/modules/production/Production";
import Cutting from "@/modules/cutting/Cutting";
import Accounting from "@/modules/accounting/Accounting";
import CustomerInvoiceStatement from "@/modules/accounting/CustomerInvoiceStatement";
import Settings from "@/modules/settings/Settings";
import Reports from "@/modules/reports/Reports";
import SteelStockControl from "@/modules/reports/SteelStockControl";
import ConsolidatedInvoices from "@/modules/sales/ConsolidatedInvoices";
import OwnerPanel from "@/modules/platform/OwnerPanel";
import OpeningBalanceMigration from "@/modules/platform/OpeningBalanceMigration";

function OwnerOnly({ children }: { children?: ReactNode }) { const { isPlatformOwner } = useAuth(); if (!isPlatformOwner) return <Navigate to="/" replace />; return <>{children ?? <OwnerPanel />}</>; }
function ModuleOnly({ module, children }: { module: ModuleKey; children: ReactNode }) { const { isPlatformOwner, activeCompany, activeBusinessUnit } = useAuth(); const roleAllowed=canViewModule(activeBusinessUnit?.membership_role??activeCompany?.membership_role,module,isPlatformOwner); const unitAllowed=!activeBusinessUnit||activeBusinessUnit.enabled_modules.includes(module); return roleAllowed&&unitAllowed?<>{children}</>:<Navigate to="/" replace/>; }
function ModuleActionOnly({ module, action, children }: { module: ModuleKey; action: ModuleAction; children: ReactNode }) { const { isPlatformOwner, activeCompany, activeBusinessUnit }=useAuth(); const role=activeBusinessUnit?.membership_role??activeCompany?.membership_role; const permissions=activeBusinessUnit?.permissions??activeCompany?.permissions; const roleAllowed=canPerformModule(role,module,action,permissions,isPlatformOwner); const unitAllowed=!activeBusinessUnit||activeBusinessUnit.enabled_modules.includes(module); return roleAllowed&&unitAllowed?<>{children}</>:<Navigate to="/" replace/>; }
function BusinessTypeOnly({type,children}:{type:string;children:ReactNode}){const{activeBusinessUnit}=useAuth();return !activeBusinessUnit||activeBusinessUnit.business_unit_type===type?<>{children}</>:<Navigate to="/" replace/>}
function WorkspaceSwitchers(){const{pathname}=useLocation();if(pathname.startsWith("/owner"))return null;return <><CompanySwitcher/><BusinessUnitSwitcher/></>}

function LockedPurchaseTaxInputs() { const { pathname }=useLocation(); useEffect(()=>{if(!pathname.startsWith("/purchase"))return;const lockVatFields=()=>{document.querySelectorAll("label").forEach(label=>{const text=label.textContent?.trim()??"";if(!text.includes("VAT %")&&!text.includes("Global VAT %"))return;const input=label.nextElementSibling;if(!(input instanceof HTMLInputElement)||input.type!=="number")return;input.disabled=true;input.setAttribute("aria-readonly","true");input.title="VAT rate is controlled from Tax Settings";input.classList.add("cursor-not-allowed","bg-slate-50")})};lockVatFields();const observer=new MutationObserver(lockVatFields);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect()},[pathname]);return null; }
function GlobalExperience(){return <><ErpExperienceBridge/><PrintPreviewController/><LockedPurchaseTaxInputs/></>};function DashboardHome(){return <><DashboardGlobalSearch/><Dashboard/></>}

export default function App(){const{loading,accountingSetupError,retryAccountingSetup,signOut,activeCompany,activeBusinessUnit}=useAuth();const workspaceKey=`${activeCompany?.company_id??"no-company"}:${activeBusinessUnit?.business_unit_id??"no-unit"}`;if(loading)return <><GlobalExperience/><div className="min-h-screen flex items-center justify-center"><div className="text-slate-400">Loading… / لوڈ ہو رہا ہے…</div></div></>;if(accountingSetupError)return <><GlobalExperience/><div className="min-h-screen bg-slate-50 px-4 py-12"><div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-sm"><h1 className="text-lg font-bold text-slate-900">Accounting setup could not be completed / اکاؤنٹنگ سیٹ اپ مکمل نہیں ہو سکا</h1><p className="mt-2 text-sm text-slate-600">ERP access is paused so transactions cannot be posted without a complete Chart of Accounts. / مکمل چارٹ آف اکاؤنٹس کے بغیر ٹرانزیکشن پوسٹ نہیں کی جا سکتی۔</p><div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{accountingSetupError}</div><div className="mt-5 flex gap-3"><button type="button" className="btn-primary" onClick={retryAccountingSetup}>Retry accounting setup / دوبارہ اکاؤنٹنگ سیٹ اپ کریں</button><button type="button" className="btn" onClick={()=>void signOut()}>Sign out / لاگ آؤٹ</button></div></div></div></>;
return <><GlobalExperience/><Routes><Route path="/login" element={<Login/>}/><Route path="/*" element={<ProtectedRoute><><WorkspaceSwitchers/><Layout key={workspaceKey}><Routes>
<Route path="/" element={<ModuleOnly module="dashboard"><DashboardHome/></ModuleOnly>}/><Route path="/owner" element={<OwnerOnly/>}/><Route path="/owner/opening-balances" element={<OwnerOnly><OpeningBalanceMigration/></OwnerOnly>}/><Route path="/master-data/*" element={<ModuleOnly module="master"><MasterData/></ModuleOnly>}/><Route path="/sales" element={<ModuleOnly module="sales"><SalesInvoiceList/></ModuleOnly>}/><Route path="/sales/new" element={<ModuleActionOnly module="sales" action="create"><SalesInvoiceCreate/></ModuleActionOnly>}/><Route path="/sales/:id/edit" element={<ModuleActionOnly module="sales" action="edit"><SalesInvoiceCreate/></ModuleActionOnly>}/><Route path="/sales/report" element={<ModuleOnly module="reports"><SalespersonReport/></ModuleOnly>}/><Route path="/sales/charges" element={<ModuleOnly module="master"><ChargeMaster/></ModuleOnly>}/><Route path="/sales/consolidated" element={<ModuleOnly module="sales"><ConsolidatedInvoices/></ModuleOnly>}/><Route path="/sales/:id" element={<ModuleOnly module="sales"><SalesInvoiceDetail/></ModuleOnly>}/><Route path="/purchase/*" element={<ModuleOnly module="purchase"><Purchase/></ModuleOnly>}/><Route path="/godown/*" element={<ModuleOnly module="inventory"><Godown/></ModuleOnly>}/><Route path="/production/*" element={<BusinessTypeOnly type="steel"><ModuleOnly module="production"><Production/></ModuleOnly></BusinessTypeOnly>}/><Route path="/cutting/*" element={<BusinessTypeOnly type="steel"><ModuleOnly module="production"><Cutting/></ModuleOnly></BusinessTypeOnly>}/><Route path="/accounting/customer-invoice-statement" element={<ModuleOnly module="accounting"><CustomerInvoiceStatement/></ModuleOnly>}/><Route path="/accounting/*" element={<ModuleOnly module="accounting"><Accounting/></ModuleOnly>}/><Route path="/reports/steel-stock" element={<BusinessTypeOnly type="steel"><ModuleOnly module="reports"><SteelStockControl/></ModuleOnly></BusinessTypeOnly>}/><Route path="/reports/*" element={<ModuleOnly module="reports"><Reports/></ModuleOnly>}/><Route path="/settings/*" element={<ModuleOnly module="settings"><Settings/></ModuleOnly>}/><Route path="*" element={<Navigate to="/" replace/>}/>
</Routes></Layout></></ProtectedRoute>}/></Routes></>}
