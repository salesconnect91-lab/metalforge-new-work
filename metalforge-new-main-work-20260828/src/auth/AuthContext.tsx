import { useEffect, useState, createContext, useContext, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AccountingSetupState = {
  userId: string | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  accountingSetupError: string | null;
  retryAccountingSetup: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [accountingAttempt, setAccountingAttempt] = useState(0);
  const [accountingSetup, setAccountingSetup] =
    useState<AccountingSetupState>({
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

  useEffect(() => {
    const userId = session?.user.id;

    if (!userId) {
      setAccountingSetup({
        userId: null,
        status: "idle",
        error: null,
      });
      return;
    }

    let cancelled = false;

    setAccountingSetup({
      userId,
      status: "loading",
      error: null,
    });

    void (async () => {
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

      setAccountingSetup({
        userId,
        status: "ready",
        error: null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user.id, accountingAttempt]);

  const retryAccountingSetup = () => {
    setAccountingSetup((current) => ({
      ...current,
      status: "loading",
      error: null,
    }));
    setAccountingAttempt((attempt) => attempt + 1);
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
  };

  const currentUserId = session?.user.id ?? null;
  const accountingStateMatchesUser =
    accountingSetup.userId === currentUserId;
  const accountingSetupError =
    currentUserId &&
    accountingStateMatchesUser &&
    accountingSetup.status === "error"
      ? accountingSetup.error
      : null;
  const accountingLoading =
    Boolean(currentUserId) &&
    (!accountingStateMatchesUser ||
      accountingSetup.status === "idle" ||
      accountingSetup.status === "loading");
  const loading = authLoading || accountingLoading;

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        accountingSetupError,
        retryAccountingSetup,
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
