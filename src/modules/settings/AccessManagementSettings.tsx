import SearchableSelect from "@/components/SearchableSelect";
import { useCallback,useEffect,useMemo,useState } from "react";
import { KeyRound,Loader2,MapPin,Plus,RefreshCw,Save,ShieldCheck,Users } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/ui";

type UserRow={membership_id:string;user_id:string;email:string|null;full_name:string|null;role:string;is_active:boolean;locked_business_unit_id:string|null;locked_operating_location_id:string|null};
type Unit={id:string;name:string;code:string;unit_type:string;is_active:boolean;is_default:boolean};
type Location={id:string;business_unit_id:string;name:string;code:string;location_type:string;is_active:boolean};
type Limits={max_users:number|null;max_business_units:number|null;max_branches:number|null;max_godowns:number|null};
type Payload={users:UserRow[];units:Unit[];locations:Location[];limits:Limits;actor_role:string;is_platform_owner:boolean};
const ALL_ROLES=["admin","accounts","sales","purchase","store","production","transport","viewer"];
const roleLabel=(r:string)=>({admin:"Administrator",accounts:"Accounts",sales:"Sales",purchase:"Purchase",store:"Store / Inventory",production:"Production",transport:"Transport",viewer:"Viewer",company_owner:"Company Owner"}[r]||r);

