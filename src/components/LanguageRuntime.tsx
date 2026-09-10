import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { languageByCode, type LanguageMode } from "@/lib/languageConfig";

type RuntimeLanguage = {
  mode: LanguageMode;
  primary: string;
  secondary: string | null;
  documentMode: LanguageMode;
  documentPrimary: string;
  documentSecondary: string | null;
};

const ENGLISH_ONLY: RuntimeLanguage = {
  mode: "single",
  primary: "en",
  secondary: null,
  documentMode: "single",
  documentPrimary: "en",
  documentSecondary: null,
};

const originalText = new WeakMap<Text, string>();

async function loadRuntimeLanguage(): Promise<RuntimeLanguage> {
  const companyResult = await supabase
    .from("company_settings")
    .select("screen_language_mode,screen_primary_language,screen_secondary_language,document_language_mode,document_primary_language,document_secondary_language")
    .maybeSingle();

  const company: RuntimeLanguage = {
    mode: (companyResult.data?.screen_language_mode || "single") as LanguageMode,
    primary: companyResult.data?.screen_primary_language || "en",
    secondary: companyResult.data?.screen_language_mode === "bilingual" ? companyResult.data?.screen_secondary_language || null : null,
    documentMode: (companyResult.data?.document_language_mode || "single") as LanguageMode,
    documentPrimary: companyResult.data?.document_primary_language || "en",
    documentSecondary: companyResult.data?.document_language_mode === "bilingual" ? companyResult.data?.document_secondary_language || null : null,
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
    ...company,
    mode: (preference.screen_language_mode || "single") as LanguageMode,
    primary: preference.primary_language || "en",
    secondary: preference.screen_language_mode === "bilingual" ? preference.secondary_language || null : null,
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

  document.documentElement.dataset.documentLanguageMode = language.documentMode;
  document.documentElement.dataset.documentPrimaryLanguage = language.documentPrimary;
  if (language.documentSecondary) document.documentElement.dataset.documentSecondaryLanguage = language.documentSecondary;
  else delete document.documentElement.dataset.documentSecondaryLanguage;
}

function hasUrdu(value: string) {
  return /[\u0600-\u06FF]/.test(value);
}

function selectLanguageText(value: string, mode: LanguageMode, primary: string) {
  if (mode === "bilingual") return value;
  if (!value.includes("/") || !hasUrdu(value)) return value;

  const leading = value.match(/^\s*/)?.[0] || "";
  const trailing = value.match(/\s*$/)?.[0] || "";
  const parts = value.trim().split("/").map((part) => part.trim()).filter(Boolean);
  const rtlParts = parts.filter(hasUrdu);
  const ltrParts = parts.filter((part) => !hasUrdu(part));
  const chosen = primary === "ur" ? rtlParts : ltrParts;
  if (!chosen.length) return value;
  return `${leading}${chosen.join(" / ")}${trailing}`;
}

function translateTree(root: Node, language: RuntimeLanguage) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  nodes.forEach((node) => {
    const current = node.nodeValue || "";
    if (!current.trim()) return;

    const stored = originalText.get(node);
    if (!stored) originalText.set(node, current);
    const source = originalText.get(node) || current;
    const expected = selectLanguageText(source, language.mode, language.primary);

    if (stored && current !== source && current !== expected) {
      originalText.set(node, current);
      node.nodeValue = selectLanguageText(current, language.mode, language.primary);
      return;
    }

    if (node.nodeValue !== expected) node.nodeValue = expected;
  });
}

export default function LanguageRuntime() {
  useEffect(() => {
    let active = true;
    let language: RuntimeLanguage = ENGLISH_ONLY;
    let frame = 0;
    let applying = false;

    const apply = () => {
      if (!active) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        applying = true;
        applyDocumentLanguage(language);
        translateTree(document.body, language);
        queueMicrotask(() => { applying = false; });
      });
    };

    const refresh = async () => {
      try {
        language = await loadRuntimeLanguage();
      } catch {
        language = ENGLISH_ONLY;
      }
      apply();
    };

    const observer = new MutationObserver((mutations) => {
      if (!active || applying) return;
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE) translateTree(node, language);
        });
        if (mutation.type === "characterData" && mutation.target.nodeType === Node.TEXT_NODE) {
          const node = mutation.target as Text;
          const current = node.nodeValue || "";
          const stored = originalText.get(node);
          const storedExpected = stored ? selectLanguageText(stored, language.mode, language.primary) : "";
          if (!stored || (current !== stored && current !== storedExpected)) originalText.set(node, current);
          const source = originalText.get(node) || current;
          const next = selectLanguageText(source, language.mode, language.primary);
          if (node.nodeValue !== next) node.nodeValue = next;
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    void refresh();
    const handleChange = () => void refresh();
    window.addEventListener("navilo-language-changed", handleChange);

    return () => {
      active = false;
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("navilo-language-changed", handleChange);
    };
  }, []);

  return null;
}
