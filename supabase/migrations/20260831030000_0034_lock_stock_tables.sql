-- ============================================================
-- 0034 - Lock stock balances and movement history
-- ============================================================
-- Goal:
--   * authenticated users may READ their own stock/movements
--   * stock mutation is allowed only through trusted ERP functions
--   * movement history cannot be manually edited/deleted from client
-- ============================================================


-- ------------------------------------------------------------
-- 1. Make centralized movement engine trusted
-- ------------------------------------------------------------

alter function public.apply_stock_movement(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text
)
security definer;

alter function public.apply_stock_movement(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text
)
set search_path = public;

revoke all on function public.apply_stock_movement(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text
) from public;

revoke all on function public.apply_stock_movement(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text
) from anon;

grant execute on function public.apply_stock_movement(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  text
) to authenticated;


-- ------------------------------------------------------------
-- 2. Keep transfer RPC trusted/authenticated only
-- ------------------------------------------------------------

alter function public.transfer_stock_v2(
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  text
)
security definer;

alter function public.transfer_stock_v2(
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  text
)
set search_path = public;

revoke all on function public.transfer_stock_v2(
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  text
) from public;

revoke all on function public.transfer_stock_v2(
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  text
) from anon;

grant execute on function public.transfer_stock_v2(
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  text
) to authenticated;


-- ------------------------------------------------------------
-- 3. Sales posting is a trusted atomic ERP transaction
-- ------------------------------------------------------------
-- Existing function already:
--   * requires auth.uid()
--   * locks the user's own sales order
--   * filters stock by the same user_id
--   * validates stock before deduction
--
-- SECURITY DEFINER lets it continue its atomic stock posting
-- after direct table mutation policies are removed.
-- ------------------------------------------------------------

alter function public.post_sales_invoice(uuid)
security definer;

alter function public.post_sales_invoice(uuid)
set search_path = public;

revoke all on function public.post_sales_invoice(uuid) from public;
revoke all on function public.post_sales_invoice(uuid) from anon;
grant execute on function public.post_sales_invoice(uuid) to authenticated;


-- ------------------------------------------------------------
-- 4. warehouse_stock:
--    READ only from browser/client.
--    All mutation must go through trusted ERP routines.
-- ------------------------------------------------------------

alter table public.warehouse_stock enable row level security;

drop policy if exists "insert_own_warehouse_stock"
  on public.warehouse_stock;

drop policy if exists "update_own_warehouse_stock"
  on public.warehouse_stock;

drop policy if exists "delete_own_warehouse_stock"
  on public.warehouse_stock;

-- Recreate SELECT explicitly so this migration is deterministic.
drop policy if exists "select_own_warehouse_stock"
  on public.warehouse_stock;

create policy "select_own_warehouse_stock"
on public.warehouse_stock
for select
to authenticated
using (auth.uid() = user_id);


-- ------------------------------------------------------------
-- 5. stock_movements:
--    immutable audit ledger from browser/client.
-- ------------------------------------------------------------

alter table public.stock_movements enable row level security;

drop policy if exists "insert_own_stock_movements"
  on public.stock_movements;

drop policy if exists "update_own_stock_movements"
  on public.stock_movements;

drop policy if exists "delete_own_stock_movements"
  on public.stock_movements;

drop policy if exists "select_own_stock_movements"
  on public.stock_movements;

create policy "select_own_stock_movements"
on public.stock_movements
for select
to authenticated
using (auth.uid() = user_id);


-- ------------------------------------------------------------
-- 6. Remove direct table mutation privileges from API roles
-- ------------------------------------------------------------

revoke insert, update, delete
on public.warehouse_stock
from anon, authenticated;

revoke insert, update, delete
on public.stock_movements
from anon, authenticated;

grant select
on public.warehouse_stock
to authenticated;

grant select
on public.stock_movements
to authenticated;


notify pgrst, 'reload schema';
