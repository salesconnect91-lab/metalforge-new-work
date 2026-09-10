import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type PlatformBranding = {
  id: number;
  erp_name: string;
  tagline: string | null;
  logo_url: string | null;
  show_branding: boolean;
  show_on_login: boolean;
  show_in_sidebar: boolean;
  show_on_prints: boolean;
  show_tagline: boolean;
};

export const HIDDEN_PLATFORM_BRANDING: PlatformBranding = {
  id: 1,
  erp_name: "",
  tagline: null,
  logo_url: null,
  show_branding: false,
  show_on_login: true,
  show_in_sidebar: true,
  show_on_prints: true,
  show_tagline: true,
};

let cachedBranding: PlatformBranding | null = null;
let pendingLoad: Promise<PlatformBranding> | null = null;

export async function loadPlatformBranding(force = false): Promise<PlatformBranding> {
  if (!force && cachedBranding) return cachedBranding;
  if (!force && pendingLoad) return pendingLoad;

  pendingLoad = (async () => {
    const { data, error } = await supabase
      .from("platform_branding")
      .select("id,erp_name,tagline,logo_url,show_branding,show_on_login,show_in_sidebar,show_on_prints,show_tagline")
      .eq("id", 1)
      .maybeSingle();

    if (error || !data) {
      // Branding is intentionally fail-closed. A database/network problem must
      // never make the product name or logo appear automatically.
      return HIDDEN_PLATFORM_BRANDING;
    }

    const branding = data as PlatformBranding;
    cachedBranding = branding;
    return branding;
  })();

  try {
    return await pendingLoad;
  } finally {
    pendingLoad = null;
  }
}

export function invalidatePlatformBranding() {
  cachedBranding = null;
  window.dispatchEvent(new CustomEvent("platform-branding:changed"));
}

export function usePlatformBranding() {
  const [branding, setBranding] = useState<PlatformBranding>(cachedBranding ?? HIDDEN_PLATFORM_BRANDING);
  const [loading, setLoading] = useState(!cachedBranding);

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    try {
      setBranding(await loadPlatformBranding(force));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
    const onChanged = () => void refresh(true);
    window.addEventListener("platform-branding:changed", onChanged);
    return () => window.removeEventListener("platform-branding:changed", onChanged);
  }, [refresh]);

  return { branding, loading, refresh };
}
