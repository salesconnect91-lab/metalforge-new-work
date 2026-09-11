type ScreenLanguage = "en" | "ur" | "ar";

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-z]/;
const URDU_SPECIFIC = /[ٹڈڑںھہےۓژگچپ]/;
const SKIP_SELECTOR = "script,style,svg,canvas,code,pre,.print-document,[data-language-preserve],[data-business-data],input,textarea";

function screenConfig() {
  const root = document.documentElement;
  const mode = root.dataset.languageMode === "bilingual" ? "bilingual" : "single";
  const primary = (root.dataset.primaryLanguage || "en") as ScreenLanguage;
  const secondary = (root.dataset.secondaryLanguage || "") as ScreenLanguage | "";
  const selected = mode === "bilingual" && secondary && secondary !== primary ? [primary, secondary] : [primary];
  return { mode, selected };
}

function splitSegments(value: string) {
  return value.split(/\s*\/\s*|\s*[|•·]\s*|\n+/).map((part) => part.trim()).filter(Boolean);
}

function languageKind(segment: string): ScreenLanguage | "mixed" | "neutral" {
  const hasArabic = ARABIC_SCRIPT.test(segment);
  const hasLatin = LATIN.test(segment);
  if (hasArabic && hasLatin) return "mixed";
  if (hasLatin) return "en";
  if (!hasArabic) return "neutral";
  return URDU_SPECIFIC.test(segment) ? "ur" : "ar";
}

function keepSegment(segment: string, selected: ScreenLanguage[]) {
  const kind = languageKind(segment);
  if (kind === "neutral") return true;
  if (kind === "mixed") return true;
  if (kind === "en") return selected.includes("en");
  if (kind === "ur") return selected.includes("ur");
  if (kind === "ar") return selected.includes("ar") || selected.includes("ur");
  return true;
}

function filterText(value: string, selected: ScreenLanguage[]) {
  const trimmed = value.trim();
  if (!trimmed) return value;

  const segments = splitSegments(trimmed);
  if (segments.length > 1) {
    const kept = segments.filter((segment) => keepSegment(segment, selected));
    if (kept.length && kept.length !== segments.length) return kept.join(" / ");
  }

  const onlyEnglish = selected.length === 1 && selected[0] === "en";
  if (onlyEnglish && ARABIC_SCRIPT.test(trimmed) && LATIN.test(trimmed)) {
    return trimmed
      .replace(/[\u0600-\u06FF][\u0600-\u06FF\s،؛؟ـ\-–—:()]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s*\/\s*$/, "")
      .trim();
  }

  return value;
}

function hasLatinNearby(node: Text) {
  const parent = node.parentElement;
  if (!parent) return false;
  const scope = parent.parentElement || parent;
  const full = (scope.textContent || "").replace(node.nodeValue || "", " ");
  return LATIN.test(full);
}

function shouldBlankStandalone(node: Text, selected: ScreenLanguage[]) {
  const text = (node.nodeValue || "").trim();
  if (!text || !ARABIC_SCRIPT.test(text) || LATIN.test(text)) return false;
  if (!(selected.length === 1 && selected[0] === "en")) return false;
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP_SELECTOR) || parent.closest("tbody,td,[contenteditable='true']")) return false;
  const tag = parent.tagName.toLowerCase();
  const semanticUi = /^(button|label|th|h1|h2|h3|h4|h5|h6|a|option|legend)$/.test(tag) || Boolean(parent.closest("nav,[role='button'],[role='tab'],[role='menuitem']"));
  return semanticUi || hasLatinNearby(node);
}

function processTextNode(node: Text, selected: ScreenLanguage[]) {
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP_SELECTOR)) return;
  const current = node.nodeValue || "";
  const filtered = filterText(current, selected);
  if (filtered !== current) {
    node.nodeValue = filtered;
    return;
  }
  if (shouldBlankStandalone(node, selected)) node.nodeValue = "";
}

function processElement(element: HTMLElement, selected: ScreenLanguage[]) {
  if (element.matches(SKIP_SELECTOR) || element.closest(".print-document")) return;
  for (const attr of ["placeholder", "title", "aria-label"] as const) {
    const value = element.getAttribute(attr);
    if (!value) continue;
    const filtered = filterText(value, selected);
    if (filtered !== value) element.setAttribute(attr, filtered);
  }
}

function applyIsolation(root: ParentNode = document) {
  const { selected } = screenConfig();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  textNodes.forEach((node) => processTextNode(node, selected));

  if (root instanceof HTMLElement) processElement(root, selected);
  root.querySelectorAll?.<HTMLElement>("[placeholder],[title],[aria-label]").forEach((element) => processElement(element, selected));
}

let queued = false;
function queueApply() {
  if (queued) return;
  queued = true;
  window.setTimeout(() => {
    queued = false;
    applyIsolation(document);
  }, 0);
}

const observer = new MutationObserver(queueApply);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-language-mode", "data-primary-language", "data-secondary-language"] });

document.addEventListener("DOMContentLoaded", queueApply, { once: true });
window.addEventListener("navilo:language-changed", queueApply as EventListener);
queueApply();
