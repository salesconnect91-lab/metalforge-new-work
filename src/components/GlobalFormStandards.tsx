import { useEffect } from "react";
import { toUrduName } from "@/lib/urdu";

const ACCOUNT_PREFIX = /^\s*\d{2,8}(?:\.\d+)?\s*(?:[-–—:]\s*|\s+(?=[A-Za-z\u0600-\u06FF]))/;
const ACCOUNT_SUFFIX = /\s*\(\s*\d{2,8}(?:\.\d+)?\s*\)\s*$/;

function cleanAccountLabel(text: string) {
  return text.replace(ACCOUNT_PREFIX, "").replace(ACCOUNT_SUFFIX, "").trim();
}

function looksLikeAccountOption(text: string) {
  return ACCOUNT_PREFIX.test(text) || ACCOUNT_SUFFIX.test(text);
}

function standardizeAccountDropdown(select: HTMLSelectElement) {
  const options = Array.from(select.options).filter((option) => option.value && option.textContent?.trim());
  if (!options.length) return;

  const wrapperText = (select.closest("div")?.textContent ?? "").toLowerCase();
  const identityText = `${select.name} ${select.id} ${select.getAttribute("aria-label") ?? ""} ${select.title}`.toLowerCase();
  const accountHint = /account|coa|ledger|cash|bank|revenue|expense|cost of goods|payable|receivable/.test(`${wrapperText} ${identityText}`);
  const coded = options.filter((option) => looksLikeAccountOption(option.textContent ?? ""));
  const codedMajority = coded.length >= 2 && coded.length / options.length >= 0.4;

  if (!accountHint && !codedMajority) return;

  for (const option of options) {
    const current = option.textContent ?? "";
    const cleaned = cleanAccountLabel(current);
    if (cleaned && cleaned !== current.trim()) option.textContent = cleaned;
  }
  select.dataset.naviloAccountNamesOnly = "true";
}

function findUrduInput(label: HTMLLabelElement) {
  const targetId = label.htmlFor;
  if (targetId) {
    const target = document.getElementById(targetId);
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return target;
  }
  const parent = label.parentElement;
  const sibling = parent?.nextElementSibling;
  if (sibling instanceof HTMLInputElement || sibling instanceof HTMLTextAreaElement) return sibling;
  const insideParent = parent?.parentElement?.querySelector("input[dir='rtl'],textarea[dir='rtl'],input.text-right,textarea.text-right");
  return insideParent instanceof HTMLInputElement || insideParent instanceof HTMLTextAreaElement ? insideParent : null;
}

function findEnglishInput(urduInput: HTMLInputElement | HTMLTextAreaElement) {
  const form = urduInput.closest("form");
  if (!form) return null;
  const fields = Array.from(form.querySelectorAll("input,textarea"))
    .filter((field): field is HTMLInputElement | HTMLTextAreaElement => field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement);
  const urduIndex = fields.indexOf(urduInput);
  for (let i = urduIndex - 1; i >= 0; i -= 1) {
    const field = fields[i];
    if (field.type === "hidden" || field.type === "number" || field.type === "checkbox" || field.type === "radio") continue;
    const blockText = (field.closest("div")?.textContent ?? "").toLowerCase();
    if (/english|name|title|description/.test(blockText)) return field;
  }
  return null;
}

function setNativeValue(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function standardizeAutoUrdu(root: ParentNode) {
  const buttons = root instanceof Element
    ? [root, ...Array.from(root.querySelectorAll("button"))]
    : Array.from(root.querySelectorAll("button"));

  for (const node of buttons) {
    if (!(node instanceof HTMLButtonElement)) continue;
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!text.includes("auto urdu") && !text.includes("خودکار اردو")) continue;
    node.classList.add("navilo-auto-urdu");
    if (text === "auto urdu") node.textContent = "Auto Urdu / خودکار اردو";
  }

  const labels = root instanceof Element
    ? [root, ...Array.from(root.querySelectorAll("label"))]
    : Array.from(root.querySelectorAll("label"));

  for (const node of labels) {
    if (!(node instanceof HTMLLabelElement)) continue;
    const labelText = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!/urdu name|اردو نام/i.test(labelText)) continue;

    const urduInput = findUrduInput(node);
    if (!urduInput) continue;
    const section = node.parentElement;
    if (!section || section.querySelector("button.navilo-auto-urdu")) continue;

    const englishInput = findEnglishInput(urduInput);
    if (!englishInput) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "navilo-auto-urdu";
    button.textContent = "Auto Urdu / خودکار اردو";
    button.setAttribute("aria-label", "Auto Urdu / خودکار اردو");
    button.addEventListener("click", () => {
      const translated = toUrduName(englishInput.value);
      if (translated) setNativeValue(urduInput, translated);
    });
    section.appendChild(button);
  }
}

function process(root: ParentNode) {
  const selects = root instanceof HTMLSelectElement
    ? [root]
    : Array.from(root.querySelectorAll("select"));
  selects.forEach((select) => standardizeAccountDropdown(select));
  standardizeAutoUrdu(root);
}

const STYLE = `
.navilo-auto-urdu {
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  min-height:30px!important;
  padding:5px 10px!important;
  border:1px solid #2563eb!important;
  border-radius:7px!important;
  background:#2563eb!important;
  color:#ffffff!important;
  font-size:12px!important;
  line-height:1.15!important;
  font-weight:700!important;
  white-space:nowrap!important;
  box-shadow:0 1px 2px rgba(37,99,235,.18)!important;
}
.navilo-auto-urdu:hover { background:#1d4ed8!important; color:#ffffff!important; }
.navilo-auto-urdu:focus-visible { outline:2px solid #93c5fd!important; outline-offset:2px!important; }
`;

export default function GlobalFormStandards() {
  useEffect(() => {
    const oldStyle = document.getElementById("navilo-global-form-standards");
    oldStyle?.remove();
    const style = document.createElement("style");
    style.id = "navilo-global-form-standards";
    style.textContent = STYLE;
    document.head.appendChild(style);

    process(document.body);
    let queued = false;
    const observer = new MutationObserver((mutations) => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        for (const mutation of mutations) {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) process(node);
            else if (node.parentElement) process(node.parentElement);
          });
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      style.remove();
    };
  }, []);

  return null;
}
