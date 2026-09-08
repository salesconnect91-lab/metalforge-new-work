import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";

type Charge = {
  charge_key: string;
  charge_name: string;
  default_rate: number | string | null;
  unit: string | null;
};

type LinkedLine = {
  id: string;
  item_id: string | null;
  godown_id: string | null;
  qty: number | string | null;
  unit_price: number | string | null;
  order_book_commitment_id: string | null;
};

const n = (value: unknown) => Number(value ?? 0);
const sameNumber = (a: unknown, b: unknown) => Math.abs(n(a) - n(b)) < 0.0001;

function invoiceItemsTable() {
  const sections = Array.from(document.querySelectorAll("section"));
  const section = sections.find((node) =>
    (node.textContent || "").toLowerCase().includes("invoice items")
  );
  return section?.querySelector("table") ?? null;
}

function chargeSection() {
  const sections = Array.from(document.querySelectorAll("section"));
  return (
    sections.find((node) =>
      (node.textContent || "").toLowerCase().includes("applicable charges")
    ) ?? null
  );
}

function consolidatedInvoiceNo() {
  const labels = Array.from(document.querySelectorAll("label"));
  const label = labels.find((node) =>
    (node.textContent || "").toLowerCase().includes("dispatch no")
  );
  const input = label?.parentElement?.querySelector("input");
  return input instanceof HTMLInputElement ? input.value.trim() : "";
}

function rowControls(row: HTMLTableRowElement) {
  const selects = Array.from(row.querySelectorAll<HTMLSelectElement>("select"));
  const numberInputs = Array.from(
    row.querySelectorAll<HTMLInputElement>('input[type="number"]')
  );
  return {
    item: selects[0] ?? null,
    godown: selects[1] ?? null,
    qty: numberInputs[0] ?? null,
    rate: numberInputs[1] ?? null,
  };
}

