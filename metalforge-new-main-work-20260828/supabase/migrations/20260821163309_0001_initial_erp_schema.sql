/*
# MetalForge OS — Initial ERP Schema

Creates the complete manufacturing ERP database covering 7 modules:
Auth, Master Data, Sales, Purchase, Production, Inventory, Accounting.

## 1. New Tables

### Master Data
- `items` — products / raw materials (sku, name, type, unit, cost, price)
- `customers` — customer accounts (name, email, phone, address)
- `suppliers` — vendor accounts (name, email, phone, address)

### Sales
- `sales_orders` — sales order headers (customer, date, status, totals)
- `sales_order_lines` — line items on a sales order (item, qty, unit price)

### Purchase
- `purchase_orders` — purchase order headers (supplier, date, status, totals)
- `purchase_order_lines` — line items on a purchase order (item, qty, unit cost)

### Production
- `work_orders` — production order headers (item, qty, status, dates)
- `work_order_lines` — bill-of-materials lines for a work order (component, qty)

### Inventory
- `stock_movements` — stock in/out ledger (item, type, qty, reference)

### Accounting
- `journal_entries` — accounting journal headers (date, description, status)
- `journal_lines` — debit/credit lines on a journal entry (account, amount)

## 2. Security
- RLS enabled on every table.
- All tables are owner-scoped to the authenticated user via `user_id`.
- Owner column defaults to `auth.uid()` so inserts that omit it still succeed.
- 4 policies per table (SELECT / INSERT / UPDATE / DELETE), scoped `TO authenticated`.

## 3. Notes
- Cascade deletes on child rows so deleting an order removes its lines.
- Indexes on foreign keys and frequently-filtered columns.
- `created_at` defaults to now() on every table.
*/

-- ============================================================
-- MASTER DATA
-- ============================================================

CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'finished' CHECK (type IN ('raw', 'component', 'finished')),
  unit text NOT NULL DEFAULT 'pcs',
  cost numeric(12,2) NOT NULL DEFAULT 0,
  price numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_suppliers_user ON suppliers(user_id);

-- ============================================================
-- SALES
-- ============================================================

CREATE TABLE IF NOT EXISTS sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_no text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','shipped','closed')),
  total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sales_orders_user ON sales_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);

CREATE TABLE IF NOT EXISTS sales_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  qty numeric(12,2) NOT NULL DEFAULT 0,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0
);
ALTER TABLE sales_order_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sales_lines_order ON sales_order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_sales_lines_user ON sales_order_lines(user_id);

-- ============================================================
-- PURCHASE
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_no text NOT NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','received','closed')),
  total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_user ON purchase_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  qty numeric(12,2) NOT NULL DEFAULT 0,
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0
);
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_purchase_lines_order ON purchase_order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_lines_user ON purchase_order_lines(user_id);

-- ============================================================
-- PRODUCTION
-- ============================================================

CREATE TABLE IF NOT EXISTS work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_no text NOT NULL,
  item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  qty numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','closed')),
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_work_orders_user ON work_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_item ON work_orders(item_id);

CREATE TABLE IF NOT EXISTS work_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  qty numeric(12,2) NOT NULL DEFAULT 0
);
ALTER TABLE work_order_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_work_lines_order ON work_order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_work_lines_user ON work_order_lines(user_id);

-- ============================================================
-- INVENTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid REFERENCES items(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('in','out','adjust')),
  qty numeric(12,2) NOT NULL DEFAULT 0,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_stock_movements_user ON stock_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id);

-- ============================================================
-- ACCOUNTING
-- ============================================================

CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_no text NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_journal_entries_user ON journal_entries(user_id);

CREATE TABLE IF NOT EXISTS journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account text NOT NULL,
  debit numeric(12,2) NOT NULL DEFAULT 0,
  credit numeric(12,2) NOT NULL DEFAULT 0
);
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_user ON journal_lines(user_id);

-- ============================================================
-- RLS POLICIES (4 per table, owner-scoped)
-- ============================================================

