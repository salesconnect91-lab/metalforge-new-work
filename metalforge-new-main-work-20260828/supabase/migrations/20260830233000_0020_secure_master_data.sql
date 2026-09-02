-- =========================================================
-- MASTER DATA SECURITY
-- Shared company master data: authenticated users only
-- =========================================================

alter table public.items enable row level security;
alter table public.categories enable row level security;
alter table public.uom enable row level security;
alter table public.warehouses enable row level security;
alter table public.godowns enable row level security;
alter table public.transporters enable row level security;

drop policy if exists "Allow all access to items"
on public.items;

drop policy if exists "Allow all access to categories"
on public.categories;

drop policy if exists "Allow all access to warehouses"
on public.warehouses;

drop policy if exists "Allow authenticated users to read godowns"
on public.godowns;

drop policy if exists "authenticated_manage_items"
on public.items;

drop policy if exists "authenticated_manage_categories"
on public.categories;

drop policy if exists "authenticated_manage_uom"
on public.uom;

drop policy if exists "authenticated_manage_warehouses"
on public.warehouses;

drop policy if exists "authenticated_manage_godowns"
on public.godowns;

drop policy if exists "authenticated_manage_transporters"
on public.transporters;

create policy "authenticated_manage_items"
on public.items
for all
to authenticated
using (true)
with check (true);

create policy "authenticated_manage_categories"
on public.categories
for all
to authenticated
using (true)
with check (true);

create policy "authenticated_manage_uom"
on public.uom
for all
to authenticated
using (true)
with check (true);

create policy "authenticated_manage_warehouses"
on public.warehouses
for all
to authenticated
using (true)
with check (true);

create policy "authenticated_manage_godowns"
on public.godowns
for all
to authenticated
using (true)
with check (true);

create policy "authenticated_manage_transporters"
on public.transporters
for all
to authenticated
using (true)
with check (true);
