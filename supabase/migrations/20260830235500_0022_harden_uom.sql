-- =========================================================
-- UOM MASTER DATA INTEGRITY
-- =========================================================

alter table public.uom
drop constraint if exists uom_name_not_blank;

alter table public.uom
add constraint uom_name_not_blank
check (trim(name) <> '');

alter table public.uom
drop constraint if exists uom_symbol_not_blank;

alter table public.uom
add constraint uom_symbol_not_blank
check (trim(symbol) <> '');

create unique index if not exists uom_name_normalized_uidx
on public.uom (lower(trim(name)));

create unique index if not exists uom_symbol_normalized_uidx
on public.uom (lower(trim(symbol)));
