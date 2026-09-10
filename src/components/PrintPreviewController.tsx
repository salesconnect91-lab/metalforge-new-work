import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import GlobalPrintButton from "@/components/GlobalPrintButton";

type PrintOrientation = "portrait" | "landscape";
type PreviewPayload = { html: string; title: string; orientation: PrintOrientation };
type PreviewEventDetail = { html?: string; title?: string; selector?: string; orientation?: PrintOrientation };

type PrintContext = {
  companyName: string;
  businessUnitName: string;
};

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

function getButtonPrintableTarget(button: HTMLButtonElement) {
  if (button.dataset.printSelector) {
    const selected = document.querySelector<HTMLElement>(button.dataset.printSelector);
    if (selected) return selected;
  }

  let node: HTMLElement | null = button.parentElement;
  while (node && node.tagName !== "MAIN") {
    const hasReportContent = Boolean(
      node.querySelector("table,.data-table,.print-report,.professional-report,[data-print-root]"),
    );
    const hasHeading = Boolean(node.querySelector(".page-header,.page-title,h1,h2"));
    if (hasReportContent && hasHeading) return node;
    node = node.parentElement;
  }

  return getPrintableTarget();
}

function textOf(root: HTMLElement, selector: string) {
  return root.querySelector<HTMLElement>(selector)?.textContent?.replace(/\s+/g, " ").trim() || "";
}

