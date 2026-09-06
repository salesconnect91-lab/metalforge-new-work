import { useRef, useState } from "react";
import { BriefcaseBusiness, ChevronDown, Loader2, MapPin, LockKeyhole, Move } from "lucide-react";
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
  const[position,setPosition]=useState<{x:number;y:number}|null>(null);
  const dragRef=useRef<{pointerId:number;dx:number;dy:number}|null>(null);
  if(!activeBusinessUnit)return null;
  const canSwitch=availableBusinessUnits.length>1;
  const branch=((accessContext as unknown as {current_operating_location?:OperatingLocation|null})?.current_operating_location)??null;
  const startDrag=(e:React.PointerEvent<HTMLDivElement>)=>{
    if(e.button!==0)return;
    const panel=e.currentTarget.parentElement;
    if(!panel)return;
    const rect=panel.getBoundingClientRect();
    dragRef.current={pointerId:e.pointerId,dx:e.clientX-rect.left,dy:e.clientY-rect.top};
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const moveDrag=(e:React.PointerEvent<HTMLDivElement>)=>{
    if(!dragRef.current||dragRef.current.pointerId!==e.pointerId)return;
    const width=e.currentTarget.parentElement?.getBoundingClientRect().width??300;
    const x=Math.max(8,Math.min(window.innerWidth-width-8,e.clientX-dragRef.current.dx));
    const y=Math.max(8,Math.min(window.innerHeight-80,e.clientY-dragRef.current.dy));
    setPosition({x,y});
  };
  const stopDrag=(e:React.PointerEvent<HTMLDivElement>)=>{
    if(dragRef.current?.pointerId===e.pointerId)dragRef.current=null;
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return <div className="fixed z-40 hidden min-w-[260px] md:block" style={position?{left:position.x,top:position.y,right:"auto"}:{right:390,top:7}} data-no-bilingual>
    <div className="relative rounded-xl border border-blue-200/90 bg-blue-50/95 px-2.5 py-1.5 shadow-sm backdrop-blur-xl">
      <div className="mb-0.5 flex cursor-move touch-none select-none items-center gap-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.13em] text-blue-500" title="Drag to move" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}><BriefcaseBusiness size={10}/><span>{canSwitch?"Business Unit / بزنس یونٹ":"Business Workspace / بزنس"}</span><Move size={11} className="ml-auto shrink-0 opacity-70"/></div>
      {canSwitch?<div className="relative"><select aria-label="Active business unit" className="h-7 w-full appearance-none rounded-md border-0 bg-transparent pl-1 pr-8 text-[12px] font-black text-blue-950 outline-none focus:ring-0" value={activeBusinessUnit.business_unit_id} disabled={switchingBusinessUnit} onChange={e=>{const id=e.target.value;if(!id)return;setError("");void switchBusinessUnit(id).then(({error:x})=>{if(x){setError(x);return}navigate("/")})}}>{availableBusinessUnits.map(u=><option key={u.business_unit_id} value={u.business_unit_id}>{u.business_unit_name} ({u.business_unit_code})</option>)}</select><span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-blue-500">{switchingBusinessUnit?<Loader2 size={13} className="animate-spin"/>:<ChevronDown size={13}/>}</span></div>:<div className="h-7 truncate px-1 text-[12px] font-black leading-7 text-blue-950">{activeBusinessUnit.business_unit_name} ({activeBusinessUnit.business_unit_code})</div>}
      {branch&&<div className="mt-1 flex items-center gap-1.5 border-t border-blue-200/70 px-1 pt-1 text-[11px] font-bold text-blue-800"><MapPin size={11}/><span className="truncate">Branch / برانچ: {branch.location_name} ({branch.location_code})</span>{branch.is_locked&&<span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-blue-700"><LockKeyhole size={9}/>Locked</span>}</div>}
    </div>
    {error&&<div className="mt-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-[12px] font-medium text-red-600 shadow-sm">{error}</div>}
  </div>
}
