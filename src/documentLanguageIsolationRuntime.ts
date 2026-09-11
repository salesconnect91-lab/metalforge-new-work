type DocumentLanguage = "en" | "ur" | "ar";

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-z]/;
const URDU_SPECIFIC = /[ٹڈڑںھہےۓژگچپ]/;
const originals = new WeakMap<Text, string>();

function config() {
  const root = document.documentElement;
  const mode = root.dataset.documentLanguageMode === "bilingual" ? "bilingual" : "single";
  const primary = (root.dataset.documentPrimaryLanguage || "en") as DocumentLanguage;
  const secondary = (root.dataset.documentSecondaryLanguage || "") as DocumentLanguage | "";
  const selected = mode === "bilingual" && secondary && secondary !== primary ? [primary, secondary] : [primary];
  return { selected };
}

function kind(text: string): DocumentLanguage | "mixed" | "neutral" {
  const arabic = ARABIC_SCRIPT.test(text);
  const latin = LATIN.test(text);
  if (arabic && latin) return "mixed";
  if (latin) return "en";
  if (!arabic) return "neutral";
  return URDU_SPECIFIC.test(text) ? "ur" : "ar";
}

function split(value: string) {
  return value.split(/\s*\/\s*|\s*[|•·]\s*|\n+/).map((part) => part.trim()).filter(Boolean);
}

function keep(segment: string, selected: DocumentLanguage[]) {
  const k = kind(segment);
  if (k === "neutral" || k === "mixed") return true;
  if (k === "en") return selected.includes("en");
  if (k === "ur") return selected.includes("ur");
  if (k === "ar") return selected.includes("ar") || selected.includes("ur");
  return true;
}

function hasSiblingScript(node: Text, want: "latin" | "arabic") {
  const parent = node.parentElement;
  if (!parent) return false;
  const siblings = Array.from(parent.childNodes).filter((candidate) => candidate !== node);
  const text = siblings.map((candidate) => candidate.textContent || "").join(" ");
  return want === "latin" ? LATIN.test(text) : ARABIC_SCRIPT.test(text);
}

function transform(original: string, node: Text, selected: DocumentLanguage[]) {
  const trimmed = original.trim();
  if (!trimmed) return original;
  const segments = split(trimmed);
  if (segments.length > 1) {
    const kept = segments.filter((segment) => keep(segment, selected));
    if (kept.length && kept.length !== segments.length) return kept.join(" / ");
  }

  if (selected.length === 1 && selected[0] === "en" && ARABIC_SCRIPT.test(trimmed) && !LATIN.test(trimmed) && hasSiblingScript(node, "latin")) return "";
  if (selected.length === 1 && (selected[0] === "ur" || selected[0] === "ar") && LATIN.test(trimmed) && !ARABIC_SCRIPT.test(trimmed) && hasSiblingScript(node, "arabic")) return "";

  return original;
}

function applyDocumentLanguage() {
  const { selected } = config();
  document.querySelectorAll<HTMLElement>(".print-document").forEach((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    nodes.forEach((node) => {
      if (!originals.has(node)) originals.set(node, node.nodeValue || "");
      const original = originals.get(node) || "";
      const next = transform(original, node, selected);
      if (node.nodeValue !== next) node.nodeValue = next;
    });
  });
}

let queued = false;
function queueApply() {
  if (queued) return;
  queued = true;
  window.setTimeout(() => {
    queued = false;
    applyDocumentLanguage();
  }, 0);
}

const observer = new MutationObserver(queueApply);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["data-document-language-mode", "data-document-primary-language", "data-document-secondary-language"],
});

document.addEventListener("DOMContentLoaded", queueApply, { once: true });
window.addEventListener("navilo:language-changed", queueApply as EventListener);
queueApply();
