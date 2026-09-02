-- 0030_inventory_costing_engine.sql
-- User-scoped inventory valuation foundation.

create table if not exists public.inventory_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  item_id uuid not null references public.items(id) on delete restrict,
  avg_cost numeric not null default 0,
  updated_at timestamptz not null default now(),

  constraint inventory_costs_avg_cost_nonnegative
    check (avg_cost >= 0),

  constraint inventory_costs_user_item_unique
    unique (user_id, item_id)
);

create index if not exists inventory_costs_item_idx
  on public.inventory_costs(item_id);

alter table public.inventory_costs enable row level security;

drop policy if exists "inventory_costs_select_own"
  on public.inventory_costs;

create policy "inventory_costs_select_own"
on public.inventory_costs
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "inventory_costs_insert_own"
  on public.inventory_costs;

create policy "inventory_costs_insert_own"
on public.inventory_costs
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "inventory_costs_update_own"
  on public.inventory_costs;

create policy "inventory_costs_update_own"
on public.inventory_costs
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on public.inventory_costs from anon;
grant select, insert, update on public.inventory_costs to authenticated;

-- Bootstrap current user/item valuation from the existing item master cost.
-- One row per user/item that already has warehouse stock.
insert into public.inventory_costs (
  user_id,
  item_id,
  avg_cost,
  updated_at
)
select distinct
  ws.user_id,
  ws.item_id,
  greatest(coalesce(i.cost, 0), 0),
  now()
from public.warehouse_stock ws
join public.items i
  on i.id = ws.item_id
on conflict (user_id, item_id)
do nothing;


-- Central helper: read current valuation cost.
create or replace function public.get_inventory_avg_cost(
  p_item_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cost numeric;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select ic.avg_cost
    into v_cost
  from public.inventory_costs ic
  where ic.user_id = v_user_id
    and ic.item_id = p_item_id;

  if v_cost is null then
    select greatest(coalesce(i.cost, 0), 0)
      into v_cost
    from public.items i
    where i.id = p_item_id;

    if not found then
      raise exception 'Item not found.';
    end if;
  end if;

  return round(coalesce(v_cost, 0), 6);
end;
$$;

revoke all on function public.get_inventory_avg_cost(uuid) from public;
revoke all on function public.get_inventory_avg_cost(uuid) from anon;
grant execute on function public.get_inventory_avg_cost(uuid) to authenticated;


-- Central helper: update weighted-average cost after stock IN.
create or replace function public.apply_inventory_cost_in(
  p_item_id uuid,
  p_old_qty numeric,
  p_in_qty numeric,
  p_in_unit_cost numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old_cost numeric;
  v_new_cost numeric;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_item_id is null then
    raise exception 'Item is required.';
  end if;

  if coalesce(p_old_qty, 0) < 0
     or coalesce(p_in_qty, 0) <= 0
     or coalesce(p_in_unit_cost, 0) < 0 then
    raise exception 'Invalid inventory costing values.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_user_id::text || ':cost:' || p_item_id::text,
      0
    )
  );

  select ic.avg_cost
    into v_old_cost
  from public.inventory_costs ic
  where ic.user_id = v_user_id
    and ic.item_id = p_item_id
  for update;

  if v_old_cost is null then
    select greatest(coalesce(i.cost, 0), 0)
      into v_old_cost
    from public.items i
    where i.id = p_item_id;

    if not found then
      raise exception 'Item not found.';
    end if;
  end if;

  if coalesce(p_old_qty, 0) <= 0 then
    v_new_cost := p_in_unit_cost;
  else
    v_new_cost :=
      (
        (p_old_qty * v_old_cost)
        + (p_in_qty * p_in_unit_cost)
      )
      / (p_old_qty + p_in_qty);
  end if;

  v_new_cost := round(coalesce(v_new_cost, 0), 6);

  insert into public.inventory_costs (
    user_id,
    item_id,
    avg_cost,
    updated_at
  )
  values (
    v_user_id,
    p_item_id,
    v_new_cost,
    now()
  )
  on conflict (user_id, item_id)
  do update set
    avg_cost = excluded.avg_cost,
    updated_at = now();

  return v_new_cost;
end;
$$;

revoke all on function public.apply_inventory_cost_in(
  uuid,
  numeric,
  numeric,
  numeric
) from public;

revoke all on function public.apply_inventory_cost_in(
  uuid,
  numeric,
  numeric,
  numeric
) from anon;

grant execute on function public.apply_inventory_cost_in(
  uuid,
  numeric,
  numeric,
  numeric
) to authenticated;
