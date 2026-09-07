import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { calculateConfiguredChargeAmount, chargeQuantityForUnit, type ConfiguredChargeUnit } from "@/lib/chargeCalculation";

type DiscountMode = "fixed" | "percent";
type DiscountContext = {
  type: "sales_main" | "sales_consolidated" | "purchase_main" | "purchase_consolidated";
  label: string;
  urdu: string;
};
type ChargeMasterRow = {
  charge_key: string;
  charge_name: string;
  default_rate: number | string;
  unit: ConfiguredChargeUnit;
  is_fixed: boolean;
  applies_to: string;
  is_active: boolean;
  tax_applicable: boolean;
  revenue_account_id: string | null;
  cost_account_id: string | null;
  charge_type: string;
};
type ItemRow = { id: string; unit?: string | null };
type AccountRow = { id: string; code?: string | null; name: string };
type Branding = { companyName: string; logoUrl: string | null };

const money = (value: number) =>
  `Rs ${Number(value || 0).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const parseMoney = (text: string) => {
  const match = text.match(/Rs\s*([\d,]+(?:\.\d+)?)/i);
  return match ? Number(match[1].replace(/,/g, "")) || 0 : 0;
};

function contextFor(pathname: string): DiscountContext | null {
  if (pathname === "/sales/new" || /^\/sales\/[^/]+\/edit$/.test(pathname))
    return { type: "sales_main", label: "Discount Allowed", urdu: "رعایت دی گئی" };
  if (pathname === "/sales/consolidated")
    return { type: "sales_consolidated", label: "Discount Allowed", urdu: "رعایت دی گئی" };
  if (pathname === "/purchase/new")
    return { type: "purchase_main", label: "Discount Received", urdu: "رعایت موصول" };
  if (pathname === "/purchase/consolidated")
    return { type: "purchase_consolidated", label: "Discount Received", urdu: "رعایت موصول" };
  return null;
}

function findChargeSection(root: ParentNode = document): HTMLElement | null {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>("div"));
  const title = nodes.find((el) => (el.textContent || "").trim().startsWith("Applicable Charges /"));
  return (title?.closest("section") as HTMLElement | null) ?? null;
}

function findTransactionRoot(ctx: DiscountContext): HTMLElement | null {
  const visibleForms = Array.from(document.querySelectorAll<HTMLFormElement>("form")).filter((form) => form.offsetParent !== null);
  if (ctx.type === "sales_main") return visibleForms.find((form) => form.textContent?.includes("Invoice Items")) ?? visibleForms[0] ?? null;
  if (ctx.type === "sales_consolidated") {
    const section = findChargeSection();
    return (section?.parentElement as HTMLElement | null) ?? null;
  }
  if (ctx.type === "purchase_main") return visibleForms.find((form) => form.textContent?.includes("Direct Main Invoice Items")) ?? visibleForms[0] ?? document.querySelector<HTMLElement>("main");
  return visibleForms.find((form) => form.textContent?.includes("Consolidated Purchase Invoice")) ?? document.querySelector<HTMLElement>("main");
}

function findDocumentNo(root: HTMLElement | null): string {
  if (!root) return "";
  const labels = Array.from(root.querySelectorAll("label"));
  for (const label of labels) {
    const text = (label.textContent || "").trim().toLowerCase();
    if (!text.includes("invoice no") && !text.includes("dispatch no")) continue;
    const input = label.parentElement?.querySelector("input") as HTMLInputElement | null;
    if (input?.value?.trim()) return input.value.trim();
  }
  const candidates = Array.from(root.querySelectorAll("input[readonly],input:disabled")) as HTMLInputElement[];
  return candidates.map((input) => input.value.trim()).find((value) => /^(CSH|TAX|INV|HWL|CP|PUR|PI)-/i.test(value)) || "";
}

function findGrossTotal(root: HTMLElement | null): number {
  if (!root) return 0;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>("div,span,p,strong"));
  const priority = ["grand total", "net total", "invoice total", "کل رقم"];
  for (const needle of priority) {
    for (const node of nodes) {
      if (node.closest("[data-navilo-discount-panel]")) continue;
      const text = (node.textContent || "").trim().toLowerCase();
      if (!text.includes(needle)) continue;
      let current: HTMLElement | null = node;
      for (let depth = 0; depth < 3 && current; depth += 1, current = current.parentElement) {
        const amount = parseMoney(current.textContent || "");
        if (amount > 0) return amount;
      }
    }
  }
  const values = nodes
    .filter((node) => !node.closest("[data-navilo-discount-panel]") && /^\s*Rs\s*[\d,]+/i.test(node.textContent || ""))
    .map((node) => parseMoney(node.textContent || ""))
    .filter((value) => value > 0);
  return values.length ? values[values.length - 1] : 0;
}

function ensureSlot(root: HTMLElement, ctx: DiscountContext): HTMLElement {
  let slot = root.querySelector<HTMLElement>(`[data-navilo-commercial-slot="${ctx.type}"]`);
  if (slot) return slot;
  slot = document.createElement("div");
  slot.setAttribute("data-navilo-commercial-slot", ctx.type);
  const chargeSection = findChargeSection(root);
  if (chargeSection?.parentElement) chargeSection.insertAdjacentElement("afterend", slot);
  else root.appendChild(slot);
  return slot;
}

function setReactInput(input: HTMLInputElement, value: string) {
  if (input.value === value) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function applyBranding(branding: Branding) {
  const areas = Array.from(document.querySelectorAll<HTMLElement>("#printable-invoice-area,.print-document,.print-report,[data-print-root]"));
  for (const area of areas) {
    const nodes = Array.from(area.querySelectorAll<HTMLElement>("div,span,p,h1,h2,h3"));
    for (const node of nodes) {
      const text = (node.textContent || "").trim();
      if (node.children.length > 0) continue;
      if (text === "MetalForge Steel Industries" || text === "Steel Mill ERP") node.textContent = branding.companyName;
      if (text === "MetalForge OS · Sales & Accounts") node.textContent = "NAVILO ERP · Sales & Accounts";
      if (text === "MetalForge OS") node.textContent = "NAVILO ERP";
    }

    if (branding.logoUrl && area.id === "printable-invoice-area") {
      const header = area.firstElementChild as HTMLElement | null;
      const left = header?.firstElementChild as HTMLElement | null;
      if (left && !left.querySelector("[data-navilo-company-logo]")) {
        const img = document.createElement("img");
        img.src = branding.logoUrl;
        img.alt = `${branding.companyName} Logo`;
        img.setAttribute("data-navilo-company-logo", "true");
        img.style.maxWidth = "150px";
        img.style.maxHeight = "58px";
        img.style.objectFit = "contain";
        img.style.display = "block";
        img.style.marginBottom = "6px";
        left.insertBefore(img, left.firstChild);
      }
    }
  }
}

function accountLabel(accounts: AccountRow[], id: string | null) {
  const account = accounts.find((row) => row.id === id);
  if (!account) return "Not mapped";
  return account.name;
}

function collectConsolidatedRows(root: HTMLElement, items: ItemRow[]) {
  const itemIds = new Set(items.map((item) => item.id));
  const rows: Array<{ item_id: string; qty: string }> = [];
  let baseAmount = 0;
  root.querySelectorAll("tr").forEach((tr) => {
    const selects = Array.from(tr.querySelectorAll("select")) as HTMLSelectElement[];
    const itemSelect = selects.find((select) => itemIds.has(select.value));
    if (!itemSelect) return;
    const numbers = Array.from(tr.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    if (numbers.length < 2) return;
    const qty = Math.max(0, Number(numbers[0].value) || 0);
    const rate = Math.max(0, Number(numbers[1].value) || 0);
    rows.push({ item_id: itemSelect.value, qty: String(qty) });
    baseAmount += qty * rate;
  });
  return { rows, baseAmount };
}

function findChargeCard(section: HTMLElement, chargeName: string): HTMLElement | null {
  const nameNode = Array.from(section.querySelectorAll<HTMLElement>("div,span,strong")).find(
    (node) => node.children.length === 0 && (node.textContent || "").trim() === chargeName,
  );
  if (!nameNode) return null;
  let card: HTMLElement | null = nameNode.parentElement;
  for (let depth = 0; depth < 6 && card; depth += 1) {
    if (card.querySelector('input[type="number"]')) return card;
    card = card.parentElement;
  }
  return null;
}

function renderConsolidatedChargeParity(
  root: HTMLElement,
  masters: ChargeMasterRow[],
  items: ItemRow[],
  accounts: AccountRow[],
) {
  const section = findChargeSection(root);
  if (!section) return;
  const { rows, baseAmount } = collectConsolidatedRows(root, items);

  for (const master of masters) {
    const card = findChargeCard(section, master.charge_name);
    if (!card) continue;
    const nativeInputs = Array.from(card.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    if (!nativeInputs.length) continue;
    const amountInput = nativeInputs[0];
    const taxInput = nativeInputs[1] ?? null;
    const quantity = chargeQuantityForUnit(master.unit, rows, items, baseAmount);
    const fixedAmount = calculateConfiguredChargeAmount({
      unit: master.unit,
      rate: Number(master.default_rate) || 0,
      rows,
      items,
      baseAmount,
    });

    if (master.is_fixed) setReactInput(amountInput, String(fixedAmount));

    const nativeGrid = amountInput.parentElement?.parentElement as HTMLElement | null;
    if (nativeGrid && nativeGrid !== card) nativeGrid.style.display = "none";

    let parity = card.querySelector<HTMLElement>("[data-navilo-charge-parity]");
    if (!parity) {
      parity = document.createElement("div");
      parity.setAttribute("data-navilo-charge-parity", master.charge_key);
      parity.className = "mt-2";
      card.appendChild(parity);
    }

    const amount = master.is_fixed ? fixedAmount : Math.max(0, Number(amountInput.value) || 0);
    const taxPercent = Math.max(0, Number(taxInput?.value) || 0);
    const taxAmount = (amount * taxPercent) / 100;
    const derivedRate = master.is_fixed
      ? Math.max(0, Number(master.default_rate) || 0)
      : Number(parity.dataset.rate || (quantity > 0 ? amount / quantity : Number(master.default_rate) || 0));

    parity.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
        <div><label class="label">Qty / مقدار</label><input data-navilo-charge-qty class="input text-right" type="number" step="0.001" value="${Number(quantity.toFixed(3))}" readonly /></div>
        <div><label class="label">Rate / ریٹ</label><input data-navilo-charge-rate class="input text-right" type="number" step="0.01" value="${Number(derivedRate.toFixed(4))}" ${master.is_fixed ? "disabled" : ""} /></div>
        <div><label class="label">Amount / رقم</label><input data-navilo-charge-amount class="input text-right" type="number" step="0.01" value="${Number(amount.toFixed(2))}" ${master.is_fixed ? "readonly" : ""} /></div>
        ${master.tax_applicable ? `<div><label class="label">Tax % / ٹیکس</label><input data-navilo-charge-tax class="input text-right" type="number" step="0.01" value="${Number(taxPercent.toFixed(2))}" readonly /></div>` : ""}
      </div>
      <div style="margin-top:8px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:12px">
        <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:5px"><span style="color:#64748b">Recovery / Revenue Account / وصولی یا ریونیو اکاؤنٹ</span><strong style="color:#475569;text-align:right">${accountLabel(accounts, master.revenue_account_id)}</strong></div>
        <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:5px"><span style="color:#64748b">Cost Account / لاگت اکاؤنٹ</span><strong style="color:#475569;text-align:right">${accountLabel(accounts, master.cost_account_id)}</strong></div>
        <div style="display:flex;justify-content:space-between;gap:12px;border-top:1px solid #e2e8f0;padding-top:6px"><span style="color:#64748b">Total / کل</span><strong style="color:#334155">${money(amount + taxAmount)}</strong></div>
      </div>`;

    const rateInput = parity.querySelector<HTMLInputElement>("[data-navilo-charge-rate]");
    const customAmount = parity.querySelector<HTMLInputElement>("[data-navilo-charge-amount]");
    if (rateInput && !master.is_fixed) {
      rateInput.onchange = () => {
        const rate = Math.max(0, Number(rateInput.value) || 0);
        parity!.dataset.rate = String(rate);
        const nextAmount = master.unit === "percent" ? (quantity * rate) / 100 : quantity * rate;
        setReactInput(amountInput, String(Number(nextAmount.toFixed(2))));
      };
    }
    if (customAmount && !master.is_fixed) {
      customAmount.onchange = () => {
        const nextAmount = Math.max(0, Number(customAmount.value) || 0);
        setReactInput(amountInput, String(nextAmount));
        if (quantity > 0) {
          const rate = master.unit === "percent" ? (nextAmount * 100) / quantity : nextAmount / quantity;
          parity!.dataset.rate = String(rate);
        }
      };
    }
  }
}

