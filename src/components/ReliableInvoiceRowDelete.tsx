import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";

type LineRow = {
  id: string;
  item_id: string | null;
  godown_id: string | null;
  qty: number | string | null;
  unit_price: number | string | null;
  description?: string | null;
};

const n = (value: unknown) => Number(value ?? 0);
const sameNumber = (a: unknown, b: unknown) => Math.abs(n(a) - n(b)) < 0.0001;

function isInvoiceItemsTrash(button: HTMLButtonElement) {
  const title = (button.title || "").toLowerCase();
  if (title.includes("remove row") || title.includes("قطار ہٹائیں")) return true;
  const section = button.closest("section");
  if (!section) return false;
  const text = (section.textContent || "").toLowerCase();
  return text.includes("invoice items") && button.className.includes("rose");
}

function valuesFromRow(row: HTMLTableRowElement) {
  const selects = Array.from(row.querySelectorAll("select"));
  const numberInputs = Array.from(row.querySelectorAll<HTMLInputElement>('input[type="number"]'));
  const textInputs = Array.from(row.querySelectorAll<HTMLInputElement>('input:not([type="number"])'));
  return {
    itemId: selects[0]?.value || "",
    godownId: selects[1]?.value || "",
    qty: numberInputs[0]?.value || "0",
    rate: numberInputs[1]?.value || "0",
    description: textInputs[0]?.value || "",
  };
}

function consolidatedInvoiceNo() {
  const labels = Array.from(document.querySelectorAll("label"));
  const label = labels.find((node) => (node.textContent || "").toLowerCase().includes("dispatch no"));
  const input = label?.parentElement?.querySelector("input");
  return input instanceof HTMLInputElement ? input.value.trim() : "";
}

export default function ReliableInvoiceRowDelete() {
  const { pathname } = useLocation();

  useEffect(() => {
    const mainMatch = pathname.match(/^\/sales\/([0-9a-f-]{36})\/edit$/i);
    const isMain = Boolean(mainMatch);
    const isConsolidated = pathname === "/sales/consolidated";
    if (!isMain && !isConsolidated) return;

    const onClick = async (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest("button");
      if (!(button instanceof HTMLButtonElement)) return;
      if (button.dataset.naviloDeleteBypass === "1") {
        delete button.dataset.naviloDeleteBypass;
        return;
      }
      if (!isInvoiceItemsTrash(button)) return;

      const tr = button.closest("tr");
      if (!(tr instanceof HTMLTableRowElement)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const originalDisabled = button.disabled;
      button.disabled = true;
      const values = valuesFromRow(tr);

      try {
        let documentId = mainMatch?.[1] || "";
        let kind: "sales_main" | "sales_consolidated" = "sales_main";
        let table = "sales_order_lines";
        let parentKey = "order_id";

        if (isConsolidated) {
          kind = "sales_consolidated";
          table = "consolidated_sales_invoice_lines";
          parentKey = "invoice_id";
          const invoiceNo = consolidatedInvoiceNo();
          if (invoiceNo) {
            const { data: invoice, error } = await supabase
              .from("consolidated_sales_invoices")
              .select("id,status")
              .eq("invoice_no", invoiceNo)
              .eq("status", "draft")
              .maybeSingle();
            if (error) throw error;
            documentId = String(invoice?.id || "");
          }
        }

        if (!documentId) {
          button.dataset.naviloDeleteBypass = "1";
          button.disabled = originalDisabled;
          button.click();
          return;
        }

        const { data, error } = await supabase
          .from(table)
          .select("id,item_id,godown_id,qty,unit_price,description,created_at")
          .eq(parentKey, documentId)
          .order("created_at", { ascending: true });
        if (error) throw error;

        const lines = (data ?? []) as unknown as LineRow[];
        const match = lines.find((line) =>
          String(line.item_id || "") === values.itemId &&
          String(line.godown_id || "") === values.godownId &&
          sameNumber(line.qty, values.qty) &&
          sameNumber(line.unit_price, values.rate) &&
          (!values.description || String(line.description || "") === values.description)
        ) || lines.find((line) =>
          String(line.item_id || "") === values.itemId &&
          String(line.godown_id || "") === values.godownId &&
          sameNumber(line.qty, values.qty) &&
          sameNumber(line.unit_price, values.rate)
        );

        if (!match) {
          button.dataset.naviloDeleteBypass = "1";
          button.disabled = originalDisabled;
          button.click();
          return;
        }

        const { error: deleteError } = await supabase.rpc("delete_draft_invoice_line", {
          p_kind: kind,
          p_line_id: match.id,
        });
        if (deleteError) throw deleteError;

        button.dataset.naviloDeleteBypass = "1";
        button.disabled = originalDisabled;
        button.click();
      } catch (error: any) {
        button.disabled = originalDisabled;
        window.alert(error?.message || "Could not delete this draft invoice line.");
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  return null;
}
