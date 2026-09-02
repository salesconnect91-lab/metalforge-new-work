-- =========================================================
-- ITEMS MASTER DATA INTEGRITY
-- =========================================================

create unique index if not exists items_sku_normalized_uidx
on public.items (lower(trim(sku)));

alter table public.items
drop constraint if exists items_sku_not_blank;

alter table public.items
add constraint items_sku_not_blank
check (trim(sku) <> '');

alter table public.items
drop constraint if exists items_name_not_blank;

alter table public.items
add constraint items_name_not_blank
check (trim(name) <> '');

alter table public.items
drop constraint if exists items_cost_nonnegative;

alter table public.items
add constraint items_cost_nonnegative
check (coalesce(cost, 0) >= 0);

alter table public.items
drop constraint if exists items_price_nonnegative;

alter table public.items
add constraint items_price_nonnegative
check (coalesce(price, 0) >= 0);