export default function DraftSalesOperationalBridge() {
  const { pathname } = useLocation();
  const documentIdRef = useRef("");
  const kindRef = useRef<"sales_main" | "sales_consolidated">("sales_main");
  const linkedRef = useRef<LinkedLine[]>([]);
  const chargesRef = useRef<Charge[]>([]);
  const selectedChargeRef = useRef("");
  const saveInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const mainMatch = pathname.match(/^\/sales\/([0-9a-f-]{36})\/edit$/i);
    const isMain = Boolean(mainMatch);
    const isConsolidated = pathname === "/sales/consolidated";
    if (!isMain && !isConsolidated) return;

    let alive = true;
    kindRef.current = isMain ? "sales_main" : "sales_consolidated";

    const resolveDocumentId = async () => {
      if (isMain) {
        const id = mainMatch?.[1] || "";
        if (!id) return "";
        const { data } = await supabase
          .from("sales_orders")
          .select("id,status")
          .eq("id", id)
          .eq("status", "draft")
          .maybeSingle();
        documentIdRef.current = String(data?.id || "");
        return documentIdRef.current;
      }

      const remembered = window.sessionStorage.getItem(
        "navilo:lastOrderBookConsolidatedDraft"
      );
      if (remembered) {
        const { data } = await supabase
          .from("consolidated_sales_invoices")
          .select("id,status")
          .eq("id", remembered)
          .eq("status", "draft")
          .maybeSingle();
        if (data?.id) {
          documentIdRef.current = String(data.id);
          return documentIdRef.current;
        }
      }

      const invoiceNo = consolidatedInvoiceNo();
      if (!invoiceNo) return "";
      const { data } = await supabase
        .from("consolidated_sales_invoices")
        .select("id,status")
        .eq("invoice_no", invoiceNo)
        .eq("status", "draft")
        .maybeSingle();
      documentIdRef.current = String(data?.id || "");
      return documentIdRef.current;
    };

    const refresh = async () => {
      const documentId = await resolveDocumentId();
      if (!documentId || !alive) return;

      const lineTable = isMain
        ? "sales_order_lines"
        : "consolidated_sales_invoice_lines";
      const parentKey = isMain ? "order_id" : "invoice_id";

      const [lineRes, chargeRes] = await Promise.all([
        supabase
          .from(lineTable)
          .select(
            "id,item_id,godown_id,qty,unit_price,order_book_commitment_id,created_at"
          )
          .eq(parentKey, documentId)
          .not("order_book_commitment_id", "is", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("charge_master")
          .select("charge_key,charge_name,default_rate,unit")
          .eq("is_active", true)
          .in("applies_to", ["sales", "both"])
          .order("charge_name"),
      ]);

      if (!alive) return;
      if (!lineRes.error) linkedRef.current = (lineRes.data ?? []) as LinkedLine[];
      if (!chargeRes.error) chargesRef.current = (chargeRes.data ?? []) as Charge[];
    };

    const decorate = () => {
      const table = invoiceItemsTable();
      if (table && linkedRef.current.length > 0) {
        const used = new Set<string>();
        const rows = Array.from(
          table.querySelectorAll<HTMLTableRowElement>("tbody tr")
        );

        for (const row of rows) {
          const controls = rowControls(row);
          if (!controls.item || !controls.godown || !controls.qty || !controls.rate)
            continue;

          let line = linkedRef.current.find(
            (candidate) =>
              !used.has(candidate.id) &&
              String(candidate.item_id || "") === controls.item?.value &&
              String(candidate.godown_id || "") === controls.godown?.value &&
              sameNumber(candidate.qty, controls.qty?.value) &&
              sameNumber(candidate.unit_price, controls.rate?.value)
          );
          if (!line) {
            line = linkedRef.current.find(
              (candidate) =>
                !used.has(candidate.id) &&
                String(candidate.item_id || "") === controls.item?.value &&
                String(candidate.godown_id || "") === controls.godown?.value &&
                sameNumber(candidate.unit_price, controls.rate?.value)
            );
          }
          if (!line) continue;

          used.add(line.id);
          row.dataset.naviloObLineId = line.id;
          controls.item.disabled = true;
          controls.item.title = "Item is locked by the Order Book commitment";
          controls.rate.disabled = true;
          controls.rate.title = "Agreed rate is locked by the Order Book commitment";
          controls.qty.disabled = false;
          controls.qty.removeAttribute("aria-readonly");
          controls.qty.title = "Invoice quantity can be reduced for partial delivery";
          controls.godown.disabled = false;
          controls.godown.removeAttribute("aria-readonly");
          controls.godown.title = "Godown can be selected for this partial delivery";
        }
      }

      const section = chargeSection();
      const select = section?.querySelector("select");
      if (select instanceof HTMLSelectElement && chargesRef.current.length > 0) {
        for (const charge of chargesRef.current) {
          if (!Array.from(select.options).some((option) => option.value === charge.charge_key)) {
            const option = document.createElement("option");
            option.value = charge.charge_key;
            option.textContent = `${charge.charge_name}${charge.default_rate != null ? ` — Rs ${Number(charge.default_rate).toLocaleString()}${charge.unit ? ` / ${charge.unit.replaceAll("_", " ")}` : ""}` : ""}`;
            select.appendChild(option);
          }
        }
        if (
          selectedChargeRef.current &&
          Array.from(select.options).some(
            (option) => option.value === selectedChargeRef.current
          )
        ) {
          select.value = selectedChargeRef.current;
        }
      }
    };

    const saveLinkedRow = async (row: HTMLTableRowElement) => {
      const lineId = row.dataset.naviloObLineId || "";
      if (!lineId) return;
      const controls = rowControls(row);
      const qty = Number(controls.qty?.value || 0);
      const godownId = controls.godown?.value || "";
      if (qty <= 0 || !godownId) return;

      const task = (async () => {
        const { error } = await supabase.rpc("update_order_book_linked_line", {
          p_line_id: lineId,
          p_qty: qty,
          p_godown_id: godownId,
          p_kind: kindRef.current,
        });
        if (error) throw error;
        linkedRef.current = linkedRef.current.map((line) =>
          line.id === lineId ? { ...line, qty, godown_id: godownId } : line
        );
      })();

      saveInFlightRef.current = task;
      try {
        await task;
      } catch (error: any) {
        window.alert(error?.message || "Could not save the partial invoice quantity.");
        await refresh();
        decorate();
      } finally {
        if (saveInFlightRef.current === task) saveInFlightRef.current = null;
      }
    };

    const saveAllLinkedRows = async () => {
      const table = invoiceItemsTable();
      if (!table) return;
      const rows = Array.from(
        table.querySelectorAll<HTMLTableRowElement>("tbody tr[data-navilo-ob-line-id]")
      );
      for (const row of rows) await saveLinkedRow(row);
      if (saveInFlightRef.current) await saveInFlightRef.current;
    };

    const addCharge = async (button: HTMLButtonElement) => {
      const section = chargeSection();
      const select = section?.querySelector("select");
      const chargeKey =
        selectedChargeRef.current ||
        (select instanceof HTMLSelectElement ? select.value : "");
      if (!chargeKey) return;

      const documentId = documentIdRef.current || (await resolveDocumentId());
      if (!documentId) {
        window.alert("Save/create the draft invoice first, then add the charge.");
        return;
      }

      const oldText = button.textContent || "Add";
      button.disabled = true;
      button.textContent = "Adding…";
      try {
        await saveAllLinkedRows();
        const { error } = await supabase.rpc("add_draft_sales_invoice_charge", {
          p_kind: kindRef.current,
          p_document_id: documentId,
          p_charge_key: chargeKey,
        });
        if (error) throw error;
        selectedChargeRef.current = "";
        if (select instanceof HTMLSelectElement) select.value = "";
        await refresh();
        window.setTimeout(() => window.location.reload(), 180);
      } catch (error: any) {
        window.alert(error?.message || "Could not add this charge.");
        button.disabled = false;
        button.textContent = oldText;
      }
    };

    const onChange = (event: Event) => {
      const target = event.target;
      const section = chargeSection();
      if (
        target instanceof HTMLSelectElement &&
        section &&
        section.contains(target)
      ) {
        selectedChargeRef.current = target.value;
        return;
      }

      const row =
        target instanceof Element ? target.closest("tr[data-navilo-ob-line-id]") : null;
      if (!(row instanceof HTMLTableRowElement)) return;
      const controls = rowControls(row);
      if (target === controls.qty || target === controls.godown) {
        void saveLinkedRow(row);
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest("button");
      if (!(button instanceof HTMLButtonElement)) return;
      const section = chargeSection();
      if (!section || !section.contains(button)) return;
      const text = (button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!text.includes("add") && !text.includes("شامل")) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void addCharge(button);
    };

    void refresh().then(decorate);
    const refreshTimer = window.setInterval(() => void refresh(), 1400);
    const decorateTimer = window.setInterval(decorate, 180);
    document.addEventListener("change", onChange, true);
    document.addEventListener("click", onClick, true);

    return () => {
      alive = false;
      window.clearInterval(refreshTimer);
      window.clearInterval(decorateTimer);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [pathname]);

  return null;
}
