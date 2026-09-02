import { supabase } from "@/lib/supabase";
import {
  CHARGE_TYPES,
  buildChargePayload,
  chargesFromRecord,
} from "@/lib/chargeTypes";
import type { ChargeValues } from "@/lib/chargeTypes";
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  SalesOrder,
  SalesOrderLine,
} from "@/types";

export interface PostResult {
  success: boolean;
  error: string | null;
  journalEntryNo?: string;
}

interface PostingRpcResult {
  success?: boolean;
  error?: string | null;
  message?: string | null;
  journal_entry_no?: string | null;
  journalEntryNo?: string | null;
}

function getRpcErrorMessage(error: {
  message: string;
  hint?: string | null;
  details?: string | null;
}): string {
  return error.hint || error.details || error.message;
}

function normalizePostingResult(data: unknown): PostResult {
  const result = data as PostingRpcResult | null;

  if (!result || result.success !== true) {
    return {
      success: false,
      error: result?.error || result?.message || "Posting did not complete.",
    };
  }

  const journalEntryNo =
    result.journal_entry_no || result.journalEntryNo || undefined;

  return {
    success: true,
    error: null,
    ...(journalEntryNo ? { journalEntryNo } : {}),
  };
}

/**
 * Posts a sales invoice through the database transaction engine.
 *
 * Stock, journal, general ledger and party ledger changes must stay inside
 * public.post_sales_invoice() so they either all succeed or all roll back.
 * `lines` remains in the signature for backwards compatibility; the database
 * reads the authoritative saved lines for the supplied order id.
 */
export async function postSalesInvoice(
  order: SalesOrder,
  _lines: SalesOrderLine[],
): Promise<PostResult> {
  const { data, error } = await supabase.rpc("post_sales_invoice", {
    p_order_id: order.id,
  });

  if (error) {
    return { success: false, error: getRpcErrorMessage(error) };
  }

  return normalizePostingResult(data);
}

/**
 * Posts a purchase invoice through the database transaction engine.
 *
 * The RPC owns stock valuation, supplier payable, journal and ledger posting.
 * `lines` remains in the signature for backwards compatibility; the database
 * reads the authoritative saved lines for the supplied order id.
 */
export async function postPurchaseInvoice(
  order: PurchaseOrder,
  _lines: PurchaseOrderLine[],
): Promise<PostResult> {
  const { data, error } = await supabase.rpc("post_purchase_invoice", {
    p_order_id: order.id,
  });

  if (error) {
    return { success: false, error: getRpcErrorMessage(error) };
  }

  return normalizePostingResult(data);
}

export { buildChargePayload, chargesFromRecord, CHARGE_TYPES };
export type { ChargeValues };
