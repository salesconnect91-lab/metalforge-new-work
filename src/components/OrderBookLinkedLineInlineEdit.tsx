import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";

type LinkedLine = {
  id: string;
  item_id: string | null;
  godown_id: string | null;
  qty: number | string | null;
  unit_price: number | string | null;
  order_book_commitment_id: string | null;
};

type Binding = {
  commitment_id: string;
  item_id: string;
  godown_id: string;
  qty: number;
  rate: number;
};

const num = (v: unknown) => Number(v ?? 0);
const sameNum = (a: unknown, b: unknown) => Math.abs(num(a) - num(b)) < 0.0001;

function invoiceItemsTable() {
  const sections = Array.from(document.querySelectorAll("section"));
  const section = sections.find((node) =>
    (node.textContent || "").toLowerCase().includes("invoice items")
  );
  return section?.querySelector("table") ?? null;
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

export default function OrderBookLinkedLineInlineEdit() {
  const { pathname } = useLocation();
  const linkedRef = useRef<LinkedLine[]>([]);
  const documentIdRef = useRef<string>("");
  const kindRef = useRef<"sales_main" | "sales_consolidated">("sales_main");
  const debounceRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const mainMatch = pathname.match(/^\/sales\/([0-9a-f-]{36})\/edit$/i);
    const isMain = Boolean(mainMatch);
    const isConsolidated = pathname === "/sales/consolidated";
    if (!isMain && !isConsolidated) return;

    let alive = true;
    kindRef.current = isMain ? "sales_main" : "sales_consolidated";

    const resolveDocumentId = async () => {
      if (isMain) {
        documentIdRef.current = mainMatch?.[1] || "";
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

    const refreshLinked = async () => {
      const documentId = await resolveDocumentId();
      if (!documentId || !alive) {
        linkedRef.current = [];
        return;
      }

      const table = isMain
        ? "sales_order_lines"
        : "consolidated_sales_invoice_lines";
      const parentKey = isMain ? "order_id" : "invoice_id";
      const { data, error } = await supabase
        .from(table)
        .select(
          "id,item_id,godown_id,qty,unit_price,order_book_commitment_id,created_at"
        )
        .eq(parentKey, documentId)
        .not("order_book_commitment_id", "is", null)
        .order("created_at", { ascending: true });
      if (!error && alive) linkedRef.current = (data ?? []) as LinkedLine[];
    };

    const decorate = () => {
      const table = invoiceItemsTable();
      if (!table || linkedRef.current.length === 0) return;
      const used = new Set<string>();
      const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));

      for (const row of rows) {
        const controls = rowControls(row);
        if (!controls.item || !controls.godown || !controls.qty || !controls.rate)
          continue;

        let line = linkedRef.current.find(
          (candidate) =>
            !used.has(candidate.id) &&
            String(candidate.item_id || "") === controls.item?.value &&
            String(candidate.godown_id || "") === controls.godown?.value &&
            sameNum(candidate.qty, controls.qty?.value) &&
            sameNum(candidate.unit_price, controls.rate?.value)
        );

        if (!line) {
          line = linkedRef.current.find(
            (candidate) =>
              !used.has(candidate.id) &&
              String(candidate.item_id || "") === controls.item?.value &&
              String(candidate.godown_id || "") === controls.godown?.value &&
              sameNum(candidate.unit_price, controls.rate?.value)
          );
        }
        if (!line) continue;

        used.add(line.id);
        row.dataset.naviloObLineId = line.id;
        row.dataset.naviloObCommitmentId = line.order_book_commitment_id || "";
        controls.item.disabled = true;
        controls.item.title = "Item is locked by the Order Book commitment";
        controls.rate.disabled = true;
        controls.rate.title = "Agreed rate is locked by the Order Book commitment";
        controls.qty.title = "Order Book Qty — edit here; it saves automatically";
        controls.godown.title = "Order Book Godown — change here; it saves automatically";
      }
    };

    const saveLinked = async (row: HTMLTableRowElement, qtyValue: string) => {
      const lineId = row.dataset.naviloObLineId || "";
      if (!lineId) return;
      const controls = rowControls(row);
      const qty = Number(qtyValue);
      const godownId = controls.godown?.value || "";
      if (!qty || qty <= 0 || !godownId) return;

      const { error } = await supabase.rpc("update_order_book_linked_line", {
        p_line_id: lineId,
        p_qty: qty,
        p_godown_id: godownId,
        p_kind: kindRef.current,
      });
      if (error) {
        window.alert(error.message || "Could not update Order Book quantity.");
        window.location.reload();
        return;
      }

      linkedRef.current = linkedRef.current.map((line) =>
        line.id === lineId ? { ...line, qty, godown_id: godownId } : line
      );
      window.setTimeout(() => window.location.reload(), 180);
    };

    const onInput = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "number") return;
      const row = input.closest("tr");
      if (!(row instanceof HTMLTableRowElement) || !row.dataset.naviloObLineId) return;
      const controls = rowControls(row);
      if (controls.qty !== input) return;

      const lineId = row.dataset.naviloObLineId;
      const oldTimer = debounceRef.current.get(lineId);
      if (oldTimer) window.clearTimeout(oldTimer);
      const captured = input.value;
      const timer = window.setTimeout(() => {
        debounceRef.current.delete(lineId);
        void saveLinked(row, captured);
      }, 550);
      debounceRef.current.set(lineId, timer);
    };

    const onChange = (event: Event) => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement)) return;
      const row = select.closest("tr");
      if (!(row instanceof HTMLTableRowElement) || !row.dataset.naviloObLineId) return;
      const controls = rowControls(row);
      if (controls.godown !== select || !controls.qty) return;
      void saveLinked(row, controls.qty.value);
    };

    const scheduleRestore = () => {
      const documentId = documentIdRef.current;
      const bindings: Binding[] = linkedRef.current
        .filter((line) => line.order_book_commitment_id)
        .map((line) => ({
          commitment_id: String(line.order_book_commitment_id),
          item_id: String(line.item_id || ""),
          godown_id: String(line.godown_id || ""),
          qty: Number(line.qty || 0),
          rate: Number(line.unit_price || 0),
        }));
      if (!documentId || bindings.length === 0) return;

      const restore = async () => {
        try {
          await supabase.rpc("restore_order_book_draft_links", {
            p_kind: kindRef.current,
            p_document_id: documentId,
            p_bindings: bindings,
          });
        } catch {
          // Native save may still be in progress; later retry handles it.
        }
      };
      window.setTimeout(() => void restore(), 650);
      window.setTimeout(() => void restore(), 1300);
      window.setTimeout(() => void restore(), 2300);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest("button");
      if (!(button instanceof HTMLButtonElement)) return;
      const text = (button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (text.includes("save draft") || text.includes("save & continue")) {
        scheduleRestore();
      }
    };

    void refreshLinked().then(decorate);
    const refreshTimer = window.setInterval(() => void refreshLinked(), 1800);
    const decorateTimer = window.setInterval(decorate, 250);
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("click", onClick, true);

    return () => {
      alive = false;
      window.clearInterval(refreshTimer);
      window.clearInterval(decorateTimer);
      debounceRef.current.forEach((timer) => window.clearTimeout(timer));
      debounceRef.current.clear();
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [pathname]);

  return null;
}
