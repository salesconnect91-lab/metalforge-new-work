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

type MasterName = {
  id: string;
  name: string;
  secondaryName: string;
};

type MasterCatalog = {
  byId: Map<string, MasterName>;
  byEnglishName: Map<string, MasterName>;
  namesByLength: MasterName[];
  itemUnits: Map<string, string>;
};

const URDU_RE = /[\u0600-\u06FF]/;
const LATIN_RE = /[A-Za-z]/;
const nodeState = new WeakMap<Text, NodeState>();

const emptyCatalog = (): MasterCatalog => ({
  byId: new Map(),
  byEnglishName: new Map(),
  namesByLength: [],
  itemUnits: new Map(),
});

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
  if (parts) {
    if (language.primary === "ur") {
      const selected = parts.filter((part) => URDU_RE.test(part));
      return selected.length ? selected.join(" / ") : "";
    }
    const selected = parts.filter((part) => !URDU_RE.test(part));
    return selected.length ? selected.join(" / ") : "";
  }

  const trimmed = value.trim();
  if (!trimmed) return value;
  const hasUrdu = URDU_RE.test(trimmed);
  const hasLatin = LATIN_RE.test(trimmed);

  if (language.primary === "en" && hasUrdu && !hasLatin) return value.replace(trimmed, "");
  if (language.primary !== "ur" && hasUrdu && !hasLatin) return value.replace(trimmed, "");
  return value;
}

function decorateMasterName(value: string, node: Text, language: RuntimeLanguage, catalog: MasterCatalog) {
  if (language.mode !== "bilingual" || !language.secondary || catalog.byId.size === 0) return value;
  if (value.includes(" / ")) return value;

  const parent = node.parentElement;
  const trimmed = value.trim();
  if (!trimmed) return value;

  if (parent?.tagName === "OPTION") {
    const option = parent as HTMLOptionElement;
    const byId = option.value ? catalog.byId.get(option.value) : undefined;
    if (byId?.secondaryName && value.includes(byId.name)) {
      return value.replace(byId.name, `${byId.name} / ${byId.secondaryName}`);
    }
    for (const entry of catalog.namesByLength) {
      if (entry.secondaryName && value.includes(entry.name)) {
        return value.replace(entry.name, `${entry.name} / ${entry.secondaryName}`);
      }
    }
    return value;
  }

  const exact = catalog.byEnglishName.get(trimmed.toLowerCase());
  if (!exact?.secondaryName) return value;
  return value.replace(trimmed, `${exact.name} / ${exact.secondaryName}`);
}

function applyToTextNode(node: Text, language: RuntimeLanguage, catalog: MasterCatalog) {
  const current = node.nodeValue ?? "";
  const previous = nodeState.get(node);
  const original = previous && current === previous.applied ? previous.original : current;
  const decorated = decorateMasterName(original, node, language, catalog);
  const next = renderLegacyBilingualText(decorated, language);
  nodeState.set(node, { original, applied: next });
  if (current !== next) node.nodeValue = next;
}

function applyStockQuantityUnit(catalog: MasterCatalog) {
  if (!catalog.itemUnits.size) return;
  for (const select of Array.from(document.querySelectorAll("select"))) {
    const unit = catalog.itemUnits.get((select as HTMLSelectElement).value);
    if (!unit) continue;
    const form = select.closest("form");
    if (!form) continue;
    const formText = form.textContent || "";
    if (!/Stock IN|Stock OUT|Stock Adjustment|اسٹاک/.test(formText)) continue;

    const quantityLabel = Array.from(form.querySelectorAll("label")).find((label) =>
      /^(New Quantity|Quantity)(\s|\*)/.test((label.textContent || "").trim())
    );
    if (!quantityLabel) continue;

    let badge = quantityLabel.querySelector<HTMLElement>("[data-navilo-stock-uom]");
    if (!badge) {
      badge = document.createElement("span");
      badge.dataset.naviloStockUom = "true";
      badge.className = "ml-1 font-black text-primary-600";
      quantityLabel.appendChild(badge);
    }
    badge.textContent = `(${unit})`;
  }
}

function applyLanguageToDom(language: RuntimeLanguage, catalog: MasterCatalog) {
  const root = document.getElementById("root");
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    applyToTextNode(node as Text, language, catalog);
    node = walker.nextNode();
  }
  applyStockQuantityUnit(catalog);

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

