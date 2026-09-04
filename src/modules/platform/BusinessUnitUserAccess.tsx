import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, UserRoundCog } from "lucide-react";
import { supabase } from "@/lib/supabase";

const roles=["company_owner","admin","accounts","sales","purchase","store","production","viewer"];
type Unit={id:string;name:string;code:string;is_active:boolean};
type CompanyMember={user_id:string;role:string;is_active:boolean};
type Profile={id:string;email:string|null;full_name:string|null;is_active:boolean};
type UnitMember={id:string;business_unit_id:string;user_id:string;role:string;is_active:boolean};

export default function BusinessUnitUserAccess({companyId,onSaved}:{companyId:string;onSaved?:()=>void|Promise<void>}){
 const[units,setUnits]=useState<Unit[]>([]),[companyMembers,setCompanyMembers]=useState<CompanyMember[]>([]),[profiles,setProfiles]=useState<Profile[]>([]),[unitMembers,setUnitMembers]=useState<UnitMember[]>([]);
 const[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const load=useCallback(async()=>{setLoading(true);setError("");const[u,c,p,b]=await Promise.all([
  supabase.from("business_units").select("id,name,code,is_active").eq("company_id",companyId).order("is_default",{ascending:false}).order("name"),
  supabase.from("company_memberships").select("user_id,role,is_active").eq("company_id",companyId),
  supabase.from("user_profiles").select("id,email,full_name,is_active").order("email"),
  supabase.from("business_unit_memberships").select("id,business_unit_id,user_id,role,is_active").eq("company_id",companyId)
 ]);const e=u.error||c.error||p.error||b.error;if(e)setError(e.message);setUnits((u.data??[]) as Unit[]);setCompanyMembers((c.data??[]) as CompanyMember[]);setProfiles((p.data??[]) as Profile[]);setUnitMembers((b.data??[]) as UnitMember[]);setLoading(false)},[companyId]);
 useEffect(()=>{void load()},[load]);
 const profileById=useMemo(()=>new Map(profiles.map(x=>[x.id,x])),[profiles]);
 const membershipMap=useMemo(()=>new Map(unitMembers.map(x=>[`${x.business_unit_id}:${x.user_id}`,x])),[unitMembers]);
 const assign=async(unitId:string,userId:string,role:string,isActive:boolean)=>{setSaving(true);setError("");try{const{error:e}=await supabase.rpc("assign_user_to_business_unit",{p_business_unit_id:unitId,p_user_id:userId,p_role:role,p_is_active:isActive});if(e)throw e;await load();await onSaved?.()}catch(e){setError(e instanceof Error?e.message:"Could not update business unit access.")}finally{setSaving(false)}};
 if(loading)return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><Loader2 className="h-5 w-5 animate-spin"/></section>;
 return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><UserRoundCog className="h-5 w-5 text-indigo-700"/><div><h2 className="font-semibold text-slate-900">Business Unit User Access</h2><p className="text-xs text-slate-500">Assign each login to Steel, Transport or any other service. Users only see transactions from assigned active units.</p></div></div>{error&&<div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
 <div className="mt-4 space-y-4">{units.map(unit=><div key={unit.id} className="rounded-xl border border-slate-200 p-3"><div className="mb-3 flex items-center justify-between"><div><div className="font-black text-slate-900">{unit.name} <span className="text-xs text-slate-400">({unit.code})</span></div><div className="text-xs text-slate-500">{unit.is_active?"Active unit":"Disabled unit"}</div></div></div><div className="space-y-2">{companyMembers.map(cm=>{const p=profileById.get(cm.user_id);const bm=membershipMap.get(`${unit.id}:${cm.user_id}`);const active=Boolean(bm?.is_active);const role=bm?.role||cm.role||"viewer";return <div key={cm.user_id} className="grid gap-2 rounded-lg bg-slate-50 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_170px_110px] sm:items-center"><div className="min-w-0"><div className="truncate text-sm font-bold text-slate-800">{p?.full_name||p?.email||cm.user_id}</div><div className="truncate text-xs text-slate-500">{p?.email||cm.user_id}</div></div><select className="input h-8 py-1 text-xs" disabled={saving||!active} value={role} onChange={e=>void assign(unit.id,cm.user_id,e.target.value,true)}>{roles.map(r=><option key={r} value={r}>{r}</option>)}</select><button className={active?"btn-secondary h-8":"btn-primary h-8"} disabled={saving||!cm.is_active||!unit.is_active} onClick={()=>void assign(unit.id,cm.user_id,role,!active)}>{active?"Remove":"Assign"}</button></div>})}{companyMembers.length===0&&<div className="text-xs text-slate-400">No company users available.</div>}</div></div>)}</div></section>;
}
