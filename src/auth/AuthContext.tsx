import { useEffect, useState, createContext, useContext, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type CompanyAccess = {
  company_id: string;
  company_name: string;
  company_code: string;
  company_status: "trial" | "active" | "suspended" | "expired" | "closed";
  subscription_expires_at: string | null;
  membership_role: string;
  membership_active: boolean;
  permissions: Record<string, unknown>;
  access_allowed: boolean;
};

type AccessContext = {
  user_id: string;
  profile_active: boolean;
  platform_role: "super_admin" | "support" | "user";
  is_platform_owner: boolean;
  companies: CompanyAccess[];
};

type AccountingSetupState = {
  userId: string | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  accessContext: AccessContext | null;
  accessError: string | null;
  isPlatformOwner: boolean;
  activeCompany: CompanyAccess | null;
  accountingSetupError: string | null;
  retryAccountingSetup: () => void;
  refreshAccess: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessContext, setAccessContext] = useState<AccessContext | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accountingAttempt, setAccountingAttempt] = useState(0);
  const [accountingSetup, setAccountingSetup] = useState<AccountingSetupState>({
    userId: null,
    status: "idle",
    error: null,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const loadAccess = async () => {
    if (!session?.user.id) {
      setAccessContext(null);
      setAccessError(null);
      return;
    }

    setAccessLoading(true);
    setAccessError(null);

    const { data, error } = await supabase.rpc("get_my_access_context");

    if (error) {
      setAccessContext(null);
      setAccessError(error.message);
    } else if (!data) {
      setAccessContext(null);
      setAccessError("Your login profile has not been provisioned by the software owner.");
    } else {
      setAccessContext(data as AccessContext);
    }

    setAccessLoading(false);
  };

  useEffect(() => {
    void loadAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  useEffect(() => {
    const userId = session?.user.id;

    if (!userId || accessLoading || !accessContext) {
      setAccountingSetup({ userId: null, status: "idle", error: null });
      return;
    }

    const allowed =
      accessContext.profile_active &&
      (accessContext.is_platform_owner || accessContext.companies.some((company) => company.access_allowed));

    if (!allowed) {
      setAccountingSetup({ userId, status: "ready", error: null });
      return;
    }

    let cancelled = false;
    setAccountingSetup({ userId, status: "loading", error: null });

    void (async () => {
      // COA is company-owned now. Only initialize it when the current company has no accounts yet.
      const { count, error: countError } = await supabase
        .from("chart_of_accounts")
        .select("id", { count: "exact", head: true });

      if (cancelled) return;
      if (countError) {
        setAccountingSetup({ userId, status: "error", error: countError.message });
        return;
      }

      if ((count ?? 0) === 0) {
        const { error } = await supabase.rpc("initialize_default_coa");
        if (cancelled) return;
        if (error) {
          setAccountingSetup({
            userId,
            status: "error",
            error: error.hint || error.details || error.message,
          });
          return;
        }
      }

      setAccountingSetup({ userId, status: "ready", error: null });
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user.id, accessContext, accessLoading, accountingAttempt]);

  const retryAccountingSetup = () => {
    setAccountingSetup((current) => ({ ...current, status: "loading", error: null }));
    setAccountingAttempt((attempt) => attempt + 1);
  };

  const refreshAccess = async () => {
    await loadAccess();
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setAccessContext(null);
    setAccessError(null);
  };

  const currentUserId = session?.user.id ?? null;
  const accountingStateMatchesUser = accountingSetup.userId === currentUserId;
  const accountingSetupError =
    currentUserId && accountingStateMatchesUser && accountingSetup.status === "error"
      ? accountingSetup.error
      : null;
  const accountingLoading =
    Boolean(currentUserId && accessContext) &&
    (!accountingStateMatchesUser ||
      accountingSetup.status === "idle" ||
      accountingSetup.status === "loading");

  const isPlatformOwner = Boolean(accessContext?.is_platform_owner);
  const activeCompany =
    accessContext?.companies.find((company) => company.access_allowed) ?? null;
  const loading = authLoading || accessLoading || accountingLoading;

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        accessContext,
        accessError,
        isPlatformOwner,
        activeCompany,
        accountingSetupError,
        retryAccountingSetup,
        refreshAccess,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
