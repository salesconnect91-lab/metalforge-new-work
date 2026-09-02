-- =========================================================
-- CATEGORIES MASTER DATA
-- =========================================================

alter table public.categories
add column if not exists sub_category text null;

alter table public.categories
add column if not exists description text null;

alter table public.categories
drop constraint if exists categories_name_not_blank;

alter table public.categories
add constraint categories_name_not_blank
check (trim(name) <> '');

create unique index if not exists categories_name_normalized_uidx
on public.categories (lower(trim(name)));

