alter table public.charge_master
  drop constraint if exists charge_master_unit_check;

alter table public.charge_master
  add constraint charge_master_unit_check
  check (
    unit = any (
      array[
        'fixed'::text,
        'percent'::text,
        'per_qty'::text,
        'per_kg'::text,
        'per_ton'::text,
        'per_piece'::text,
        'manual'::text
      ]
    )
  );
