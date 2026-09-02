import { supabase } from "@/lib/supabase";
import { AccountMapping, ChartOfAccount } from "@/types";

/**
 * Stable mapping keys used by modules.
 * These are DEFAULT mapping labels only.
 * They do NOT restrict the Chart of Accounts.
 */
export const DEFAULT_MAPPINGS = [
  ["cash", "Cash"],
  ["bank", "Bank"],
  ["accounts_receivable", "Accounts Receivable"],
  ["inventory", "Inventory"],
  ["input_vat", "Input VAT"],
  ["accounts_payable", "Accounts Payable"],
  ["output_vat", "Output VAT"],
  ["sales", "Sales"],
  ["cost_of_goods_sold", "Cost of Goods Sold"],
  ["expense", "Expenses"],
] as const;


/**
 * Get all Chart of Accounts.
 */
export async function listAccounts(): Promise<ChartOfAccount[]> {
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .order("code", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ChartOfAccount[];
}


/**
 * Create or update an account.
 *
 * IMPORTANT:
 * Parent/group information must also be saved.
 * This is what allows:
 *
 * Assets
 *   └─ Current Assets
 *       └─ Banks
 *           ├─ Rajhi Bank
 *           ├─ HBL Bank
 *           └─ Meezan Bank
 */
export async function saveAccount(
  account: Partial<ChartOfAccount> & {
    code: string;
    name: string;
    type: ChartOfAccount["type"];
  }
) {
  const payload = {
    code: account.code.trim(),
    name: account.name.trim(),
    type: account.type,

    parent_id: account.parent_id ?? null,

    is_group: account.is_group ?? false,

    allow_manual_entries:
      account.is_group
        ? false
        : account.allow_manual_entries ?? true,

    is_active: account.is_active ?? true,

    detail_type:
      account.detail_type?.trim() || null,

    parent_head:
      account.parent_head?.trim() || null,

    account_role:
      account.account_role || "general",

    description:
      account.description?.trim() || null,
  };

  if (account.id) {
    const { error } = await supabase
      .from("chart_of_accounts")
      .update(payload)
      .eq("id", account.id);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await supabase
    .from("chart_of_accounts")
    .insert(payload);

  if (error) {
    throw new Error(error.message);
  }
}


/**
 * Kept for compatibility.
 *
 * We intentionally do NOT create fixed accounts automatically.
 * Accounts should be controlled from the Chart of Accounts.
 */
export async function ensureDefaultChartOfAccounts() {
  return;
}


/**
 * Activate account.
 */
export async function activateAccount(id: string) {
  const { error } = await supabase
    .from("chart_of_accounts")
    .update({
      is_active: true,
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}


/**
 * Deactivate account.
 */
export async function deactivateAccount(id: string) {
  const { error } = await supabase
    .from("chart_of_accounts")
    .update({
      is_active: false,
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}


/**
 * Delete account.
 */
export async function deleteAccount(id: string) {
  const { error } = await supabase
    .from("chart_of_accounts")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}


/**
 * Get account mappings.
 */
export async function listMappings(): Promise<AccountMapping[]> {
  const { data, error } = await supabase
    .from("account_mappings")
    .select("*, account:chart_of_accounts(*)")
    .order("mapping_key");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as AccountMapping[];
}


/**
 * Save/update a stable mapping.
 */
export async function setMapping(
  mappingKey: string,
  accountId: string
) {
  if (!mappingKey || !accountId) {
    throw new Error("Mapping key and account are required.");
  }

  const { error } = await supabase
    .from("account_mappings")
    .upsert(
      {
        mapping_key: mappingKey,
        account_id: accountId,
      },
      {
        onConflict: "user_id,mapping_key",
      }
    );

  if (error) {
    throw new Error(error.message);
  }
}


/**
 * Resolve a mapping to an actual account.
 */
export async function resolveMappedAccount(
  mappingKey: string
): Promise<ChartOfAccount> {
  const { data, error } = await supabase
    .from("account_mappings")
    .select("account:chart_of_accounts(*)")
    .eq("mapping_key", mappingKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const account = (data as any)?.account as
    | ChartOfAccount
    | null;

  if (!account) {
    throw new Error(
      `No Chart of Accounts mapping configured for '${mappingKey}'.`
    );
  }

  return account;
}