-- items
DROP POLICY IF EXISTS "select_own_items" ON items;
CREATE POLICY "select_own_items" ON items FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_items" ON items;
CREATE POLICY "insert_own_items" ON items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_items" ON items;
CREATE POLICY "update_own_items" ON items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_items" ON items;
CREATE POLICY "delete_own_items" ON items FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- customers
DROP POLICY IF EXISTS "select_own_customers" ON customers;
CREATE POLICY "select_own_customers" ON customers FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_customers" ON customers;
CREATE POLICY "insert_own_customers" ON customers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_customers" ON customers;
CREATE POLICY "update_own_customers" ON customers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_customers" ON customers;
CREATE POLICY "delete_own_customers" ON customers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- suppliers
DROP POLICY IF EXISTS "select_own_suppliers" ON suppliers;
CREATE POLICY "select_own_suppliers" ON suppliers FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_suppliers" ON suppliers;
CREATE POLICY "insert_own_suppliers" ON suppliers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_suppliers" ON suppliers;
CREATE POLICY "update_own_suppliers" ON suppliers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_suppliers" ON suppliers;
CREATE POLICY "delete_own_suppliers" ON suppliers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- sales_orders
DROP POLICY IF EXISTS "select_own_sales_orders" ON sales_orders;
CREATE POLICY "select_own_sales_orders" ON sales_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_sales_orders" ON sales_orders;
CREATE POLICY "insert_own_sales_orders" ON sales_orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_sales_orders" ON sales_orders;
CREATE POLICY "update_own_sales_orders" ON sales_orders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_sales_orders" ON sales_orders;
CREATE POLICY "delete_own_sales_orders" ON sales_orders FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- sales_order_lines
DROP POLICY IF EXISTS "select_own_sales_lines" ON sales_order_lines;
CREATE POLICY "select_own_sales_lines" ON sales_order_lines FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_sales_lines" ON sales_order_lines;
CREATE POLICY "insert_own_sales_lines" ON sales_order_lines FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_sales_lines" ON sales_order_lines;
CREATE POLICY "update_own_sales_lines" ON sales_order_lines FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_sales_lines" ON sales_order_lines;
CREATE POLICY "delete_own_sales_lines" ON sales_order_lines FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- purchase_orders
DROP POLICY IF EXISTS "select_own_purchase_orders" ON purchase_orders;
CREATE POLICY "select_own_purchase_orders" ON purchase_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_purchase_orders" ON purchase_orders;
CREATE POLICY "insert_own_purchase_orders" ON purchase_orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_purchase_orders" ON purchase_orders;
CREATE POLICY "update_own_purchase_orders" ON purchase_orders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_purchase_orders" ON purchase_orders;
CREATE POLICY "delete_own_purchase_orders" ON purchase_orders FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- purchase_order_lines
DROP POLICY IF EXISTS "select_own_purchase_lines" ON purchase_order_lines;
CREATE POLICY "select_own_purchase_lines" ON purchase_order_lines FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_purchase_lines" ON purchase_order_lines;
CREATE POLICY "insert_own_purchase_lines" ON purchase_order_lines FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_purchase_lines" ON purchase_order_lines;
CREATE POLICY "update_own_purchase_lines" ON purchase_order_lines FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_purchase_lines" ON purchase_order_lines;
CREATE POLICY "delete_own_purchase_lines" ON purchase_order_lines FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- work_orders
DROP POLICY IF EXISTS "select_own_work_orders" ON work_orders;
CREATE POLICY "select_own_work_orders" ON work_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_work_orders" ON work_orders;
CREATE POLICY "insert_own_work_orders" ON work_orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_work_orders" ON work_orders;
CREATE POLICY "update_own_work_orders" ON work_orders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_work_orders" ON work_orders;
CREATE POLICY "delete_own_work_orders" ON work_orders FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- work_order_lines
DROP POLICY IF EXISTS "select_own_work_lines" ON work_order_lines;
CREATE POLICY "select_own_work_lines" ON work_order_lines FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_work_lines" ON work_order_lines;
CREATE POLICY "insert_own_work_lines" ON work_order_lines FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_work_lines" ON work_order_lines;
CREATE POLICY "update_own_work_lines" ON work_order_lines FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_work_lines" ON work_order_lines;
CREATE POLICY "delete_own_work_lines" ON work_order_lines FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- stock_movements
DROP POLICY IF EXISTS "select_own_stock_movements" ON stock_movements;
CREATE POLICY "select_own_stock_movements" ON stock_movements FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_stock_movements" ON stock_movements;
CREATE POLICY "insert_own_stock_movements" ON stock_movements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_stock_movements" ON stock_movements;
CREATE POLICY "update_own_stock_movements" ON stock_movements FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_stock_movements" ON stock_movements;
CREATE POLICY "delete_own_stock_movements" ON stock_movements FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- journal_entries
DROP POLICY IF EXISTS "select_own_journal_entries" ON journal_entries;
CREATE POLICY "select_own_journal_entries" ON journal_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_journal_entries" ON journal_entries;
CREATE POLICY "insert_own_journal_entries" ON journal_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_journal_entries" ON journal_entries;
CREATE POLICY "update_own_journal_entries" ON journal_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_journal_entries" ON journal_entries;
CREATE POLICY "delete_own_journal_entries" ON journal_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- journal_lines
DROP POLICY IF EXISTS "select_own_journal_lines" ON journal_lines;
CREATE POLICY "select_own_journal_lines" ON journal_lines FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_journal_lines" ON journal_lines;
CREATE POLICY "insert_own_journal_lines" ON journal_lines FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_journal_lines" ON journal_lines;
CREATE POLICY "update_own_journal_lines" ON journal_lines FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_journal_lines" ON journal_lines;
CREATE POLICY "delete_own_journal_lines" ON journal_lines FOR DELETE TO authenticated USING (auth.uid() = user_id);
