export type ItemType = "raw" | "component" | "finished";

export type OrderStatus =
  | "draft"
  | "confirmed"
  | "shipped"
  | "closed"
  | "posted";

export type PurchaseStatus =
  | "draft"
  | "confirmed"
  | "received"
  | "closed"
  | "posted";

export type WorkOrderStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "closed";

export type StockMovementType = "in" | "out" | "adjust";

export type JournalStatus = "draft" | "posted";

export type CuttingStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "closed";

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

export type GatePassType = "loading" | "unloading";

export type GatePassStatus =
  | "pending"
  | "completed"
  | "cancelled";

export type PartyType = "customer" | "supplier";

/* =========================================================
   ITEM
   ========================================================= */

export interface Item {
  id: string;
  user_id: string;
  sku: string;
  name: string;
  type: ItemType;
  grade: string | null;
  size: string | null;
  unit: string;
  cost: number;
  price: number;
  created_at: string;
}

/* =========================================================
   CUSTOMER
   ========================================================= */

export interface Customer {
  id: string;
  user_id: string;

  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;

  /**
   * Customer GL control account.
   * Normally Accounts Receivable.
   */
  account_id: string | null;

  is_active: boolean;

  created_at: string;
}

/* =========================================================
   SUPPLIER
   ========================================================= */

export interface Supplier {
  id: string;
  user_id: string;

  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;

  /**
   * Supplier GL control account.
   * Normally Accounts Payable.
   */
  account_id: string | null;

  is_active: boolean;

  created_at: string;
}

/* =========================================================
   SALES ORDER
   ========================================================= */

export interface SalesOrder {
  id: string;
  user_id: string;

  order_no: string;
  customer_id: string | null;
  sales_person: string | null;
  order_date: string;

  status: OrderStatus;

  total: number;
  invoice_type?: "Sale Invoice" | "Cash Bill" | "Tax Invoice";
  tax_percent?: number;
  payment_mode?: "Credit" | "Cash" | "Bank";
  payment_account_id?: string | null;

  loading_charge: number;
  unloading_charge: number;
  cutting_charge: number;
  transport_charge: number;
  labour_charge: number;
  handling_charge: number;
  other_charge: number;

  created_at: string;

  customer?: Customer | null;
  lines?: SalesOrderLine[];
}

export interface SalesOrderLine {
  id: string;
  user_id: string;

  order_id: string;
  item_id: string | null;
  godown_id: string | null;

  grade: string | null;
  size: string | null;

  qty: number;
  unit_price: number;
  line_total: number;
  tax_percent?: number;

  item?: Item | null;
  godown?: {
    id: string;
    name: string;
    warehouse_id?: string | null;
  } | null;
}

/* =========================================================
   PURCHASE ORDER
   ========================================================= */

export interface PurchaseOrder {
  id: string;
  user_id: string;

  order_no: string;
  supplier_id: string | null;
  order_date: string;

  status: PurchaseStatus;

  total: number;
  invoice_type?: "Purchase Invoice" | "Tax Invoice";
  tax_percent?: number;

  loading_charge: number;
  unloading_charge: number;
  cutting_charge: number;
  transport_charge: number;
  labour_charge: number;
  handling_charge: number;
  other_charge: number;

  created_at: string;

  supplier?: Supplier | null;
  lines?: PurchaseOrderLine[];
  paid_amount?: number | null;
  outstanding_amount?: number | null;
  payment_status?: "unpaid" | "partial" | "paid" | "overpaid" | string | null;
}

export interface PurchaseOrderLine {
  id: string;
  user_id: string;

  order_id: string;
  item_id: string | null;
  godown_id: string | null;

  qty: number;
  unit_cost: number;
  line_total: number;
  tax_percent?: number;

  item?: Item | null;
  godown?: {
    id: string;
    name: string;
    warehouse_id?: string | null;
  } | null;
}

/* =========================================================
   WORK ORDER
   ========================================================= */

export interface WorkOrder {
  id: string;
  user_id: string;

  order_no: string;
  item_id: string | null;

  qty: number;

  status: WorkOrderStatus;

  start_date: string | null;
  end_date: string | null;

  created_at: string;

  item?: Item | null;
  lines?: WorkOrderLine[];
}

export interface WorkOrderLine {
  id: string;
  user_id: string;

  order_id: string;
  item_id: string | null;

  qty: number;

  item?: Item | null;
}

/* =========================================================
   STOCK MOVEMENT
   ========================================================= */

export interface StockMovement {
  id: string;
  user_id: string;

  item_id: string | null;

  type: StockMovementType;
  qty: number;

  reference: string | null;

  created_at: string;

  item?: Item | null;
}

/* =========================================================
   WAREHOUSE STOCK
   ========================================================= */

export interface WarehouseStock {
  id: string;
  user_id: string;

  item_id: string | null;

  godown: string;
  quantity: number;

  updated_at: string;

  item?: Item | null;
}

/* =========================================================
   FURNACE YIELD
   ========================================================= */

export interface FurnaceYield {
  id: string;
  user_id: string;

