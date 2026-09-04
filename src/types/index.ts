export type ItemType = "raw" | "component" | "finished";
export type OrderStatus = "draft" | "confirmed" | "shipped" | "closed" | "posted";
export type PurchaseStatus = "draft" | "confirmed" | "received" | "closed" | "posted";
export type WorkOrderStatus = "planned" | "in_progress" | "completed" | "closed";
export type StockMovementType = "in" | "out" | "adjust";
export type JournalStatus = "draft" | "posted";
export type CuttingStatus = "pending" | "in_progress" | "completed" | "closed";
export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type GatePassType = "loading" | "unloading";
export type GatePassStatus = "pending" | "completed" | "cancelled";
export type PartyType = "customer" | "supplier";

export interface Item {
  id: string;
  user_id: string;
  sku: string;
  name: string;
  type: ItemType;
  grade: string | null;
  size: string | null;
  unit: string;
  price: number;
  cost: number;
  min_stock: number;
  is_active: boolean;
  created_at: string;
  category_id?: string | null;
  godown_id?: string | null;
  category?: Category | null;
  godown?: Godown | null;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  created_at?: string;
}

export interface Godown {
  id: string;
  user_id?: string;
  name: string;
  location?: string | null;
  warehouse_id?: string | null;
  created_at?: string;
}

export interface Customer {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  account_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Supplier {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  account_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Warehouse {
  id: string;
  user_id: string;
  name: string;
  location: string | null;
  is_active: boolean;
  created_at: string;
}

export interface WarehouseStock {
  id: string;
  user_id: string;
  item_id: string | null;
  warehouse_id: string | null;
  godown_id?: string | null;
  godown: string | null;
  quantity: number;
  updated_at: string;
  item?: Item | null;
  warehouse?: Warehouse | null;
}

export interface StockMovement {
  id: string;
  user_id: string;
  item_id: string | null;
  warehouse_id?: string | null;
  godown_id?: string | null;
  godown: string | null;
  type: StockMovementType | "purchase_return" | "sale_return" | string;
  qty: number;
  party_name?: string | null;
  price?: number | null;
  reference: string | null;
  created_at: string;
  item?: Item | null;
}

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
  source_consolidated_purchase_invoice_id?: string | null;

  item?: Item | null;
  godown?: {
    id: string;
    name: string;
    warehouse_id?: string | null;
  } | null;
}

/* =========================================================
   PRODUCTION / WORK ORDERS
   ========================================================= */

export interface WorkOrder {
  id: string;
  user_id: string;
  work_order_no: string;
  item_id: string | null;
  planned_qty: number;
  produced_qty: number;
  status: WorkOrderStatus;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  item?: Item | null;
}

export interface CuttingOrder {
  id: string;
  user_id: string;
  cutting_no: string;
  item_id: string | null;
  input_qty: number;
  output_qty: number;
  scrap_qty: number;
  status: CuttingStatus;
  notes: string | null;
  created_at: string;
  item?: Item | null;
}

export interface ChartOfAccount {
  id: string;
  user_id: string;
  code: string;
  name: string;
  type: AccountType;
  is_active: boolean;
  is_group?: boolean;
  allow_manual_entries?: boolean;
  created_at?: string;
}

export interface JournalEntry {
  id: string;
  user_id: string;
  entry_no: string;
  entry_date: string;
  description: string | null;
  status: JournalStatus;
  created_at: string;
}

export interface JournalLine {
  id: string;
  user_id: string;
  entry_id: string;
  account_id: string | null;
  account: string | null;
  debit: number;
  credit: number;
  created_at?: string;
}

export interface Ledger {
  id: string;
  user_id: string;
  account_id: string | null;
  journal_entry_id: string | null;
  journal_line_id: string | null;
  entry_date: string;
  description: string | null;
  debit: number;
  credit: number;
  created_at?: string;
}

export interface GatePass {
  id: string;
  user_id: string;
  pass_no: string;
  type: GatePassType;
  status: GatePassStatus;
  party_type?: PartyType | null;
  party_id?: string | null;
  party_name?: string | null;
  vehicle_no?: string | null;
  driver_name?: string | null;
  gross_weight?: number | null;
  tare_weight?: number | null;
  net_weight?: number | null;
  reference?: string | null;
  notes?: string | null;
  created_at: string;
}
