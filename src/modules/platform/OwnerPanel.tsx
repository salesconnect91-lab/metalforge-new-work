import SearchableSelect from "@/components/SearchableSelect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { FileSpreadsheet, Loader2, Plus, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { PageHeader, ErrorBanner } from "@/components/ui";
import SubscriptionControl from "./SubscriptionControl";
import TransactionResetControl from "./TransactionResetControl";
import BusinessUnitControl from "./BusinessUnitControl";
import BusinessWorkspaceLoginControl from "./BusinessWorkspaceLoginControl";
import CompanyDeleteControl from "./CompanyDeleteControl";
import CoreAccountingControl from "./CoreAccountingControl";
import OwnerOrderBookMigration from "./OwnerOrderBookMigration";

type Company = {
  id: string;
  name: string;
  code: string;
  status: string;
  subscription_expires_at: string | null;
  max_users: number;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  notes: string | null;
};

type Membership = { id: string; company_id: string; user_id: string; role: string; is_active: boolean };
type Profile = { id: string; email: string | null; full_name: string | null };

const roles = ["company_owner", "admin", "accounts", "sales", "purchase", "store", "production", "viewer"];

export default function OwnerPanel() {
  const { isPlatformOwner, refreshAccess } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [company, setCompany] = useState({
    name: "",
    code: "",
    contact_email: "",
    contact_phone: "",
    address: "",
    notes: "",
    subscription_expires_at: "",
    max_users: "10",
  });
  const [user, setUser] = useState({ full_name: "", email: "", password: "", role: "viewer" });

  const load = useCallback(async () => {
    if (!isPlatformOwner) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [companyResult, membershipResult, profileResult] = await Promise.all([
      supabase.from("companies").select("*").order("created_at", { ascending: false }),
      supabase.from("company_memberships").select("*").order("created_at", { ascending: false }),
      supabase.from("user_profiles").select("id,email,full_name").order("email"),
    ]);

    const firstError = companyResult.error || membershipResult.error || profileResult.error;
    setError(firstError?.message || "");

    const nextCompanies = (companyResult.data ?? []) as Company[];
    setCompanies(nextCompanies);
    setMemberships((membershipResult.data ?? []) as Membership[]);
    setProfiles((profileResult.data ?? []) as Profile[]);
    setSelectedCompanyId(current => nextCompanies.some(item => item.id === current) ? current : (nextCompanies[0]?.id || ""));
    setLoading(false);
  }, [isPlatformOwner]);

  useEffect(() => { void load(); }, [load]);

  const selected = companies.find(item => item.id === selectedCompanyId);
  const profileMap = useMemo(() => new Map(profiles.map(profile => [profile.id, profile])), [profiles]);

  if (!isPlatformOwner) return <Navigate to="/" replace />;

  const createCompany = async () => {
    if (!company.name.trim() || !company.code.trim()) {
      setError("Company name and code are required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await invokeEdgeFunction("platform-admin", {
        action: "create_company",
        ...company,
        name: company.name.trim(),
        code: company.code.trim().toUpperCase(),
        max_users: Math.max(1, Number(company.max_users) || 10),
        subscription_expires_at: company.subscription_expires_at
          ? new Date(company.subscription_expires_at).toISOString()
          : null,
      });
      setCompany({
        name: "",
        code: "",
        contact_email: "",
        contact_phone: "",
        address: "",
        notes: "",
        subscription_expires_at: "",
        max_users: "10",
      });
      await load();
      await refreshAccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create company.");
    } finally {
      setSaving(false);
    }
  };

  const patchCompanyStatus = async (target: Company, status: string) => {
    setSaving(true);
    setError("");
    try {
      await invokeEdgeFunction("platform-admin", { action: "set_company_status", company_id: target.id, status });
      await load();
      await refreshAccess();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const createUser = async () => {
    if (!selectedCompanyId || !user.email.trim() || user.password.length < 8) {
      setError("Select company, enter email and minimum 8 character password.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await invokeEdgeFunction("platform-admin", {
        action: "create_user",
        company_id: selectedCompanyId,
        ...user,
      });
      setUser({ full_name: "", email: "", password: "", role: "viewer" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create user.");
    } finally {
      setSaving(false);
    }
  };

  const updateMember = async (membership: Membership, patch: Record<string, unknown>) => {
    setSaving(true);
    setError("");
    try {
      await invokeEdgeFunction("platform-admin", {
        action: "update_membership",
        membership_id: membership.id,
        ...patch,
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Access update failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="mr-2 h-5 w-5 animate-spin"/>Loading owner controls...</div>;
  }

  return <div className="space-y-6">
    <PageHeader title="Owner Control Center" subtitle="Full platform control: companies, business workspaces, dedicated login IDs, subscriptions, users, opening data and lifecycle"/>
    {error && <ErrorBanner message={error}/>} 

    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5"/><h2 className="font-semibold">Create company</h2></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input className="input" placeholder="Company name" value={company.name} onChange={event => setCompany({ ...company, name: event.target.value })}/>
        <input className="input" placeholder="Company code" value={company.code} onChange={event => setCompany({ ...company, code: event.target.value })}/>
        <input className="input" type="date" value={company.subscription_expires_at} onChange={event => setCompany({ ...company, subscription_expires_at: event.target.value })}/>
        <input className="input" type="number" min="1" value={company.max_users} onChange={event => setCompany({ ...company, max_users: event.target.value })}/>
        <input className="input" placeholder="Email" value={company.contact_email} onChange={event => setCompany({ ...company, contact_email: event.target.value })}/>
        <input className="input" placeholder="Phone" value={company.contact_phone} onChange={event => setCompany({ ...company, contact_phone: event.target.value })}/>
        <input className="input sm:col-span-2" placeholder="Address" value={company.address} onChange={event => setCompany({ ...company, address: event.target.value })}/>
      </div>
      <textarea className="input mt-3 min-h-20 w-full" placeholder="Notes" value={company.notes} onChange={event => setCompany({ ...company, notes: event.target.value })}/>
      <button className="btn-primary mt-3" disabled={saving} onClick={() => void createCompany()}><Plus className="h-4 w-4"/>Create Company</button>
    </section>

    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5"/><h2 className="font-semibold">Companies & access</h2></div>
      <div className="grid gap-4 lg:grid-cols-2">
        {companies.map(target => {
          const targetMemberships = memberships.filter(membership => membership.company_id === target.id);
          return <div key={target.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <div className="font-semibold">{target.name} <span className="text-xs text-slate-400">({target.code})</span></div>
                <div className="text-xs text-slate-500">{target.status} · max {target.max_users} users</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" disabled={saving} onClick={() => void patchCompanyStatus(target, target.status === "suspended" ? "active" : "suspended")}>{target.status === "suspended" ? "Activate" : "Suspend"}</button>
                <CompanyDeleteControl companyId={target.id} companyName={target.name} companyCode={target.code} onDeleted={async () => { await load(); await refreshAccess(); }}/>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {targetMemberships.map(membership => {
                const profile = profileMap.get(membership.user_id);
                return <div key={membership.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2">
                  <div className="text-sm">{profile?.full_name || profile?.email || membership.user_id}</div>
                  <div className="flex gap-2">
                    <SearchableSelect className="input h-8 py-1 text-xs" value={membership.role} onChange={event => void updateMember(membership, { role: event.target.value })}>{roles.map(role => <option key={role}>{role}</option>)}</SearchableSelect>
                    <button className="btn-secondary h-8" onClick={() => void updateMember(membership, { is_active: !membership.is_active })}>{membership.is_active ? "Disable" : "Enable"}</button>
                  </div>
                </div>;
              })}
              {targetMemberships.length === 0 && <div className="text-xs text-slate-400">No company users assigned yet.</div>}
            </div>
          </div>;
        })}
      </div>
    </section>

    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="font-semibold">Selected company controls</h2>
      <SearchableSelect className="input mt-3 w-full sm:w-96" value={selectedCompanyId} onChange={event => setSelectedCompanyId(event.target.value)}>{companies.map(target => <option key={target.id} value={target.id}>{target.name} ({target.code})</option>)}</SearchableSelect>
    </section>

    {selectedCompanyId && <BusinessUnitControl companyId={selectedCompanyId} onSaved={refreshAccess}/>} 
    {selectedCompanyId && <BusinessWorkspaceLoginControl companyId={selectedCompanyId}/>} 
    {selectedCompanyId && <CoreAccountingControl companyId={selectedCompanyId}/>} 
    {selectedCompanyId && <SubscriptionControl companyId={selectedCompanyId} onSaved={async () => { await load(); await refreshAccess(); }}/>} 

    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="font-semibold">Create company/group login ID</h2>
      <p className="mt-1 text-xs text-slate-500">Use this only for company/group users who may access more than one assigned business. For a Steel-only or Transport-only ID, use Dedicated Business Login IDs above.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input className="input" placeholder="Full name" value={user.full_name} onChange={event => setUser({ ...user, full_name: event.target.value })}/>
        <input className="input" type="email" placeholder="Email / login ID" value={user.email} onChange={event => setUser({ ...user, email: event.target.value })}/>
        <input className="input" type="password" placeholder="Temporary password" value={user.password} onChange={event => setUser({ ...user, password: event.target.value })}/>
        <SearchableSelect className="input" value={user.role} onChange={event => setUser({ ...user, role: event.target.value })}>{roles.map(role => <option key={role}>{role}</option>)}</SearchableSelect>
      </div>
      <button className="btn-primary mt-3" disabled={saving || !selectedCompanyId} onClick={() => void createUser()}>Create Group User</button>
    </section>

    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Opening party balance migration</h2>
          <p className="mt-1 text-xs text-slate-500">Use the dedicated validated migration screen for Excel/CSV preview, duplicate checks and posted opening journal creation.</p>
        </div>
        <Link className="btn-secondary" to="/owner/opening-balances"><FileSpreadsheet className="h-4 w-4"/>Open Migration Tool</Link>
      </div>
    </section>

    {selected && <OwnerOrderBookMigration companyId={selected.id} companyName={selected.name}/>} 
    {selected && <TransactionResetControl companyId={selected.id} companyName={selected.name} companyCode={selected.code}/>} 
  </div>;
}
