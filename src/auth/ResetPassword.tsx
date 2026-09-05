import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setReady(Boolean(data.session));
      if (!data.session) setError("Reset link is invalid or expired. Please request a new password reset email.");
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) { setReady(true); setError(null); }
    });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null); setMessage(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) { setError(updateError.message); return; }
    setMessage("Password updated successfully. You can now sign in with your new password.");
    await supabase.auth.signOut();
    window.setTimeout(() => navigate("/login", { replace: true }), 1200);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/navilo-logo.svg" alt="NAVILO" className="mx-auto w-40 rounded-3xl shadow-lg" />
          <p className="mt-3 text-slate-500">Reset Password</p>
        </div>
        <div className="card p-6">
          <h1 className="text-center text-lg font-semibold text-slate-800">Set New Password</h1>
          <p className="mt-1 mb-5 text-center text-xs text-slate-500">Choose a new password for your NAVILO account.</p>
          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {message && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div>}
          <form onSubmit={submit} className="space-y-4">
            <div><label className="label">New Password</label><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" disabled={!ready || loading} /></div>
            <div><label className="label">Confirm New Password</label><input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" disabled={!ready || loading} /></div>
            <button type="submit" className="btn-primary w-full" disabled={!ready || loading}>{loading ? "Updating…" : "Update Password"}</button>
          </form>
          <button type="button" onClick={() => navigate("/login")} className="mt-4 w-full text-center text-xs font-semibold text-primary-600">Back to Sign In</button>
        </div>
      </div>
    </div>
  );
}
