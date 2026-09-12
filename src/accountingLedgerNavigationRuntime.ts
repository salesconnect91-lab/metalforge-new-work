const EXTRA_ACCOUNTING_LEDGER_LINKS = [
  { href: "/accounting/payroll", label: "Payroll & Salary Ledger / تنخواہ لیجر" },
  { href: "/accounting/loans", label: "Loan & Lender Ledger / قرض خواہ لیجر" },
];

function ensureAccountingLedgerLinks() {
  const generalLedger = document.querySelector<HTMLAnchorElement>('a[href="/accounting/ledgers"]');
  if (!generalLedger?.parentElement) return;

  let insertAfter: Element = generalLedger;
  for (const item of EXTRA_ACCOUNTING_LEDGER_LINKS) {
    let link = document.querySelector<HTMLAnchorElement>(`a[data-navilo-extra-ledger="${item.href}"]`);
    if (!link) {
      link = document.createElement("a");
      link.href = item.href;
      link.dataset.naviloExtraLedger = item.href;
      link.className = generalLedger.className;
      link.textContent = item.label;
      link.addEventListener("click", () => {
        document.querySelectorAll<HTMLAnchorElement>("a[data-navilo-extra-ledger]").forEach((node) => {
          node.className = generalLedger.className;
        });
      });
      insertAfter.insertAdjacentElement("afterend", link);
    }
    insertAfter = link;
  }
}

function updateActiveExtraLedgerLink() {
  document.querySelectorAll<HTMLAnchorElement>("a[data-navilo-extra-ledger]").forEach((link) => {
    const base = document.querySelector<HTMLAnchorElement>('a[href="/accounting/ledgers"]');
    if (!base) return;
    const baseClass = base.className
      .replace(/bg-blue-600/g, "")
      .replace(/text-white/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const active = window.location.pathname === link.dataset.naviloExtraLedger;
    link.className = active ? `${baseClass} bg-blue-600 text-white` : baseClass;
  });
}

function refreshAccountingLedgerNavigation() {
  ensureAccountingLedgerLinks();
  updateActiveExtraLedgerLink();
}

if (typeof window !== "undefined") {
  const start = () => {
    refreshAccountingLedgerNavigation();
    const observer = new MutationObserver(refreshAccountingLedgerNavigation);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", refreshAccountingLedgerNavigation);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
