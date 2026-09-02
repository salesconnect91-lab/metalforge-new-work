import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";

type Company = {
  id: string;
  name: string;
  code: string;
  status: "trial" | "active" | "suspended" | "expired" | "closed";
  subscription_expires_at: string | null;
  max_users: number;
  contact_email: string | null;
  created_at: string;
};

type Membership = {
  id: string;
  company_id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
};

const roles = ["company_owner", "admin", "accounts", "sales", "purchase", "store", "production", "viewer"];

export default function OwnerPanel() {
  const { session, isPlatformOwner } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [companyForm, setCompanyForm] = useState({ name: "", code: "", contact_email: "", max_users: "10", subscription_expires_at: "" });
  const [userForm, setUserForm] = useState({ full_name: "", email: "", role: "viewer" });

  const invokeAdmin = async (body: Record<string, unknown>) => {
    const token = session?.access_token;
    if (!token) throw new Error("Session expired");
    const { data, error } = await supabase.functions.invoke("platform-admin", {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const load = async () => {
    const [companyResult, membershipResult, profileResult] = await Promise.all([
      supabase.from("companies").select("*").order("created_at", { ascending: false }),
      supabase.from("company_memberships").select("*").order("created_at", { ascending: false }),
      supabase.from("user_profiles").select("id,full_name,email,is_active"),
    ]);
    if (companyResult.error) throw companyResult.error;
    if (membershipResult.error) throw membershipResult.error;
    if (profileResult.error) throw profileResult.error;
    setCompanies((companyResult.data ?? []) as Company[]);
    setMemberships((membershipResult.data ?? []) as Membership[]);
    setProfiles((profileResult.data ?? []) as Profile[]);
    if (!selectedCompany && companyResult.data?.[0]?.id) setSelectedCompany(companyResult.data[0].id);
  };

  useEffect(() => {
    if (!isPlatformOwner) return;
    void load().catch((error) => setMessage(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformOwner]);

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const selectedMembers = memberships.filter((membership) => membership.company_id === selectedCompany);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await work();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  if (!isPlatformOwner) return <div className="p-6">Super Admin access required.</div>;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">Software Owner Control</div>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Companies & Login IDs</h1>
        <p className="mt-1 text-sm text-slate-500">Create customer companies, control expiry/suspension, and issue employee Login IDs.</p>
      </div>

      {message && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Add Company</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input className="input" placeholder="Company name" value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} />
            <input className="input" placeholder="Company code" value={companyForm.code} onChange={(e) => setCompanyForm({ ...companyForm, code: e.target.value.toUpperCase() })} />
            <input className="input" placeholder="Company email" value={companyForm.contact_email} onChange={(e) => setCompanyForm({ ...companyForm, contact_email: e.target.value })} />
            <input className="input" type="number" min="1" placeholder="Max users" value={companyForm.max_users} onChange={(e) => setCompanyForm({ ...companyForm, max_users: e.target.value })} />
            <label className="text-xs text-slate-500 sm:col-span-2">Access expiry (optional)<input className="input mt-1 w-full" type="date" value={companyForm.subscription_expires_at} onChange={(e) => setCompanyForm({ ...companyForm, subscription_expires_at: e.target.value })} /></label>
          </div>
          <button disabled={busy || !companyForm.name || !companyForm.code} className="btn-primary mt-3" onClick={() => void run(async () => {
            await invokeAdmin({ action: "create_company", ...companyForm, max_users: Number(companyForm.max_users), subscription_expires_at: companyForm.subscription_expires_at ? `${companyForm.subscription_expires_at}T23:59:59Z` : null });
            setCompanyForm({ name: "", code: "", contact_email: "", max_users: "10", subscription_expires_at: "" });
            setMessage("Company created successfully.");
          })}>Create Company</button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Create Login ID</h2>
          <div className="mt-3 space-y-3">
            <select className="input w-full" value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
              <option value="">Select company</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name} ({company.code})</option>)}
            </select>
            <input className="input w-full" placeholder="Employee name" value={userForm.full_name} onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })} />
            <input className="input w-full" type="email" placeholder="Gmail / email Login ID" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
            <select className="input w-full" value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
              {roles.map((role) => <option key={role} value={role}>{role.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <button disabled={busy || !selectedCompany || !userForm.email} className="btn-primary mt-3" onClick={() => void run(async () => {
            await invokeAdmin({ action: "create_user", company_id: selectedCompany, ...userForm });
            setUserForm({ full_name: "", email: "", role: "viewer" });
            setMessage("Login ID created. User can now request OTP on the login screen.");
          })}>Create Login ID</button>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4"><h2 className="font-semibold text-slate-900">Company Control</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-2">Company</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Expiry</th><th className="px-4 py-2">Users</th><th className="px-4 py-2">Control</th></tr></thead>
            <tbody>{companies.map((company) => (
              <tr key={company.id} className="border-t border-slate-100">
                <td className="px-4 py-3"><button className="font-semibold text-blue-600" onClick={() => setSelectedCompany(company.id)}>{company.name}</button><div className="text-slate-400">{company.code}</div></td>
                <td className="px-4 py-3 font-medium">{company.status}</td>
                <td className="px-4 py-3">{company.subscription_expires_at ? new Date(company.subscription_expires_at).toLocaleDateString() : "No expiry"}</td>
                <td className="px-4 py-3">{memberships.filter((m) => m.company_id === company.id && m.is_active).length} / {company.max_users}</td>
                <td className="px-4 py-3"><select className="input" value={company.status} disabled={busy} onChange={(e) => void run(async () => { await invokeAdmin({ action: "set_company_status", company_id: company.id, status: e.target.value }); setMessage(`Company changed to ${e.target.value}.`); })}>{["trial","active","suspended","expired","closed"].map((status) => <option key={status}>{status}</option>)}</select></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      {selectedCompany && <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4"><h2 className="font-semibold text-slate-900">Users in {companies.find((c) => c.id === selectedCompany)?.name}</h2></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-2">User</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Access</th></tr></thead><tbody>{selectedMembers.map((membership) => {
          const profile = profileMap.get(membership.user_id);
          return <tr key={membership.id} className="border-t border-slate-100"><td className="px-4 py-3"><div className="font-medium">{profile?.full_name || "User"}</div><div className="text-slate-400">{profile?.email || membership.user_id}</div></td><td className="px-4 py-3"><select className="input" value={membership.role} disabled={busy} onChange={(e) => void run(async () => { await invokeAdmin({ action: "set_user_role", company_id: membership.company_id, user_id: membership.user_id, role: e.target.value }); setMessage("User role updated."); })}>{roles.map((role) => <option key={role} value={role}>{role.replace(/_/g, " ")}</option>)}</select></td><td className="px-4 py-3"><button className={membership.is_active ? "btn" : "btn-primary"} disabled={busy} onClick={() => void run(async () => { await invokeAdmin({ action: "set_user_access", company_id: membership.company_id, user_id: membership.user_id, is_active: !membership.is_active }); setMessage(membership.is_active ? "User suspended." : "User activated."); })}>{membership.is_active ? "Suspend" : "Activate"}</button></td></tr>;
        })}</tbody></table></div>
      </section>}
    </div>
  );
}
