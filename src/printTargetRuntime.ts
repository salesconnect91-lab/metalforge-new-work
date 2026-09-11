function closestPrintableDocument(button: HTMLButtonElement): HTMLElement | null {
  let node: HTMLElement | null = button.parentElement;
  while (node && node !== document.body) {
    const documents = Array.from(node.querySelectorAll<HTMLElement>(".print-document"));
    if (documents.length === 1) return documents[0];
    if (documents.length > 1) {
      const visible = documents.find((documentNode) => {
        const style = window.getComputedStyle(documentNode);
        return style.display !== "none" && style.visibility !== "hidden";
      });
      if (visible) return visible;
    }
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

function preparePrintTarget(event: MouseEvent) {
  const button = (event.target as Element | null)?.closest("button");
  if (!(button instanceof HTMLButtonElement)) return;
  if (button.closest("[data-navilo-print-preview]")) return;
  if (button.dataset.printSelector || button.hasAttribute("data-direct-print")) return;

  const label = (button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!/\bprint\b|پرنٹ/.test(label)) return;

  const target = closestPrintableDocument(button);
  if (!target) return;
  button.dataset.printSelector = `#${CSS.escape(ensureStableId(target))}`;
}

// Register before React effects so the global print controller receives a precise
// document selector instead of accidentally cloning the surrounding screen/modal.
document.addEventListener("click", preparePrintTarget, true);
