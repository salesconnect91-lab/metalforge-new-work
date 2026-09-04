import { useCallback, useEffect, useState } from "react";
import { ImagePlus, Languages, Loader2, Save, Trash2 } from "lucide-react";
import { PageHeader, ErrorBanner } from "@/components/ui";
import { supabase } from "@/lib/supabase";

type PrintLanguage = "english" | "urdu" | "both";

export default function CompanySettings() {
  const [name, setName] = useState("Steel Mill ERP");
  const [currency, setCurrency] = useState("PKR");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [ntn, setNtn] = useState("");
  const [strn, setStrn] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [printLanguage, setPrintLanguage] = useState<PrintLanguage>("both");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const getCurrentCompanyId = useCallback(async () => {
    const { data, error: companyError } = await supabase.rpc("current_company_id");
    if (companyError) throw companyError;
    if (!data) throw new Error("No active company selected.");
    return String(data);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error: loadError } = await supabase.from("company_settings").select("*").maybeSingle();
    if (loadError) setError(loadError.message);
    else if (data) {
      setName(data.company_name || "Steel Mill ERP"); setCurrency(data.currency || "PKR"); setAddress(data.address || ""); setPhone(data.phone || ""); setEmail(data.email || ""); setWebsite(data.website || ""); setNtn(data.ntn || ""); setStrn(data.strn || ""); setLogoUrl(data.logo_url || ""); setPrintLanguage((data.print_language || "both") as PrintLanguage);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const handleLogoUpload = async (file: File | null) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) return setError("Please upload PNG, JPG, WebP or SVG logo.");
    if (file.size > 2 * 1024 * 1024) return setError("Logo file must be 2 MB or smaller.");
    setUploadingLogo(true); setError(null);
    try {
      const companyId = await getCurrentCompanyId(); const extension = file.name.split(".").pop()?.toLowerCase() || (file.type === "image/png" ? "png" : "jpg"); const path = `${companyId}/logo.${extension}`;
      const { error: uploadError } = await supabase.storage.from("company-branding").upload(path, file, { upsert: true, contentType: file.type }); if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("company-branding").getPublicUrl(path); const freshUrl = `${publicUrl}?v=${Date.now()}`;
      const { error: updateError } = await supabase.from("company_settings").upsert({ company_id: companyId, company_name: name.trim() || "Steel Mill ERP", currency: currency.trim() || "PKR", logo_url: freshUrl, print_language: printLanguage, updated_at: new Date().toISOString() }, { onConflict: "company_id" }); if (updateError) throw updateError;
      setLogoUrl(freshUrl); setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err:any) { setError(err?.message || "Logo upload failed."); } finally { setUploadingLogo(false); }
  };

  const handleRemoveLogo = async () => {
    setUploadingLogo(true); setError(null);
    try {
      const companyId=await getCurrentCompanyId(); const {data:files,error:listError}=await supabase.storage.from("company-branding").list(companyId); if(listError)throw listError;
      const logoFiles=(files||[]).filter(f=>f.name.startsWith("logo.")).map(f=>`${companyId}/${f.name}`); if(logoFiles.length){const{error:removeError}=await supabase.storage.from("company-branding").remove(logoFiles);if(removeError)throw removeError;}
      const{error:updateError}=await supabase.from("company_settings").update({logo_url:null,updated_at:new Date().toISOString()}).eq("company_id",companyId);if(updateError)throw updateError;setLogoUrl("");setSaved(true);setTimeout(()=>setSaved(false),3000);
    } catch(err:any){setError(err?.message||"Failed to remove logo.");}finally{setUploadingLogo(false);}
  };

  const backfillUrdu = async () => {
    setBackfilling(true); setError(null); setNotice("");
    const { data, error } = await supabase.rpc("backfill_company_urdu_names");
    setBackfilling(false); if(error)return setError(error.message);
    setNotice(`Urdu backfill completed: ${Number((data as any)?.updated_rows || 0)} old master record(s) updated.`);
  };

  const handleSubmit = async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setSaved(false);setError(null);try{const companyId=await getCurrentCompanyId();const{error:saveError}=await supabase.from("company_settings").upsert({company_id:companyId,company_name:name.trim(),currency:currency.trim()||"PKR",address:address.trim()||null,phone:phone.trim()||null,email:email.trim()||null,website:website.trim()||null,ntn:ntn.trim()||null,strn:strn.trim()||null,print_language:printLanguage,updated_at:new Date().toISOString()},{onConflict:"company_id"});if(saveError)throw saveError;setSaved(true);setTimeout(()=>setSaved(false),3000);}catch(err:any){setError(err?.message||"Failed to save company settings.");}finally{setSaving(false);}};

  if(loading)return <div className="flex min-h-[300px] items-center justify-center"><Loader2 className="mr-2 h-5 w-5 animate-spin"/>Loading settings...</div>;
  return <div><PageHeader title="Company Settings / کمپنی سیٹنگز" subtitle="Company profile, print language and master-data language tools"/>{error&&<div className="mt-4"><ErrorBanner message={error}/></div>}{saved&&<div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">Settings saved successfully / سیٹنگز کامیابی سے محفوظ ہوگئیں۔</div>}{notice&&<div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-700">{notice}</div>}
   <form onSubmit={handleSubmit} className="mt-4 max-w-4xl space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3"><h2 className="font-bold text-slate-900">Company Branding / کمپنی برانڈنگ</h2><p className="mt-1 text-xs text-slate-500">Upload the logo used on invoices, work orders and reports.</p></div><div className="flex flex-wrap items-center gap-4"><div className="flex h-24 w-36 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white">{logoUrl?<img src={logoUrl} alt="Company logo" className="max-h-20 max-w-[130px] object-contain"/>:<div className="text-center text-xs text-slate-400">No Logo / کوئی لوگو نہیں</div>}</div><div className="flex flex-wrap gap-2"><label className="btn btn-secondary cursor-pointer">{uploadingLogo?<Loader2 className="h-4 w-4 animate-spin"/>:<ImagePlus className="h-4 w-4"/>}{logoUrl?"Change Logo / لوگو تبدیل کریں":"Upload Logo / لوگو اپ لوڈ کریں"}<input type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={uploadingLogo} onChange={e=>{void handleLogoUpload(e.target.files?.[0]||null);e.currentTarget.value="";}}/></label>{logoUrl&&<button type="button" className="btn btn-danger" disabled={uploadingLogo} onClick={()=>void handleRemoveLogo()}><Trash2 className="h-4 w-4"/>Remove Logo / لوگو ہٹائیں</button>}</div></div><p className="mt-3 text-xs text-slate-500">PNG, JPG, WebP or SVG — maximum 2 MB.</p></div>
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><div className="flex items-center gap-2 font-bold text-slate-900"><Languages size={18}/> Print & Report Language / پرنٹ زبان</div><p className="mt-1 text-xs text-slate-600">Default language for shared ERP invoice/print layouts.</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{([['english','English'],['urdu','Urdu / اردو'],['both','English + Urdu / دونوں']] as const).map(([value,label])=><label key={value} className={`cursor-pointer rounded-lg border p-3 text-sm font-semibold ${printLanguage===value?'border-blue-500 bg-white text-blue-700':'border-blue-200 bg-blue-50 text-slate-600'}`}><input className="mr-2" type="radio" name="printLanguage" checked={printLanguage===value} onChange={()=>setPrintLanguage(value)}/>{label}</label>)}</div></div>
    <div className="rounded-xl border border-slate-200 p-4"><h2 className="font-bold text-slate-900">Old Master Urdu Backfill / پرانے ریکارڈ کی اردو</h2><p className="mt-1 text-xs text-slate-500">Fills only blank Urdu names for the currently active company. Existing manually edited Urdu is never overwritten.</p><button type="button" className="btn btn-secondary mt-3" disabled={backfilling} onClick={()=>void backfillUrdu()}>{backfilling?<Loader2 className="h-4 w-4 animate-spin"/>:<Languages className="h-4 w-4"/>}Fill Missing Urdu Names</button></div>
    <div className="grid gap-4 md:grid-cols-2"><Field label="Company Name / کمپنی کا نام"><input className="input w-full" value={name} onChange={e=>setName(e.target.value)} required/></Field><Field label="Default Currency / بنیادی کرنسی"><input className="input w-full" value={currency} onChange={e=>setCurrency(e.target.value)} required/></Field><Field label="Phone / فون"><input className="input w-full" value={phone} onChange={e=>setPhone(e.target.value)}/></Field><Field label="Email / ای میل"><input type="email" className="input w-full" value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Website / ویب سائٹ"><input className="input w-full" value={website} onChange={e=>setWebsite(e.target.value)}/></Field><Field label="NTN / این ٹی این"><input className="input w-full" value={ntn} onChange={e=>setNtn(e.target.value)}/></Field><Field label="STRN / ایس ٹی آر این"><input className="input w-full" value={strn} onChange={e=>setStrn(e.target.value)}/></Field></div><Field label="Address / پتہ"><textarea className="input w-full" rows={3} value={address} onChange={e=>setAddress(e.target.value)}/></Field><div className="flex justify-end border-t border-slate-200 pt-4"><button type="submit" disabled={saving} className="btn btn-primary">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Save Settings / محفوظ کریں</button></div>
   </form></div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div><label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>{children}</div>}
