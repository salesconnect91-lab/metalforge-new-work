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
  cost: number;
  price: number;
  created_at: string;
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
  description?: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
  tax_percent?: number;
  item?: Item | null;
  godown?: { id: string; name: string; warehouse_id?: string | null } | null;
}

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
  godown?: { id: string; name: string; warehouse_id?: string | null } | null;
}

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

export interface StockMovement {
  id: string;
  user_id: string;
  item_id: string | null;
  type: StockMovementType;
  qty: number;
  reference: string | null;
  created_at: string;
}
