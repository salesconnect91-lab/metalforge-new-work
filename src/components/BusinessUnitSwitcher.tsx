import SearchableSelect from "@/components/SearchableSelect";
import { useState } from "react";
import { BriefcaseBusiness, ChevronDown, Loader2, LockKeyhole, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

type OperatingLocation = {
  operating_location_id: string;
  location_code: string;
  location_name: string;
  location_type: string;
  business_unit_id: string | null;
  is_locked: boolean;
};

export default function BusinessUnitSwitcher(){
  const{activeBusinessUnit,availableBusinessUnits,switchBusinessUnit,switchingBusinessUnit,accessContext}=useAuth();
  const navigate=useNavigate();
  const[error,setError]=useState("");
  if(!activeBusinessUnit)return null;

  const canSwitch=availableBusinessUnits.length>1;
  const branch=((accessContext as unknown as {current_operating_location?:OperatingLocation|null})?.current_operating_location)??null;

  return <div className="fixed right-[390px] top-[7px] z-40 hidden md:block" data-no-bilingual data-no-print data-no-print-overlay>
    <div className="flex h-9 max-w-[430px] items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 shadow-sm backdrop-blur-xl" title={branch?`${activeBusinessUnit.business_unit_name} • ${branch.location_name}${branch.is_locked?" • Locked workspace":""}`:activeBusinessUnit.business_unit_name}>
      <BriefcaseBusiness size={14} className="shrink-0 text-blue-600"/>
      {canSwitch?<div className="relative min-w-[125px] max-w-[210px]"><SearchableSelect aria-label="Active business unit" className="h-7 w-full appearance-none truncate border-0 bg-transparent pl-0 pr-6 text-[12px] font-bold text-slate-800 outline-none focus:ring-0" value={activeBusinessUnit.business_unit_id} disabled={switchingBusinessUnit} onChange={e=>{const id=e.target.value;if(!id)return;setError("");void switchBusinessUnit(id).then(({error:x})=>{if(x){setError(x);return}navigate("/")})}}>{availableBusinessUnits.map(u=><option key={u.business_unit_id} value={u.business_unit_id}>{u.business_unit_name} ({u.business_unit_code})</option>)}</SearchableSelect><span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-slate-400">{switchingBusinessUnit?<Loader2 size={12} className="animate-spin"/>:<ChevronDown size={12}/>}</span></div>:<span className="max-w-[180px] truncate text-[12px] font-bold text-slate-800">{activeBusinessUnit.business_unit_name}</span>}
      {branch&&<><span className="h-4 w-px shrink-0 bg-slate-200"/><MapPin size={12} className="shrink-0 text-slate-400"/><span className="max-w-[150px] truncate text-[11px] font-semibold text-slate-600">{branch.location_name}</span>{branch.is_locked&&<LockKeyhole size={12} className="shrink-0 text-blue-600" aria-label="Locked workspace"/>}</>}
    </div>
    {error&&<div className="mt-1 max-w-[430px] rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-[12px] font-medium text-red-600 shadow-sm">{error}</div>}
  </div>
}
