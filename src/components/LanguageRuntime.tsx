import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { languageByCode, type LanguageMode } from "@/lib/languageConfig";

type RuntimeLanguage = {
  mode: LanguageMode;
  primary: string;
  secondary: string | null;
};

type NodeState = {
  original: string;
  applied: string;
};

const URDU_RE = /[\u0600-\u06FF]/;
const LATIN_RE = /[A-Za-z]/;
const nodeState = new WeakMap<Text, NodeState>();

function splitBilingualText(value: string) {
  const parts = value.split(/\s*\/\s*/).filter(Boolean);
  if (parts.length < 2) return null;
  const hasUrdu = parts.some((part) => URDU_RE.test(part));
  const hasNonUrdu = parts.some((part) => !URDU_RE.test(part) && LATIN_RE.test(part));
  if (!hasUrdu || !hasNonUrdu) return null;
  return parts;
}

function renderLegacyBilingualText(value: string, language: RuntimeLanguage) {
  if (language.mode === "bilingual") return value;
  const parts = splitBilingualText(value);
  if (!parts) return value;

  if (language.primary === "ur") {
    const selected = parts.filter((part) => URDU_RE.test(part));
    return selected.length ? selected.join(" / ") : value;
  }

  if (language.primary === "en") {
    const selected = parts.filter((part) => !URDU_RE.test(part));
    return selected.length ? selected.join(" / ") : value;
  }

  // Legacy English/Urdu hard-coded labels should not leak into another
  // single-language mode. Until that label has a translation in the generic
  // translation layer, keep the English fallback rather than showing Urdu too.
  const selected = parts.filter((part) => !URDU_RE.test(part));
  return selected.length ? selected.join(" / ") : value;
}

function applyToTextNode(node: Text, language: RuntimeLanguage) {
  const current = node.nodeValue ?? "";
  const previous = nodeState.get(node);
  const original = previous && current === previous.applied ? previous.original : current;
  const next = renderLegacyBilingualText(original, language);
  nodeState.set(node, { original, applied: next });
  if (current !== next) node.nodeValue = next;
}

function applyLanguageToDom(language: RuntimeLanguage) {
  const root = document.getElementById("root");
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    applyToTextNode(node as Text, language);
    node = walker.nextNode();
  }

  const primary = languageByCode(language.primary);
  document.documentElement.lang = language.primary || "en";
  document.documentElement.dir = language.mode === "single" && primary?.direction === "rtl" ? "rtl" : "ltr";
  document.documentElement.dataset.languageMode = language.mode;
  document.documentElement.dataset.primaryLanguage = language.primary;
  if (language.secondary) document.documentElement.dataset.secondaryLanguage = language.secondary;
  else delete document.documentElement.dataset.secondaryLanguage;
}

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

  const pref = preferenceResult.data;
  if (!pref || pref.use_company_default !== false) return company;

  return {
    mode: (pref.screen_language_mode || "bilingual") as LanguageMode,
    primary: pref.primary_language || "en",
    secondary: pref.secondary_language || null,
  };
}

export default function LanguageRuntime() {
  useEffect(() => {
    let active = true;
    let observer: MutationObserver | null = null;
    let language: RuntimeLanguage = { mode: "bilingual", primary: "en", secondary: "ur" };

    const start = async () => {
      try {
        language = await loadRuntimeLanguage();
      } catch {
        language = { mode: "bilingual", primary: "en", secondary: "ur" };
      }
      if (!active) return;

      applyLanguageToDom(language);
      const root = document.getElementById("root");
      if (!root) return;

      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "characterData") {
            applyToTextNode(mutation.target as Text, language);
            continue;
          }
          mutation.addedNodes.forEach((added) => {
            if (added.nodeType === Node.TEXT_NODE) {
              applyToTextNode(added as Text, language);
            } else if (added.nodeType === Node.ELEMENT_NODE) {
              const walker = document.createTreeWalker(added, NodeFilter.SHOW_TEXT);
              let child = walker.nextNode();
              while (child) {
                applyToTextNode(child as Text, language);
                child = walker.nextNode();
              }
            }
          });
        }
      });
      observer.observe(root, { subtree: true, childList: true, characterData: true });
    };

    const refresh = () => void start();
    void start();
    window.addEventListener("navilo-language-changed", refresh);

    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener("navilo-language-changed", refresh);
    };
  }, []);

  return null;
}