  heat_no: string;
  furnace_no: string | null;

  charge_weight: number;
  output_weight: number;
  yield_pct: number;

  yield_date: string;

  created_at: string;
}

/* =========================================================
   CUTTING ORDER
   ========================================================= */

export interface CuttingOrder {
  id: string;
  user_id: string;

  order_no: string;

  customer_id: string | null;
  item_id: string | null;

  cut_length: string | null;

  qty: number;
  loading_qty: number;

  status: CuttingStatus;

  created_at: string;

  customer?: Customer | null;
  item?: Item | null;
}

/* =========================================================
   JOURNAL ENTRY
   ========================================================= */

export interface JournalEntry {
  id: string;
  user_id: string;

  entry_no: string;
  entry_date: string;

  description: string | null;

  status: JournalStatus;

  /**
   * Existing journal header fields.
   */
  payment_mode?: string | null;
  party_name?: string | null;
  received_by?: string | null;
  trans_type?: string | null;
  reversal_of_entry_id?: string | null;
  reversal_reason?: string | null;

  created_at: string;

  lines?: JournalLine[];
}

export interface JournalLine {
  id: string;
  user_id: string;

  entry_id: string;

  /**
   * Legacy/display account text.
   *
   * Example:
   * 1130 - Accounts Receivable
   */
  account: string;

  /**
   * Actual Chart of Accounts reference.
   */
  account_id: string | null;

  /**
   * Optional party information.
   *
   * Account and Party are intentionally separate:
   *
   * Account:
   * 1130 Accounts Receivable
   *
   * Party:
   * customer / Rashid
   */
  party_type: PartyType | null;
  party_id: string | null;

  /**
   * Legacy/display field retained for compatibility.
   */
  party_name: string | null;

  debit: number;
  credit: number;

  /**
   * Optional joined records used by UI queries.
   */
  coa?: ChartOfAccount | null;
  customer?: Customer | null;
  supplier?: Supplier | null;
}

/* =========================================================
   CHART OF ACCOUNTS
   ========================================================= */

export interface ChartOfAccount {
  id: string;
  user_id: string;

  code: string;
  name: string;

  type: AccountType;

  /**
   * Parent account for hierarchical COA.
   */
  parent_id: string | null;

  /**
   * True when account is a group/header account.
   */
  is_group: boolean;

  /**
   * Whether journal entries can be posted directly
   * against this account.
   */
  allow_manual_entries: boolean;

  is_active: boolean;

  /**
   * Used for system-created accounting accounts.
   */
  is_system_account: boolean;

  /**
   * Accounting role.
   *
   * Examples:
   * general
   * party
   * sales_person
   * charge
   * system
   */
  account_role: string | null;

  /**
   * Optional detail classification.
   */
  detail_type: string | null;

  /**
   * Optional parent/head display field.
   */
  parent_head: string | null;

  /**
   * Normal accounting balance.
   */
  normal_balance?: "debit" | "credit" | string | null;

  /**
   * Optional account description.
   */
  description: string | null;

  created_at: string;

  /**
   * Existing DB also contains updated_at.
   * Optional keeps older frontend code compatible.
   */
  updated_at?: string;
}

/* =========================================================
   ACCOUNT MAPPING
   ========================================================= */

export interface AccountMapping {
  id: string;
  user_id: string;

  mapping_key: string;
  account_id: string;

  created_at?: string;

  account?: ChartOfAccount | null;
}

/* =========================================================
   LEDGER
   ========================================================= */

export interface Ledger {
  id: string;
  user_id: string;

  /**
   * Source journal references.
   */
  journal_entry_id: string | null;
  journal_line_id: string | null;

  /**
   * Chart of Accounts reference.
   */
  account_id: string | null;

  entry_date: string;

  description: string | null;

  debit: number;
  credit: number;

  created_at: string;

  account?: ChartOfAccount | null;
}

/* =========================================================
   PARTY LEDGER
   ========================================================= */

export interface PartyLedger {
  id: string;
  user_id: string;

  party_type: PartyType;
  party_id: string;

  entry_date: string;

  description: string | null;
  reference: string | null;

  debit: number;
  credit: number;
  balance: number;

  /**
   * Source accounting references.
   *
   * These prevent duplicate party-ledger creation
   * from the same journal line.
   */
  journal_entry_id: string | null;
  journal_line_id: string | null;

  created_at: string;

  customer?: Customer | null;
  supplier?: Supplier | null;
}

/* =========================================================
   GATE PASS
   ========================================================= */

export interface GatePass {
  id: string;
  user_id: string;

  pass_no: string;

  sales_order_id: string | null;

  type: GatePassType;

  godown: string;

  vehicle_no: string | null;
  driver_name: string | null;

  tare_weight: number;
  gross_weight: number;
  net_weight: number;

  labour_contractor: string | null;

  status: GatePassStatus;

  pass_date: string;

  created_at: string;

  sales_order?: SalesOrder | null;
}

/* =========================================================
   GENERIC INSERT RESULT
   ========================================================= */

export interface InsertResult<T> {
  data: T | null;
  error: string | null;
}
