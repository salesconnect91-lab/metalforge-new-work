const ACCOUNT_CODE = /^\s*[A-Z]{0,4}[-/]?\d{2,10}(?:[./-]\d+)?\s*(?:[-–—:|]\s*)+/;

function stripAccountCode(value: string) {
  const cleaned = value.replace(ACCOUNT_CODE, "").trim();
  return cleaned || value.trim();
}

function looksLikeAccountHint(value: string | null | undefined) {
  const text = String(value || "").toLocaleLowerCase();
  return text.includes("account") || text.includes("اکاؤنٹ") || text.includes("ledger") || text.includes("لیجر");
}

function nearbyAccountContext(select: HTMLSelectElement) {
  if (
    looksLikeAccountHint(select.name) ||
    looksLikeAccountHint(select.id) ||
    looksLikeAccountHint(select.getAttribute("aria-label")) ||
    looksLikeAccountHint(select.getAttribute("data-field"))
  ) return true;

  let node: HTMLElement | null = select.parentElement;
  for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
    const labels = Array.from(node.querySelectorAll("label"))
      .slice(0, 6)
      .map((label) => label.textContent || "")
      .join(" ");
    if (looksLikeAccountHint(labels)) return true;
  }

  const coded = Array.from(select.options).filter((option) => ACCOUNT_CODE.test(option.textContent || ""));
  const nonEmpty = Array.from(select.options).filter((option) => option.value && (option.textContent || "").trim());
  const uuidValues = nonEmpty.filter((option) => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(option.value));
  return nonEmpty.length >= 2 && coded.length >= Math.max(2, Math.ceil(nonEmpty.length * 0.7)) && uuidValues.length >= Math.ceil(nonEmpty.length * 0.7);
}

function normalizeSelect(select: HTMLSelectElement) {
  if (!nearbyAccountContext(select)) return;
  Array.from(select.options).forEach((option) => {
    const current = option.textContent || "";
    if (!ACCOUNT_CODE.test(current)) return;
    if (!option.dataset.naviloAccountLabel) option.dataset.naviloAccountLabel = current;
    option.textContent = stripAccountCode(current);
  });
}

function normalizeAccountText(root: ParentNode = document) {
  root.querySelectorAll<HTMLSelectElement>("select").forEach(normalizeSelect);
}

function start() {
  normalizeAccountText();
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node instanceof HTMLSelectElement) normalizeSelect(node);
          normalizeAccountText(node);
        });
      }
      if (mutation.target instanceof HTMLOptionElement) {
        const select = mutation.target.closest("select");
        if (select) normalizeSelect(select);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();

export {};
