const normalize = (value: string | null | undefined) => (value || "").toLowerCase();

function isPdfButton(button: HTMLButtonElement): boolean {
  const text = normalize(button.textContent);
  const title = normalize(button.getAttribute("title"));
  const aria = normalize(button.getAttribute("aria-label"));
  return text.includes("pdf") || title.includes("pdf") || aria.includes("pdf");
}

function isPrintButton(button: HTMLButtonElement): boolean {
  const text = normalize(button.textContent);
  const title = normalize(button.getAttribute("title"));
  const aria = normalize(button.getAttribute("aria-label"));
  return (
    text.includes("print") ||
    text.includes("پرنٹ") ||
    title.includes("print") ||
    aria.includes("print")
  ) && !isPdfButton(button);
}

function findMatchingPrintButton(pdfButton: HTMLButtonElement): HTMLButtonElement | null {
  let scope: HTMLElement | null = pdfButton.parentElement;

  for (let depth = 0; scope && depth < 5; depth += 1, scope = scope.parentElement) {
    const buttons = Array.from(scope.querySelectorAll<HTMLButtonElement>("button"));
    const printButton = buttons.find((button) => button !== pdfButton && isPrintButton(button));
    if (printButton) return printButton;
  }

  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(isPrintButton) || null;
}

/**
 * Keep every document output visually identical.
 * PDF actions are routed through the exact same printable DOM and print engine
 * used by the Print button. In the browser dialog, choosing "Save as PDF"
 * therefore produces the same layout as physical print/preview instead of a
 * separately drawn jsPDF template drifting out of sync.
 */
export function installUnifiedDocumentOutput(): () => void {
  const handler = (event: MouseEvent) => {
    const target = event.target as Element | null;
    const button = target?.closest("button") as HTMLButtonElement | null;
    if (!button || button.disabled || !isPdfButton(button)) return;

    const printButton = findMatchingPrintButton(button);
    if (!printButton || printButton.disabled) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    printButton.click();
  };

  document.addEventListener("click", handler, true);
  return () => document.removeEventListener("click", handler, true);
}
