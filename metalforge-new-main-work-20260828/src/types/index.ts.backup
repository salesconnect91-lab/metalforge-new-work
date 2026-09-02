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
  created_at: string;
}

export interface Supplier {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
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
  grade: string | null;
  size: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
  item?: Item | null;
}

export interface PurchaseOrder {
  id: string;
  user_id: string;
  order_no: string;
  supplier_id: string | null;
  order_date: string;
  status: PurchaseStatus;
  total: number;
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
}

export interface PurchaseOrderLine {
  id: string;
  user_id: string;
  order_id: string;
  item_id: string | null;
  qty: number;
  unit_cost: number;
  line_total: number;
  item?: Item | null;
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
  item?: Item | null;
}

export interface WarehouseStock {
  id: string;
  user_id: string;
  item_id: string | null;
  godown: string;
  quantity: number;
  updated_at: string;
  item?: Item | null;
}

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

export interface JournalEntry {
  id: string;
  user_id: string;
  entry_no: string;
  entry_date: string;
  description: string | null;
  status: JournalStatus;
  created_at: string;
  lines?: JournalLine[];
}

export interface JournalLine {
  id: string;
  user_id: string;
  entry_id: string;
  account: string;
  debit: number;
  credit: number;
}

export interface ChartOfAccount {
  id: string;
  user_id: string;
  code: string;
  name: string;
  type: AccountType;
  created_at: string;
}

export interface Ledger {
  id: string;
  user_id: string;
  account_id: string | null;
  entry_date: string;
  description: string | null;
  debit: number;
  credit: number;
  created_at: string;
  account?: ChartOfAccount | null;
}

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
  created_at: string;
}

export interface InsertResult<T> {
  data: T | null;
  error: string | null;
}
