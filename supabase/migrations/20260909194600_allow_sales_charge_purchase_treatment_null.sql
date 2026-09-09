alter table public.charge_master
  alter column purchase_treatment drop not null;

alter table public.charge_master
  alter column purchase_treatment drop default;

alter table public.charge_master
  drop constraint if exists charge_master_purchase_treatment_check;

alter table public.charge_master
  add constraint charge_master_purchase_treatment_check
  check (
    (applies_to = 'sales' and purchase_treatment is null)
    or
    (applies_to in ('purchase', 'both') and purchase_treatment in ('landed_cost', 'expense'))
  );
