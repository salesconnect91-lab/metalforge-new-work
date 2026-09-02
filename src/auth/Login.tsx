import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null); setMessage(null); setLoading(true);
    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (loginError) { setError(loginError.message); return; }
    if (data.user) navigate("/");
  };

  const sendOtp = async () => {
    setError(null); setMessage(null); setLoading(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    setLoading(false);
    if (otpError) { setError(otpError.message); return; }
    setOtpSent(true); setMessage("OTP sent to your email. / آپ کے ای میل پر OTP بھیج دیا گیا ہے۔");
  };

  const verifyOtp = async () => {
    setError(null); setMessage(null); setLoading(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
    setLoading(false);
    if (verifyError) { setError(verifyError.message); return; }
    if (data.user) navigate("/");
  };

  return <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4"><div className="w-full max-w-md">
    <div className="mb-8 text-center"><div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-white"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg></div><h1 className="text-2xl font-bold text-slate-900">MetalForge OS</h1><p className="mt-1 text-slate-500">Manufacturing ERP Platform / مینوفیکچرنگ ERP</p></div>
    <div className="card p-6"><div className="mb-4 flex rounded-lg bg-slate-100 p-1"><button type="button" onClick={()=>{setMode("password");setOtpSent(false)}} className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold ${mode==="password"?"bg-white shadow text-slate-900":"text-slate-500"}`}>Password / پاس ورڈ</button><button type="button" onClick={()=>setMode("otp")} className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold ${mode==="otp"?"bg-white shadow text-slate-900":"text-slate-500"}`}>Email OTP / ای میل OTP</button></div>
      <h2 className="mb-4 text-center text-lg font-semibold text-slate-800">Sign In / اکاؤنٹ میں داخل ہوں</h2>
      {error&&<div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}{message&&<div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}
      <div className="space-y-4"><div><label className="label">Email Address / ای میل</label><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="input" placeholder="name@company.com"/></div>
      {mode==="password" ? <><div><label className="label">Password / پاس ورڈ</label><input type="password" required value={password} onChange={e=>setPassword(e.target.value)} className="input" placeholder="••••••••"/></div><button type="button" disabled={loading} onClick={()=>void handleLogin()} className="btn-primary w-full">{loading?"Signing in…":"Sign In / داخل ہوں"}</button></> : <>{!otpSent ? <button type="button" disabled={loading||!email} onClick={()=>void sendOtp()} className="btn-primary w-full">{loading?"Sending…":"Send OTP / OTP بھیجیں"}</button> : <><div><label className="label">Email OTP / OTP / ای میل تصدیقی کوڈ</label><input inputMode="numeric" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,""))} className="input text-center text-lg tracking-[0.35em]" placeholder="123456"/></div><button type="button" disabled={loading||otp.length<4} onClick={()=>void verifyOtp()} className="btn-primary w-full">{loading?"Verifying…":"Verify OTP / تصدیق کریں"}</button></>}</>}</div>
    </div><p className="mt-6 text-center text-sm text-slate-400"><Link to="/" className="hover:text-slate-600">Back to dashboard / ڈیش بورڈ</Link></p></div></div>;
}
