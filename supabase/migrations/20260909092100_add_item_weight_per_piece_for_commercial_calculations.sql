alter table public.items
  add column if not exists weight_per_piece numeric;

alter table public.items
  drop constraint if exists items_weight_per_piece_nonnegative;

alter table public.items
  add constraint items_weight_per_piece_nonnegative
  check (weight_per_piece is null or weight_per_piece >= 0);
