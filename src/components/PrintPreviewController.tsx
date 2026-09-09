import { useEffect, useMemo, useState } from "react";

type PreviewPayload = { html: string; title: string };
type PreviewEventDetail = { html?: string; title?: string; selector?: string };

function getPrintableTarget(selector?: string) {
  if (selector) {
    const selected = document.querySelector<HTMLElement>(selector);
    if (selected) return selected;
  }

  return (
    document.querySelector<HTMLElement>("#printable-invoice-area") ||
    document.querySelector<HTMLElement>(".print-document") ||
    document.querySelector<HTMLElement>("[data-print-root]") ||
    document.querySelector<HTMLElement>(".print-report") ||
    document.querySelector<HTMLElement>("main")
  );
}

function cleanClone(target: HTMLElement) {
  const clone = target.cloneNode(true) as HTMLElement;

  clone
    .querySelectorAll("button,.no-print,.print\\:hidden,[data-no-print],nav,aside")
    .forEach((node) => node.remove());

  clone.querySelectorAll("input,select,textarea").forEach((node) => {
    const field = node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const value = document.createElement("span");
    value.textContent = field.value || "—";
    value.style.whiteSpace = "pre-wrap";
    node.replaceWith(value);
  });

  Object.assign(clone.style, {
    display: "block",
    visibility: "visible",
    width: "100%",
    maxWidth: "100%",
  });

  return clone.outerHTML;
}

function collectStyles() {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("\n");
}

const FRAME_CSS = `
html,body{background:#fff!important;color:#111827!important;margin:0!important;padding:0!important;width:100%!important}
*,*::before,*::after{box-sizing:border-box!important}
button,.no-print,[data-no-print],nav,aside{display:none!important}
img,svg{max-width:100%!important}
`;

export default function PrintPreviewController() {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const styleMarkup = useMemo(() => collectStyles(), [preview]);

  useEffect(() => {
    const nativePrint = window.print;

    const showTargetPreview = (target: HTMLElement, title?: string) => {
      setPreview({
        html: cleanClone(target),
        title: title || document.title || "NAVILO",
      });
    };

    const openPreview = () => {
      const target = getPrintableTarget();
      if (!target) {
        nativePrint.call(window);
        return;
      }
      showTargetPreview(target);
    };

    const onPreviewEvent = (event: Event) => {
      const detail = (event as CustomEvent<PreviewEventDetail>).detail || {};
      if (detail.html) {
        setPreview({
          html: detail.html,
          title: detail.title || document.title || "NAVILO",
        });
        return;
      }

      const target = getPrintableTarget(detail.selector);
      if (target) showTargetPreview(target, detail.title);
    };

    const onPrintClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest("button");
      if (!(button instanceof HTMLButtonElement)) return;
      if (button.closest("[data-navilo-print-preview]")) return;
      if (button.hasAttribute("data-direct-print")) return;

      const label = (button.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

      if (!/\bprint\b|پرنٹ/.test(label)) return;

      const target = getPrintableTarget(button.dataset.printSelector);
      if (!target) return;

      event.preventDefault();
      event.stopPropagation();
      showTargetPreview(target);
    };

    window.addEventListener("navilo:print-preview", onPreviewEvent as EventListener);
    document.addEventListener("click", onPrintClick, true);
    const timer = window.setTimeout(() => {
      window.print = openPreview;
    }, 0);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("navilo:print-preview", onPreviewEvent as EventListener);
      document.removeEventListener("click", onPrintClick, true);
      if (window.print === openPreview) window.print = nativePrint;
    };
  }, []);

  const printNow = () => {
    if (!preview) return;

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    Object.assign(frame.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "0",
      height: "0",
      border: "0",
    });
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      return;
    }

    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${document.baseURI}"><title>${preview.title}</title>${styleMarkup}<style>${FRAME_CSS}</style></head><body><div class="navilo-print-output">${preview.html}</div></body></html>`,
    );
    doc.close();

    const executePrint = async () => {
      try {
        await Promise.all(
          Array.from(doc.images).map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  const done = () => resolve();
                  img.addEventListener("load", done, { once: true });
                  img.addEventListener("error", done, { once: true });
                }),
          ),
        );
        if (doc.fonts?.ready) await doc.fonts.ready;
      } catch {
        // Printing remains available if a non-critical asset cannot be loaded.
      }

      await new Promise((resolve) => window.setTimeout(resolve, 150));
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1800);
    };

    if (doc.readyState === "complete") void executePrint();
    else frame.onload = () => void executePrint();
  };

  if (!preview) return null;

  return (
    <div
      className="fixed inset-0 z-[100000] flex flex-col bg-slate-950/80 p-3 backdrop-blur-sm md:p-5"
      data-no-bilingual
      data-navilo-print-preview
    >
      <div className="mx-auto mb-2 flex w-full max-w-6xl items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-xl">
        <div>
          <div className="text-sm font-extrabold text-slate-900">
            A4 Print Preview / اے فور پرنٹ پیش منظر
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            NAVILO document standard · A4 · 10mm margins · same layout for preview, print and PDF
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setPreview(null)}>
            Close / بند کریں
          </button>
          <button type="button" className="btn-primary" onClick={printNow}>
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl flex-1 overflow-auto rounded-lg bg-slate-300 p-3 shadow-xl md:p-5">
        <div
          className="mx-auto bg-white shadow-lg"
          style={{
            width: "210mm",
            minHeight: "297mm",
            padding: "10mm",
            display: "block",
            visibility: "visible",
          }}
        >
          <div className="navilo-live-preview" dangerouslySetInnerHTML={{ __html: preview.html }} />
        </div>
      </div>
    </div>
  );
}
