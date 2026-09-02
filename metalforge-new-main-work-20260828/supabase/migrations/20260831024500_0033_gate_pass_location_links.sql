-- ============================================================
-- 0033 - Link Gate Passes to Warehouse / Godown master data
-- ============================================================

alter table public.gate_passes
  add column if not exists warehouse_id uuid,
  add column if not exists godown_id uuid;

alter table public.gate_passes
  drop constraint if exists gate_passes_warehouse_id_fkey;

alter table public.gate_passes
  add constraint gate_passes_warehouse_id_fkey
  foreign key (warehouse_id)
  references public.warehouses(id)
  on delete restrict;

alter table public.gate_passes
  drop constraint if exists gate_passes_godown_id_fkey;

alter table public.gate_passes
  add constraint gate_passes_godown_id_fkey
  foreign key (godown_id)
  references public.godowns(id)
  on delete restrict;

create index if not exists idx_gate_passes_warehouse
  on public.gate_passes(warehouse_id);

create index if not exists idx_gate_passes_godown
  on public.gate_passes(godown_id);

create or replace function public.guard_gate_pass_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_godown_warehouse uuid;
  v_godown_name text;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'pending' then
      raise exception 'Completed or cancelled gate passes cannot be deleted.';
    end if;

    return old;
  end if;

  if btrim(coalesce(new.pass_no, '')) = '' then
    raise exception 'Gate pass number is required.';
  end if;

  new.pass_no := btrim(new.pass_no);

  if new.type not in ('loading', 'unloading') then
    raise exception 'Invalid gate pass type.';
  end if;

  if new.status not in ('pending', 'completed', 'cancelled') then
    raise exception 'Invalid gate pass status.';
  end if;

  if new.warehouse_id is null then
    raise exception 'Warehouse is required.';
  end if;

  if new.godown_id is null then
    raise exception 'Godown is required.';
  end if;

  select g.warehouse_id, g.name
  into v_godown_warehouse, v_godown_name
  from public.godowns g
  where g.id = new.godown_id;

  if v_godown_warehouse is null then
    raise exception 'Selected godown does not exist.';
  end if;

  if v_godown_warehouse <> new.warehouse_id then
    raise exception 'Selected godown does not belong to selected warehouse.';
  end if;

  -- Keep legacy text field synchronized for old reports/prints.
  new.godown := v_godown_name;

  if coalesce(new.tare_weight, 0) < 0
     or coalesce(new.gross_weight, 0) < 0 then
    raise exception 'Weights cannot be negative.';
  end if;

  if new.gross_weight < new.tare_weight then
    raise exception 'Gross weight cannot be less than tare weight.';
  end if;

  new.net_weight := round(new.gross_weight - new.tare_weight, 2);

  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'Gate pass owner cannot be changed.';
    end if;

    if old.status in ('completed', 'cancelled')
       and new is distinct from old then
      raise exception 'Completed or cancelled gate passes are locked.';
    end if;

    if old.status = 'pending'
       and new.status not in ('pending', 'completed', 'cancelled') then
      raise exception 'Invalid gate pass status transition.';
    end if;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
