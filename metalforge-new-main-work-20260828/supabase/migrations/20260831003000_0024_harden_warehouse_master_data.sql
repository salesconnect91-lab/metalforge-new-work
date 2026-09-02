-- =========================================================
-- WAREHOUSE / GODOWN / TRANSPORTER MASTER DATA INTEGRITY
-- =========================================================

-- Warehouses
alter table public.warehouses
drop constraint if exists warehouses_name_not_blank;

alter table public.warehouses
add constraint warehouses_name_not_blank
check (trim(name) <> '');

create unique index if not exists warehouses_name_normalized_uidx
on public.warehouses (lower(trim(name)));

-- Godowns
alter table public.godowns
drop constraint if exists godowns_name_not_blank;

alter table public.godowns
add constraint godowns_name_not_blank
check (trim(name) <> '');

alter table public.godowns
alter column warehouse_id set not null;

create unique index if not exists godowns_warehouse_name_normalized_uidx
on public.godowns (warehouse_id, lower(trim(name)));

-- Transporters
alter table public.transporters
drop constraint if exists transporters_name_not_blank;

alter table public.transporters
add constraint transporters_name_not_blank
check (trim(name) <> '');

create unique index if not exists transporters_name_normalized_uidx
on public.transporters (lower(trim(name)));
