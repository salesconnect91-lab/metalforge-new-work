import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { languageByCode, type LanguageMode } from "@/lib/languageConfig";

type RuntimeLanguage = {
  mode: LanguageMode;
  primary: string;
  secondary: string | null;
};

async function loadRuntimeLanguage(): Promise<RuntimeLanguage> {
  const companyResult = await supabase
    .from("company_settings")
    .select("screen_language_mode,screen_primary_language,screen_secondary_language")
    .maybeSingle();

  const company: RuntimeLanguage = {
    mode: (companyResult.data?.screen_language_mode || "bilingual") as LanguageMode,
    primary: companyResult.data?.screen_primary_language || "en",
    secondary: companyResult.data?.screen_secondary_language || "ur",
  };

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return company;

  const preferenceResult = await supabase
    .from("user_language_preferences")
    .select("use_company_default,screen_language_mode,primary_language,secondary_language")
    .eq("user_id", userId)
    .maybeSingle();

  const preference = preferenceResult.data;
  if (!preference || preference.use_company_default !== false) return company;

  return {
    mode: (preference.screen_language_mode || "bilingual") as LanguageMode,
    primary: preference.primary_language || "en",
    secondary: preference.secondary_language || null,
  };
}

function applyDocumentLanguage(language: RuntimeLanguage) {
  const primary = languageByCode(language.primary);
  document.documentElement.lang = language.primary || "en";
  document.documentElement.dir = language.mode === "single" && primary?.direction === "rtl" ? "rtl" : "ltr";
  document.documentElement.dataset.languageMode = language.mode;
  document.documentElement.dataset.primaryLanguage = language.primary;
  if (language.secondary) document.documentElement.dataset.secondaryLanguage = language.secondary;
  else delete document.documentElement.dataset.secondaryLanguage;
}

export default function LanguageRuntime() {
  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const language = await loadRuntimeLanguage();
        if (active) applyDocumentLanguage(language);
      } catch {
        if (active) applyDocumentLanguage({ mode: "bilingual", primary: "en", secondary: "ur" });
      }
    };

    void refresh();
    const handleChange = () => void refresh();
    window.addEventListener("navilo-language-changed", handleChange);

    return () => {
      active = false;
      window.removeEventListener("navilo-language-changed", handleChange);
    };
  }, []);

  return null;
}
