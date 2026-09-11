function isVisible(node: HTMLElement) {
  const style = window.getComputedStyle(node);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function closestPrintableDocument(button: HTMLButtonElement): HTMLElement | null {
  let node: HTMLElement | null = button.parentElement;
  while (node && node !== document.body) {
    const documents = Array.from(node.querySelectorAll<HTMLElement>(".print-document"));
    if (documents.length === 1) return documents[0];
    if (documents.length > 1) {
      const visible = documents.find(isVisible);
      if (visible) return visible;
      return documents[0];
    }
    if (node.tagName === "MAIN") break;
    node = node.parentElement;
  }
  return null;
}

function closestReport(button: HTMLButtonElement): HTMLElement | null {
  let node: HTMLElement | null = button.parentElement;
  while (node && node !== document.body) {
    const report = node.querySelector<HTMLElement>("[data-print-root],.print-report,.professional-report,#customer-order-book-report");
    if (report) return report;
    if (node.tagName === "MAIN") break;
    node = node.parentElement;
  }
  return null;
}

function ensureStableId(target: HTMLElement): string {
  if (target.id) return target.id;
  const id = `navilo-print-target-${Math.random().toString(36).slice(2, 10)}`;
  target.id = id;
  return id;
}

function markPrimaryTarget(target: HTMLElement) {
  document.querySelectorAll<HTMLElement>("[data-navilo-primary-print-target]").forEach((node) => {
    node.removeAttribute("data-navilo-primary-print-target");
  });
  target.setAttribute("data-navilo-primary-print-target", "true");
}

function preparePrintTarget(event: MouseEvent) {
  const button = (event.target as Element | null)?.closest("button");
  if (!(button instanceof HTMLButtonElement)) return;
  if (button.closest("[data-navilo-print-preview]")) return;
  if (button.hasAttribute("data-direct-print")) return;

  const label = (button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!/\bprint\b|پرنٹ/.test(label)) return;
  if (/\bprint loading worksheet\b|\bprint final gp\b|\bprint token\b/.test(label)) return;

  const explicitSelector = button.dataset.printSelector;
  const explicit = explicitSelector ? document.querySelector<HTMLElement>(explicitSelector) : null;
  const target = explicit || closestPrintableDocument(button) || closestReport(button);
  if (!target) return;

  markPrimaryTarget(target);
  button.dataset.printSelector = `#${CSS.escape(ensureStableId(target))}`;
}

// Register before React effects. This makes every normal document/report print click
// resolve to one exact source node and gives native/legacy print CSS a single target.
document.addEventListener("click", preparePrintTarget, true);
