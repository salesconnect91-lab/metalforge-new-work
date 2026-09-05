import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

type LoginMode = "password" | "otp";

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const normalizedEmail = email.trim().toLowerCase();

  const clearStatus = () => { setError(null); setMessage(null); };

  const signInWithPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!normalizedEmail || !password) return;
    clearStatus(); setLoading(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    setLoading(false);
    if (signInError) { setError(signInError.message); return; }
    if (data.session) { navigate("/", { replace: true }); return; }
    setError("Login could not be completed. Please try again.");
  };

  const sendPasswordReset = async () => {
    if (!normalizedEmail) { setError("Enter your registered email first."); return; }
    clearStatus(); setLoading(true);
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
    setLoading(false);
    if (resetError) { setError(resetError.message); return; }
    setMessage("Password reset link has been sent to your registered email. Please check your inbox.");
  };

  const sendOtp = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!normalizedEmail) return;
    clearStatus(); setLoading(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({ email: normalizedEmail, options: { shouldCreateUser: false } });
    setLoading(false);
    if (otpError) { setError(otpError.message); return; }
    setOtp(""); setOtpSent(true);
    setMessage("6-digit login OTP has been sent to your email.");
  };

  const verifyOtp = async (event?: FormEvent) => {
    event?.preventDefault();
    if (otp.length !== 6) { setError("Please enter the complete 6-digit OTP."); return; }
    clearStatus(); setLoading(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({ email: normalizedEmail, token: otp, type: "email" });
    setLoading(false);
    if (verifyError) { setError(verifyError.message); return; }
    if (data.session) { navigate("/", { replace: true }); return; }
    setError("OTP verification failed. Please request a new code and try again.");
  };

  const changeLoginId = () => { setOtpSent(false); setOtp(""); clearStatus(); };
  const changeMode = (next: LoginMode) => { setMode(next); setOtpSent(false); setOtp(""); setPassword(""); clearStatus(); };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/navilo-logo.svg" alt="NAVILO — Run Your Business as One." className="mx-auto w-52 rounded-3xl shadow-lg" />
          <p className="mt-3 text-slate-500">Secure ERP Login</p>
        </div>
        <div className="card p-6">
          <div className="mb-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-semibold">
            <button type="button" onClick={() => changeMode("password")} className={`rounded-md px-3 py-2 ${mode === "password" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Password</button>
            <button type="button" onClick={() => changeMode("otp")} className={`rounded-md px-3 py-2 ${mode === "otp" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Email OTP</button>
          </div>
          <h2 className="text-center text-lg font-semibold text-slate-800">{mode === "otp" && otpSent ? "Verify Login OTP" : "Sign In"}</h2>
          <p className="mt-1 mb-5 text-center text-xs text-slate-500">{mode === "password" ? "Sign in with your registered email and password." : otpSent ? `OTP sent to ${normalizedEmail}` : "Enter your registered email. We will send a login OTP."}</p>
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {message && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}

          {mode === "password" ? (
            <form onSubmit={signInWithPassword} className="space-y-4">
              <div><label className="label">Login ID / Email</label><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input" placeholder="name@gmail.com" /></div>
              <div><label className="label">Password</label><input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="input" placeholder="Enter password" /></div>
              <div className="flex justify-end"><button type="button" disabled={loading} onClick={() => void sendPasswordReset()} className="text-xs font-semibold text-primary-600 hover:text-primary-700 disabled:opacity-50">Forgot password?</button></div>
              <button type="submit" disabled={loading || !normalizedEmail || !password} className="btn-primary w-full">{loading ? "Signing in…" : "Sign In"}</button>
            </form>
          ) : !otpSent ? (
            <form onSubmit={sendOtp} className="space-y-4">
              <div><label className="label">Login ID / Email</label><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input" placeholder="name@gmail.com" /></div>
              <button type="submit" disabled={loading || !normalizedEmail} className="btn-primary w-full">{loading ? "Sending OTP…" : "Send Login OTP"}</button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="space-y-4">
              <div><label className="label">6-digit OTP</label><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} className="input text-center text-xl tracking-[0.35em]" placeholder="123456" autoFocus /></div>
              <button type="submit" disabled={loading || otp.length !== 6} className="btn-primary w-full">{loading ? "Verifying…" : "Verify & Login"}</button>
              <div className="flex items-center justify-between gap-3 text-xs"><button type="button" onClick={changeLoginId} className="font-medium text-slate-500 hover:text-slate-800">Change Login ID</button><button type="button" disabled={loading} onClick={() => void sendOtp()} className="font-semibold text-primary-600 hover:text-primary-700 disabled:opacity-50">Resend OTP</button></div>
            </form>
          )}
        </div>
        <p className="mt-5 text-center text-xs text-slate-400">Access is allowed only for registered NAVILO users.</p>
      </div>
    </div>
  );
}
