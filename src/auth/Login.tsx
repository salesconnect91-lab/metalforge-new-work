import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();

  const sendOtp = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!normalizedEmail) return;

    setError(null);
    setMessage(null);
    setLoading(true);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        // Only IDs already created in Supabase Auth can log in.
        shouldCreateUser: false,
      },
    });

    setLoading(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    setOtp("");
    setOtpSent(true);
    setMessage("6-digit login OTP has been sent to your email. Please check your Gmail inbox.");
  };

  const verifyOtp = async (event?: FormEvent) => {
    event?.preventDefault();
    if (otp.length !== 6) {
      setError("Please enter the complete 6-digit OTP.");
      return;
    }

    setError(null);
    setMessage(null);
    setLoading(true);

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: otp,
      type: "email",
    });

    setLoading(false);

    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    if (data.session) {
      navigate("/", { replace: true });
      return;
    }

    setError("OTP verification failed. Please request a new code and try again.");
  };

  const changeLoginId = () => {
    setOtpSent(false);
    setOtp("");
    setError(null);
    setMessage(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600 text-white">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 2 7l10 5 10-5-10-5Z" />
              <path d="m2 17 10 5 10-5" />
              <path d="m2 12 10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">NAVILO</h1>
          <p className="mt-1 text-slate-500">Secure ERP Login</p>
        </div>

        <div className="card p-6">
          <h2 className="text-center text-lg font-semibold text-slate-800">
            {otpSent ? "Verify Login OTP" : "Sign In"}
          </h2>
          <p className="mt-1 mb-5 text-center text-xs text-slate-500">
            {otpSent
              ? `OTP sent to ${normalizedEmail}`
              : "Enter your registered Login ID. We will send an OTP to your email."}
          </p>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {message}
            </div>
          )}

          {!otpSent ? (
            <form onSubmit={sendOtp} className="space-y-4">
              <div>
                <label className="label">Login ID / Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="input"
                  placeholder="name@gmail.com"
                />
              </div>

              <button type="submit" disabled={loading || !normalizedEmail} className="btn-primary w-full">
                {loading ? "Sending OTP…" : "Send Login OTP"}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="space-y-4">
              <div>
                <label className="label">6-digit OTP</label>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="input text-center text-xl tracking-[0.35em]"
                  placeholder="123456"
                  autoFocus
                />
              </div>

              <button type="submit" disabled={loading || otp.length !== 6} className="btn-primary w-full">
                {loading ? "Verifying…" : "Verify & Login"}
              </button>

              <div className="flex items-center justify-between gap-3 text-xs">
                <button type="button" onClick={changeLoginId} className="font-medium text-slate-500 hover:text-slate-800">
                  Change Login ID
                </button>
                <button type="button" disabled={loading} onClick={() => void sendOtp()} className="font-semibold text-primary-600 hover:text-primary-700 disabled:opacity-50">
                  Resend OTP
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">
          Access is allowed only for registered NAVILO users.
        </p>
      </div>
    </div>
  );
}
