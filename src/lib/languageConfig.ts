export type LanguageMode = "single" | "bilingual";

export type NaviloLanguage = {
  code: string;
  label: string;
  nativeLabel: string;
  direction: "ltr" | "rtl";
};

export const NAVILO_LANGUAGES: NaviloLanguage[] = [
  { code: "en", label: "English", nativeLabel: "English", direction: "ltr" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو", direction: "rtl" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", direction: "rtl" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", direction: "ltr" },
  { code: "fr", label: "French", nativeLabel: "Français", direction: "ltr" },
  { code: "es", label: "Spanish", nativeLabel: "Español", direction: "ltr" },
  { code: "de", label: "German", nativeLabel: "Deutsch", direction: "ltr" },
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe", direction: "ltr" },
  { code: "zh", label: "Chinese", nativeLabel: "中文", direction: "ltr" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português", direction: "ltr" },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia", direction: "ltr" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা", direction: "ltr" },
  { code: "fa", label: "Persian", nativeLabel: "فارسی", direction: "rtl" },
];

export const languageByCode = (code?: string | null) => NAVILO_LANGUAGES.find((language) => language.code === code) ?? NAVILO_LANGUAGES[0];

export function legacyPrintLanguage(mode: LanguageMode, primary: string, secondary?: string | null): "english" | "urdu" | "both" {
  if (mode === "bilingual" && primary === "en" && secondary === "ur") return "both";
  if (mode === "single" && primary === "ur") return "urdu";
  return "english";
}

export function languageDisplayLabel(code: string) {
  const language = languageByCode(code);
  return language.label === language.nativeLabel ? language.label : `${language.label} — ${language.nativeLabel}`;
}
