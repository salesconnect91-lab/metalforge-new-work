export type LanguageMode = "single" | "bilingual";

export type NaviloLanguage = {
  code: string;
  label: string;
  nativeLabel: string;
  direction: "ltr" | "rtl";
};

/**
 * Languages that NAVILO can currently translate end-to-end at runtime.
 * Add a language here only after its UI/document translation dictionaries
 * and RTL/LTR behaviour are fully implemented and tested.
 */
export const NAVILO_LANGUAGES: NaviloLanguage[] = [
  { code: "en", label: "English", nativeLabel: "English", direction: "ltr" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو", direction: "rtl" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", direction: "rtl" },
];

export const SUPPORTED_RUNTIME_LANGUAGE_CODES = NAVILO_LANGUAGES.map((language) => language.code);

export const languageByCode = (code?: string | null) => NAVILO_LANGUAGES.find((language) => language.code === code) ?? NAVILO_LANGUAGES[0];

export function isSupportedRuntimeLanguage(code?: string | null): code is "en" | "ur" | "ar" {
  return code === "en" || code === "ur" || code === "ar";
}

export function legacyPrintLanguage(mode: LanguageMode, primary: string, secondary?: string | null): "english" | "urdu" | "both" {
  if (mode === "bilingual" && primary === "en" && secondary === "ur") return "both";
  if (mode === "single" && primary === "ur") return "urdu";
  return "english";
}

export function languageDisplayLabel(code: string) {
  const language = languageByCode(code);
  return language.label === language.nativeLabel ? language.label : `${language.label} — ${language.nativeLabel}`;
}