export default function InvoiceCommercialControls() {
  const { pathname } = useLocation();
  const ctx = useMemo(() => contextFor(pathname), [pathname]);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [documentNo, setDocumentNo] = useState("");
  const [gross, setGross] = useState(0);
  const [mode, setMode] = useState<DiscountMode>("fixed");
  const [value, setValue] = useState("0");
  const [storedAmount, setStoredAmount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [branding, setBranding] = useState<Branding>({ companyName: "NAVILO ERP", logoUrl: null });
  const loadedKey = useRef("");

  useEffect(() => {
    let active = true;
    void supabase
      .from("company_settings")
      .select("company_name,logo_url")
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        setBranding({
          companyName: String(data.company_name || "NAVILO ERP"),
          logoUrl: data.logo_url ? String(data.logo_url) : null,
        });
      });
    return () => { active = false; };
  }, [pathname]);

  useEffect(() => {
    const timer = window.setInterval(() => applyBranding(branding), 350);
    applyBranding(branding);
    return () => window.clearInterval(timer);
  }, [branding, pathname]);

  useEffect(() => {
    if (ctx) return;
    const pending = sessionStorage.getItem("navilo-pending-sales-main-discount");
    if (!pending || !/^\/sales\/[^/]+$/.test(pathname)) return;
    const id = pathname.split("/")[2];
    void (async () => {
      try {
        const parsed = JSON.parse(pending);
        const { data, error } = await supabase.from("sales_orders").select("order_no,status").eq("id", id).maybeSingle();
        if (error || !data?.order_no || data.status !== "draft") return;
        const { error: rpcError } = await supabase.rpc("upsert_commercial_invoice_discount", {
          p_document_type: "sales_main",
          p_document_no: data.order_no,
          p_mode: parsed.mode,
          p_value: Number(parsed.value) || 0,
          p_amount: Number(parsed.amount) || 0,
        });
        if (!rpcError) sessionStorage.removeItem("navilo-pending-sales-main-discount");
      } catch {
        // Ignore malformed pending state.
      }
    })();
  }, [ctx, pathname]);

  useEffect(() => {
    setSlot(null);
    setDocumentNo("");
    setGross(0);
    setMessage("");
    loadedKey.current = "";
    if (!ctx) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const root = findTransactionRoot(ctx);
      if (root) {
        setSlot(ensureSlot(root, ctx));
        setDocumentNo(findDocumentNo(root));
        setGross(findGrossTotal(root));
      } else if (ctx.type === "sales_consolidated") {
        setSlot(null);
        setDocumentNo("");
        setGross(0);
      }
      if (attempts > 120) window.clearInterval(timer);
    }, 350);
    return () => {
      window.clearInterval(timer);
    };
  }, [ctx]);

  useEffect(() => {
    if (!ctx || !slot) return;
    const timer = window.setInterval(() => {
      const root = findTransactionRoot(ctx);
      if (!root) {
        if (ctx.type === "sales_consolidated") setSlot(null);
        return;
      }
      setDocumentNo(findDocumentNo(root));
      setGross(findGrossTotal(root));
    }, 700);
    return () => window.clearInterval(timer);
  }, [ctx, slot]);

  useEffect(() => {
    if (!ctx || !documentNo || documentNo.endsWith("-AUTO")) return;
    const key = `${ctx.type}:${documentNo}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    void (async () => {
      const { data } = await supabase
        .from("commercial_invoice_discounts")
        .select("discount_mode,discount_value,discount_amount")
        .eq("document_type", ctx.type)
        .eq("document_no", documentNo)
        .maybeSingle();
      if (data) {
        setMode(data.discount_mode as DiscountMode);
        setValue(String(Number(data.discount_value) || 0));
        setStoredAmount(Number(data.discount_amount) || 0);
      } else {
        setMode("fixed");
        setValue("0");
        setStoredAmount(0);
      }
      setDirty(false);
    })();
  }, [ctx, documentNo]);

  const numericValue = Math.max(0, Number(value) || 0);
  const calculated = mode === "percent"
    ? (gross > 0 ? Math.min(gross, (gross * Math.min(numericValue, 100)) / 100) : storedAmount)
    : (gross > 0 ? Math.min(gross, numericValue) : numericValue);
  const net = Math.max(0, gross - calculated);

  useEffect(() => {
    if (!ctx || !dirty) return;
    const timer = window.setTimeout(() => {
      const amount = Number(calculated.toFixed(2));
      if (ctx.type === "sales_main" && documentNo.endsWith("-AUTO")) {
        sessionStorage.setItem("navilo-pending-sales-main-discount", JSON.stringify({ mode, value: numericValue, amount }));
        setStoredAmount(amount);
        setDirty(false);
        setMessage("Discount ready; it will attach to the generated invoice number on Save.");
        return;
      }
      if (!documentNo) return;
      setSaving(true);
      void supabase
        .rpc("upsert_commercial_invoice_discount", {
          p_document_type: ctx.type,
          p_document_no: documentNo,
          p_mode: mode,
          p_value: numericValue,
          p_amount: amount,
        })
        .then(({ error }) => {
          setSaving(false);
          if (error) {
            setMessage(error.message);
            return;
          }
          setStoredAmount(amount);
          setDirty(false);
          setMessage(amount > 0 ? "Discount saved with accounting control." : "Discount removed.");
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [ctx, dirty, documentNo, mode, numericValue, calculated]);

  useEffect(() => {
    if (pathname !== "/sales/consolidated") return;
    let active = true;
    let masters: ChargeMasterRow[] = [];
    let items: ItemRow[] = [];
    let accounts: AccountRow[] = [];

    void Promise.all([
      supabase
        .from("charge_master")
        .select("charge_key,charge_name,default_rate,unit,is_fixed,applies_to,is_active,tax_applicable,revenue_account_id,cost_account_id,charge_type")
        .eq("is_active", true)
        .in("applies_to", ["sales", "both"]),
      supabase.from("items").select("id,unit"),
      supabase.from("chart_of_accounts").select("id,code,name"),
    ]).then(([masterRes, itemRes, accountRes]) => {
      if (!active) return;
      masters = (masterRes.data ?? []) as ChargeMasterRow[];
      items = (itemRes.data ?? []) as ItemRow[];
      accounts = (accountRes.data ?? []) as AccountRow[];
    });

    const timer = window.setInterval(() => {
      if (!active || !masters.length) return;
      const context = contextFor(pathname);
      if (!context) return;
      const root = findTransactionRoot(context);
      if (!root) return;
      renderConsolidatedChargeParity(root, masters, items, accounts);
    }, 450);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pathname]);

  if (!ctx || !slot || !slot.isConnected) return null;

  return createPortal(
    <section data-navilo-discount-panel className="rounded-lg border border-emerald-200 bg-white shadow-sm">
      <div className="border-b border-emerald-100 bg-emerald-50 px-3 py-2.5">
        <div className="text-[12px] font-bold text-emerald-900">{ctx.label} / {ctx.urdu}</div>
        <div className="mt-0.5 text-[12px] text-emerald-700">
          Controlled invoice-level commercial discount. Tax remains as invoiced; accounting posts a separate auditable discount entry.
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-4">
        <div>
          <label className="label">Discount Type / قسم</label>
          <select className="input" value={mode} onChange={(event) => { setMode(event.target.value as DiscountMode); setDirty(true); setMessage(""); }}>
            <option value="fixed">Fixed Amount / مقررہ رقم</option>
            <option value="percent">Percentage / فیصد</option>
          </select>
        </div>
        <div>
          <label className="label">{mode === "percent" ? "Discount % / رعایت فیصد" : "Discount Amount / رعایت رقم"}</label>
          <input
            className="input text-right"
            type="number"
            min="0"
            max={mode === "percent" ? 100 : undefined}
            step="0.01"
            value={value}
            onChange={(event) => { setValue(event.target.value); setDirty(true); setMessage(""); }}
          />
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-[11px] uppercase text-slate-400">Gross Total / مجموعی</div>
          <div className="mt-1 font-bold text-slate-800">{money(gross)}</div>
          <div className="mt-1 text-xs text-rose-600">− {money(calculated)}</div>
        </div>
        <div className="rounded-lg bg-emerald-50 px-3 py-2">
          <div className="text-[11px] uppercase text-emerald-600">Net Total / خالص کل</div>
          <div className="mt-1 text-lg font-bold text-emerald-800">{money(net)}</div>
          <div className="mt-1 text-[11px] text-emerald-600">{saving ? "Saving…" : message || "Saved in audit trail"}</div>
        </div>
      </div>
    </section>,
    slot,
  );
}