export default function AccessManagementSettings(){
  const {activeCompany,isPlatformOwner,user}=useAuth();
  const companyId=activeCompany?.company_id||"";
  const companyRole=activeCompany?.membership_role||"";
  const allowed=isPlatformOwner||["company_owner","admin"].includes(companyRole);
  const[data,setData]=useState<Payload|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const[form,setForm]=useState({full_name:"",email:"",password:"",role:"viewer",business_unit_id:"",operating_location_id:""});
  const[branch,setBranch]=useState({business_unit_id:"",name:"",code:""});

  const load=useCallback(async()=>{
    if(!companyId||!allowed){setLoading(false);return;}
    setLoading(true);setError("");
    try{const result=await invokeEdgeFunction<Payload>("company-admin",{action:"list_access",company_id:companyId});setData(result);
      const first=result.units.find(x=>x.is_active);setForm(v=>({...v,business_unit_id:result.units.some(x=>x.id===v.business_unit_id&&x.is_active)?v.business_unit_id:(first?.id||""),operating_location_id:""}));
      setBranch(v=>({...v,business_unit_id:result.units.some(x=>x.id===v.business_unit_id&&x.is_active)?v.business_unit_id:(first?.id||"")}));
    }catch(e){setError(e instanceof Error?e.message:"Could not load access management.");}finally{setLoading(false);}
  },[companyId,allowed]);
  useEffect(()=>{void load()},[load]);

  const activeUsers=data?.users.filter(x=>x.is_active).length||0;
  const activeBranches=data?.locations.filter(x=>x.is_active).length||0;
  const roleOptions=useMemo(()=>{
    if(data?.is_platform_owner)return ["company_owner",...ALL_ROLES];
    if(data?.actor_role==="company_owner")return ALL_ROLES;
    return ALL_ROLES.filter(x=>x!=="admin");
  },[data?.actor_role,data?.is_platform_owner]);
  const formBranches=(data?.locations||[]).filter(x=>x.is_active&&x.business_unit_id===form.business_unit_id);

  const createUser=async()=>{
    if(!form.full_name.trim()||!form.email.trim()||form.password.length<8||!form.business_unit_id){setError("Name, email, business unit and minimum 8 character temporary password are required.");return;}
    setBusy(true);setError("");setMessage("");
    try{await invokeEdgeFunction("company-admin",{action:"create_user",company_id:companyId,...form,operating_location_id:form.operating_location_id||null});setMessage("User login created successfully.");setForm(v=>({...v,full_name:"",email:"",password:"",role:"viewer",operating_location_id:""}));await load();}
    catch(e){setError(e instanceof Error?e.message:"Could not create user.");}finally{setBusy(false);}
  };
  const saveUser=async(row:UserRow,patch:Record<string,unknown>)=>{
    setBusy(true);setError("");setMessage("");
    try{await invokeEdgeFunction("company-admin",{action:"update_user",company_id:companyId,user_id:row.user_id,...patch});setMessage("User access updated.");await load();}
    catch(e){setError(e instanceof Error?e.message:"Could not update user.");}finally{setBusy(false);}
  };
  const editName=async(row:UserRow)=>{const next=window.prompt("User full name",row.full_name||"");if(next===null)return;await saveUser(row,{full_name:next.trim()});};
  const resetPassword=async(row:UserRow)=>{const password=window.prompt(`New temporary password for ${row.full_name||row.email||"user"} (minimum 8 characters)`);if(password===null)return;if(password.length<8){setError("Password must be at least 8 characters.");return;}setBusy(true);setError("");try{await invokeEdgeFunction("company-admin",{action:"reset_password",company_id:companyId,user_id:row.user_id,password});setMessage("Temporary password updated.");}catch(e){setError(e instanceof Error?e.message:"Password reset failed.");}finally{setBusy(false);}};

  const createBranch=async()=>{
    if(!branch.business_unit_id||!branch.name.trim()||!branch.code.trim()){setError("Business unit, branch name and branch code are required.");return;}
    setBusy(true);setError("");setMessage("");
    try{const{error:e}=await supabase.from("operating_locations").insert({company_id:companyId,business_unit_id:branch.business_unit_id,name:branch.name.trim(),code:branch.code.trim().toUpperCase(),location_type:"branch",is_active:true});if(e)throw e;setBranch(v=>({...v,name:"",code:""}));setMessage("Branch created successfully.");await load();}
    catch(e){setError(e instanceof Error?e.message:"Could not create branch.");}finally{setBusy(false);}
  };
  const editBranch=async(loc:Location)=>{const name=window.prompt("Branch name",loc.name);if(name===null)return;const code=window.prompt("Branch code",loc.code);if(code===null)return;setBusy(true);setError("");try{const{error:e}=await supabase.from("operating_locations").update({name:name.trim()||loc.name,code:(code.trim()||loc.code).toUpperCase(),updated_at:new Date().toISOString()}).eq("id",loc.id);if(e)throw e;setMessage("Branch updated.");await load();}catch(e){setError(e instanceof Error?e.message:"Could not update branch.");}finally{setBusy(false);}};
  const toggleBranch=async(loc:Location)=>{setBusy(true);setError("");try{const{error:e}=await supabase.from("operating_locations").update({is_active:!loc.is_active,updated_at:new Date().toISOString()}).eq("id",loc.id);if(e)throw e;setMessage(loc.is_active?"Branch disabled.":"Branch enabled.");await load();}catch(e){setError(e instanceof Error?e.message:"Could not update branch.");}finally{setBusy(false);}};

  if(!allowed)return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><strong>Company Owner / Administrator only.</strong> User and branch administration is intentionally hidden from normal users.</div>;
  if(loading)return <div className="flex min-h-[300px] items-center justify-center"><Loader2 className="mr-2 h-5 w-5 animate-spin"/>Loading access management...</div>;
  if(!data)return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error||"Access management could not be loaded."}</div>;

  return <div className="space-y-5">
    <PageHeader title="Users & Branch Access / یوزرز اور برانچ ایکسس" subtitle="Company-controlled users and branches, always inside NAVILO Owner limits"/>
    {error&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}{message&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Users" value={`${activeUsers} / ${data.limits.max_users??"∞"}`}/><Stat label="Branches" value={`${activeBranches} / ${data.limits.max_branches??"∞"}`}/><Stat label="Business Units" value={`${data.units.filter(x=>x.is_active).length} / ${data.limits.max_business_units??"∞"}`}/><Stat label="Your Admin Role" value={roleLabel(data.actor_role)}/>
    </div>

    <section className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-blue-700"/><div><h2 className="font-semibold">Create Company User</h2><p className="text-xs text-slate-500">The user is locked to one business unit and optionally one branch. NAVILO Owner user limits cannot be exceeded.</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input className="input" placeholder="Full name" value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/><input className="input" type="email" placeholder="Login email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><input className="input" type="password" placeholder="Temporary password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><SearchableSelect className="input" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{roleOptions.filter(r=>r!=="company_owner").map(r=><option key={r} value={r}>{roleLabel(r)}</option>)}</SearchableSelect><SearchableSelect className="input" value={form.business_unit_id} onChange={e=>setForm({...form,business_unit_id:e.target.value,operating_location_id:""})}>{data.units.filter(x=>x.is_active).map(x=><option key={x.id} value={x.id}>{x.name} ({x.code})</option>)}</SearchableSelect><SearchableSelect className="input" value={form.operating_location_id} onChange={e=>setForm({...form,operating_location_id:e.target.value})}><option value="">Whole business unit</option>{formBranches.map(x=><option key={x.id} value={x.id}>{x.name} ({x.code})</option>)}</SearchableSelect><button className="btn-primary" disabled={busy} onClick={()=>void createUser()}><Plus className="h-4 w-4"/>Create User</button><button className="btn-secondary" disabled={busy} onClick={()=>void load()}><RefreshCw className="h-4 w-4"/>Refresh</button></div>
    </section>

    <section className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-indigo-700"/><div><h2 className="font-semibold">Company Users</h2><p className="text-xs text-slate-500">Company Owner is Platform Owner controlled. Company Admin cannot edit another Admin or Company Owner.</p></div></div><div className="mt-4 space-y-2">{data.users.map(row=>{
      const protectedRow=!data.is_platform_owner&&(row.role==="company_owner"||(data.actor_role==="admin"&&row.role==="admin"));
      const branches=data.locations.filter(x=>x.is_active&&x.business_unit_id===row.locked_business_unit_id);
      return <div key={row.user_id} className="rounded-lg border border-slate-200 p-3"><div className="grid gap-2 lg:grid-cols-[minmax(180px,1fr)_150px_210px_210px_auto] lg:items-center"><div><div className="font-semibold text-slate-900">{row.full_name||"Unnamed user"}</div><div className="text-xs text-slate-500">{row.email||row.user_id}</div></div><SearchableSelect className="input h-9" value={row.role} disabled={busy||protectedRow||row.user_id===user?.id} onChange={e=>void saveUser(row,{role:e.target.value})}>{(row.role==="company_owner"?["company_owner"]:roleOptions).map(r=><option key={r} value={r}>{roleLabel(r)}</option>)}</SearchableSelect><SearchableSelect className="input h-9" value={row.locked_business_unit_id||""} disabled={busy||protectedRow||row.role==="company_owner"} onChange={e=>void saveUser(row,{business_unit_id:e.target.value,operating_location_id:null})}><option value="">Select business unit</option>{data.units.filter(x=>x.is_active).map(x=><option key={x.id} value={x.id}>{x.name} ({x.code})</option>)}</SearchableSelect><SearchableSelect className="input h-9" value={row.locked_operating_location_id||""} disabled={busy||protectedRow||row.role==="company_owner"||!row.locked_business_unit_id} onChange={e=>void saveUser(row,{business_unit_id:row.locked_business_unit_id,operating_location_id:e.target.value||null})}><option value="">Whole business unit</option>{branches.map(x=><option key={x.id} value={x.id}>{x.name} ({x.code})</option>)}</SearchableSelect><div className="flex flex-wrap gap-2"><button className="btn-secondary h-9" disabled={busy} onClick={()=>void editName(row)}><Save className="h-4 w-4"/>Name</button><button className="btn-secondary h-9" disabled={busy||protectedRow} onClick={()=>void resetPassword(row)}><KeyRound className="h-4 w-4"/>Password</button><button className="btn-secondary h-9" disabled={busy||protectedRow||row.user_id===user?.id} onClick={()=>void saveUser(row,{is_active:!row.is_active})}>{row.is_active?"Disable":"Enable"}</button></div></div><div className="mt-2 text-[11px] text-slate-500">Status: <strong>{row.is_active?"Active":"Disabled"}</strong> · Role: {roleLabel(row.role)}</div></div>})}</div></section>

    <section className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-emerald-700"/><div><h2 className="font-semibold">Branches / Operating Locations</h2><p className="text-xs text-slate-500">Company Admin may create and rename branches only inside the Platform Owner branch allowance.</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4"><SearchableSelect className="input" value={branch.business_unit_id} onChange={e=>setBranch({...branch,business_unit_id:e.target.value})}>{data.units.filter(x=>x.is_active).map(x=><option key={x.id} value={x.id}>{x.name} ({x.code})</option>)}</SearchableSelect><input className="input" placeholder="Branch name" value={branch.name} onChange={e=>setBranch({...branch,name:e.target.value})}/><input className="input" placeholder="Branch code" value={branch.code} onChange={e=>setBranch({...branch,code:e.target.value})}/><button className="btn-primary" disabled={busy} onClick={()=>void createBranch()}><Plus className="h-4 w-4"/>Add Branch</button></div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">{data.locations.map(loc=>{const unit=data.units.find(x=>x.id===loc.business_unit_id);return <div key={loc.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><div className="font-semibold">{loc.name} <span className="text-xs text-slate-400">({loc.code})</span></div><div className="text-xs text-slate-500">{unit?.name||"Business Unit"} · {loc.is_active?"Active":"Disabled"}</div></div><div className="flex gap-2"><button className="btn-secondary" disabled={busy} onClick={()=>void editBranch(loc)}>Edit</button><button className="btn-secondary" disabled={busy} onClick={()=>void toggleBranch(loc)}>{loc.is_active?"Disable":"Enable"}</button></div></div>})}</div>
    </section>
  </div>;
}
function Stat({label,value}:{label:string;value:string}){return <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-xl font-bold text-slate-900">{value}</div></div>}