function createTextElement(tag: string, className: string, text: string) {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

function detectOrientation(root: HTMLElement): PrintOrientation {
  const tables = Array.from(root.querySelectorAll("table"));
  const widest = tables.reduce((max, table) => {
    const count = table.querySelectorAll("thead tr:first-child th").length || table.querySelectorAll("tr:first-child > *").length;
    return Math.max(max, count);
  }, 0);
  return widest >= 8 ? "landscape" : "portrait";
}

function decorateGenericReport(clone: HTMLElement, context: PrintContext) {
  clone.classList.add("professional-report", "navilo-generic-report");
  clone.setAttribute("data-navilo-generic-print", "true");

  const reportTitle =
    textOf(clone, ".page-title") ||
    textOf(clone, "h1") ||
    textOf(clone, "h2") ||
    "ERP Report / ای آر پی رپورٹ";

  const subtitle = textOf(clone, ".page-subtitle");
  const printedAt = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const header = document.createElement("section");
  header.className = "navilo-report-brand-header";

  const brand = document.createElement("div");
  brand.className = "navilo-report-brand";
  const logo = document.createElement("img");
  logo.src = "/navilo-logo.svg";
  logo.alt = "NAVILO";
  logo.className = "navilo-report-logo";
  brand.appendChild(logo);
  brand.appendChild(createTextElement("div", "navilo-report-tagline", "Run Your Business as One."));

  const company = document.createElement("div");
  company.className = "navilo-report-company";
  company.appendChild(createTextElement("div", "navilo-report-company-name", context.companyName || "NAVILO ERP"));
  if (context.businessUnitName) {
    company.appendChild(createTextElement("div", "navilo-report-company-unit", context.businessUnitName));
  }
  company.appendChild(createTextElement("div", "navilo-report-company-note", "Professional ERP Report / پیشہ ورانہ ای آر پی رپورٹ"));

  const meta = document.createElement("div");
  meta.className = "navilo-report-meta";
  meta.appendChild(createTextElement("div", "navilo-report-meta-title", reportTitle));
  if (subtitle && subtitle !== reportTitle) meta.appendChild(createTextElement("div", "navilo-report-meta-subtitle", subtitle));
  meta.appendChild(createTextElement("div", "navilo-report-meta-date", `Report Date: ${printedAt}`));

  header.append(brand, company, meta);
  clone.prepend(header);

  const footer = document.createElement("footer");
  footer.className = "navilo-report-footer";

  const signatures = document.createElement("div");
  signatures.className = "navilo-report-signatures";
  const prepared = document.createElement("div");
  prepared.className = "navilo-report-signature";
  prepared.appendChild(document.createElement("span"));
  prepared.appendChild(createTextElement("strong", "", "Prepared By / تیار کردہ"));
  const center = document.createElement("div");
  center.className = "navilo-report-footer-brand";
  center.appendChild(createTextElement("strong", "", "NAVILO"));
  center.appendChild(createTextElement("small", "", "Run Your Business as One."));
  const authorized = document.createElement("div");
  authorized.className = "navilo-report-signature";
  authorized.appendChild(document.createElement("span"));
  authorized.appendChild(createTextElement("strong", "", "Authorized By / مجاز دستخط"));
  signatures.append(prepared, center, authorized);

  const bottom = document.createElement("div");
  bottom.className = "navilo-report-footer-bottom";
  bottom.appendChild(createTextElement("span", "", "Accurate Data  |  Better Decisions  |  Stronger Business"));
  bottom.appendChild(createTextElement("span", "navilo-page-number", "NAVILO ERP"));
  footer.append(signatures, bottom);
  clone.appendChild(footer);
}

function cleanClone(target: HTMLElement, context: PrintContext) {
  const clone = target.cloneNode(true) as HTMLElement;

  clone
    .querySelectorAll("button,.no-print,.print\\:hidden,[data-no-print],nav,aside")
    .forEach((node) => node.remove());

  clone.querySelectorAll("input,select,textarea").forEach((node) => {
    const field = node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const value = document.createElement("span");
    value.textContent = field.value || "—";
    value.className = "navilo-print-field-value";
    node.replaceWith(value);
  });

  const isDocument = clone.classList.contains("print-document") || Boolean(clone.querySelector(".print-document"));
  if (!isDocument) decorateGenericReport(clone, context);

  Object.assign(clone.style, {
    display: "block",
    visibility: "visible",
    width: "100%",
    maxWidth: "100%",
  });

  return {
    html: clone.outerHTML,
    orientation: isDocument ? ("portrait" as const) : detectOrientation(clone),
  };
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
  const { activeCompany, activeBusinessUnit } = useAuth();
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const styleMarkup = useMemo(() => collectStyles(), [preview]);

  const context: PrintContext = {
    companyName: activeCompany?.company_name || "NAVILO ERP",
    businessUnitName: activeBusinessUnit?.business_unit_name || "",
  };

  useEffect(() => {
    const nativePrint = window.print;

    const showTargetPreview = (target: HTMLElement, title?: string, forcedOrientation?: PrintOrientation) => {
      const cleaned = cleanClone(target, context);
      setPreview({
        html: cleaned.html,
        title: title || document.title || "NAVILO",
        orientation: forcedOrientation || cleaned.orientation,
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
          orientation: detail.orientation || "portrait",
        });
        return;
      }

      const target = getPrintableTarget(detail.selector);
      if (target) showTargetPreview(target, detail.title, detail.orientation);
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

      if (/\bprint loading worksheet\b|\bprint final gp\b|\bprint token\b/.test(label)) return;
      if (!/\bprint\b|پرنٹ/.test(label)) return;

      const target = getButtonPrintableTarget(button);
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
  }, [context.companyName, context.businessUnitName]);

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

    const pageRule = preview.orientation === "landscape"
      ? "@page{size:A4 landscape;margin:10mm}"
      : "@page{size:A4 portrait;margin:10mm}";

    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${document.baseURI}"><title>${preview.title}</title>${styleMarkup}<style>${FRAME_CSS}${pageRule}</style></head><body><div class="navilo-print-output navilo-${preview.orientation}">${preview.html}</div></body></html>`,
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
      }

      await new Promise((resolve) => window.setTimeout(resolve, 150));
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1800);
    };

    if (doc.readyState === "complete") void executePrint();
    else frame.onload = () => void executePrint();
  };

  if (!preview) return <GlobalPrintButton />;

  const previewWidth = preview.orientation === "landscape" ? "297mm" : "210mm";
  const previewMinHeight = preview.orientation === "landscape" ? "210mm" : "297mm";

  return (
    <div
      className="fixed inset-0 z-[100000] flex flex-col bg-slate-950/80 p-3 backdrop-blur-sm md:p-5"
      data-no-bilingual
      data-navilo-print-preview
    >
      <div className="mx-auto mb-2 flex w-full max-w-7xl items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xl">
        <div>
          <div className="text-sm font-extrabold text-slate-900">
            Professional Print Preview / پروفیشنل پرنٹ پیش منظر
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            NAVILO standard · A4 {preview.orientation} · same layout for preview, printer and Save as PDF
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

      <div className="mx-auto w-full max-w-7xl flex-1 overflow-auto rounded-xl bg-slate-300 p-3 shadow-xl md:p-5">
        <div
          className="mx-auto bg-white shadow-lg"
          style={{
            width: previewWidth,
            minHeight: previewMinHeight,
            padding: "10mm",
            display: "block",
            visibility: "visible",
          }}
        >
          <div className={`navilo-live-preview navilo-${preview.orientation}`} dangerouslySetInnerHTML={{ __html: preview.html }} />
        </div>
      </div>
    </div>
  );
}