async function loadMasterCatalog(language: RuntimeLanguage): Promise<MasterCatalog> {
  if (language.mode !== "bilingual" || !language.secondary) return emptyCatalog();

  const secondary = language.secondary;
  const tables = ["items", "customers", "suppliers", "warehouses", "godowns", "categories", "uom", "transporters"] as const;
  const [tableResults, itemUnitResult, salespersonResult, translationResult] = await Promise.all([
    Promise.all(tables.map((table) => supabase.from(table).select("id,name,name_urdu"))),
    supabase.from("items").select("id,unit"),
    supabase.from("chart_of_accounts").select("id,name").eq("account_role", "sales_person"),
    supabase.from("entity_translations").select("entity_id,language_code,name").eq("language_code", secondary),
  ]);

  const translatedById = new Map<string, string>();
  for (const row of translationResult.data ?? []) {
    if (row.entity_id && row.name) translatedById.set(String(row.entity_id), String(row.name).trim());
  }

  const entries: MasterName[] = [];
  for (const result of tableResults) {
    for (const row of result.data ?? []) {
      const id = String(row.id ?? "");
      const name = String(row.name ?? "").trim();
      if (!id || !name) continue;
      const legacyUrdu = secondary === "ur" ? String(row.name_urdu ?? "").trim() : "";
      const secondaryName = translatedById.get(id) || legacyUrdu;
      if (secondaryName && secondaryName !== name) entries.push({ id, name, secondaryName });
    }
  }

  for (const row of salespersonResult.data ?? []) {
    const id = String(row.id ?? "");
    const name = String(row.name ?? "").trim();
    const secondaryName = translatedById.get(id) || "";
    if (id && name && secondaryName && secondaryName !== name) entries.push({ id, name, secondaryName });
  }

  const itemUnits = new Map<string, string>();
  for (const row of itemUnitResult.data ?? []) {
    const id = String(row.id ?? "");
    const unit = String(row.unit ?? "").trim();
    if (id && unit) itemUnits.set(id, unit);
  }

  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const byEnglishName = new Map<string, MasterName>();
  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    if (!byEnglishName.has(key)) byEnglishName.set(key, entry);
  }
  return {
    byId,
    byEnglishName,
    namesByLength: [...entries].sort((a, b) => b.name.length - a.name.length),
    itemUnits,
  };
}

export default function LanguageRuntime() {
  useEffect(() => {
    let active = true;
    let observer: MutationObserver | null = null;
    let language: RuntimeLanguage = { mode: "bilingual", primary: "en", secondary: "ur" };
    let catalog: MasterCatalog = emptyCatalog();

    const start = async () => {
      observer?.disconnect();
      observer = null;
      try {
        language = await loadRuntimeLanguage();
        catalog = await loadMasterCatalog(language);
      } catch {
        language = { mode: "bilingual", primary: "en", secondary: "ur" };
        catalog = emptyCatalog();
      }
      if (!active) return;

      applyLanguageToDom(language, catalog);
      const root = document.getElementById("root");
      if (!root) return;

      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "characterData") {
            applyToTextNode(mutation.target as Text, language, catalog);
            continue;
          }
          mutation.addedNodes.forEach((added) => {
            if (added.nodeType === Node.TEXT_NODE) {
              applyToTextNode(added as Text, language, catalog);
            } else if (added.nodeType === Node.ELEMENT_NODE) {
              const walker = document.createTreeWalker(added, NodeFilter.SHOW_TEXT);
              let child = walker.nextNode();
              while (child) {
                applyToTextNode(child as Text, language, catalog);
                child = walker.nextNode();
              }
            }
          });
        }
        applyStockQuantityUnit(catalog);
      });
      observer.observe(root, { subtree: true, childList: true, characterData: true });
    };

    const refresh = () => void start();
    const onChange = () => window.setTimeout(() => applyStockQuantityUnit(catalog), 0);
    void start();
    window.addEventListener("navilo-language-changed", refresh);
    window.addEventListener("navilo-master-data-changed", refresh);
    document.addEventListener("change", onChange, true);

    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener("navilo-language-changed", refresh);
      window.removeEventListener("navilo-master-data-changed", refresh);
      document.removeEventListener("change", onChange, true);
    };
  }, []);

  return null;
}
