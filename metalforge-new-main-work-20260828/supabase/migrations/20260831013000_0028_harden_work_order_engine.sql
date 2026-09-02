begin;

-- ============================================================
-- WORK ORDER STRUCTURE
-- ============================================================

alter table public.work_orders
  add column if not exists warehouse_id uuid
    references public.warehouses(id) on delete restrict,
  add column if not exists godown_id uuid
    references public.godowns(id) on delete restrict;

alter table public.work_order_lines
  add column if not exists created_at timestamptz not null default now();

-- Enforce valid NEW data without breaking legacy rows immediately.

alter table public.work_orders
  drop constraint if exists work_orders_item_required;

alter table public.work_orders
  add constraint work_orders_item_required
  check (item_id is not null) not valid;

alter table public.work_orders
  drop constraint if exists work_orders_qty_positive;

alter table public.work_orders
  add constraint work_orders_qty_positive
  check (qty > 0) not valid;

alter table public.work_order_lines
  drop constraint if exists work_order_lines_item_required;

alter table public.work_order_lines
  add constraint work_order_lines_item_required
  check (item_id is not null) not valid;

alter table public.work_order_lines
  drop constraint if exists work_order_lines_qty_positive;

alter table public.work_order_lines
  add constraint work_order_lines_qty_positive
  check (qty > 0) not valid;

-- ============================================================
-- ORDER NUMBER INTEGRITY
-- ============================================================

create unique index if not exists work_orders_user_order_no_uidx
  on public.work_orders (user_id, lower(btrim(order_no)));

create or replace function public.next_work_order_no()
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_next integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':work-order-number', 0)
  );

  select coalesce(
    max(
      case
        when upper(order_no) ~ '^WO-[0-9]+$'
        then substring(upper(order_no) from '[0-9]+$')::integer
        else 0
      end
    ),
    0
  ) + 1
  into v_next
  from public.work_orders
  where user_id = v_user_id;

  return 'WO-' || lpad(v_next::text, 4, '0');
end;
$function$;

revoke all on function public.next_work_order_no() from public;
revoke all on function public.next_work_order_no() from anon;
grant execute on function public.next_work_order_no() to authenticated;

-- ============================================================
-- PROTECT COMPLETED / CLOSED WORK ORDERS
-- ============================================================

create or replace function public.guard_work_order_changes()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status in ('completed', 'closed') then
      raise exception 'Completed or closed work orders cannot be deleted.';
    end if;

    return old;
  end if;

  if old.status = 'closed' then
    raise exception 'Closed work orders cannot be modified.';
  end if;

  if old.status = 'completed' then
    if new.status = 'closed'
       and new.order_no is not distinct from old.order_no
       and new.item_id is not distinct from old.item_id
       and new.qty is not distinct from old.qty
       and new.start_date is not distinct from old.start_date
       and new.end_date is not distinct from old.end_date
       and new.warehouse_id is not distinct from old.warehouse_id
       and new.godown_id is not distinct from old.godown_id then
      return new;
    end if;

    raise exception 'Completed work orders are locked.';
  end if;

  if new.status = 'completed'
     and coalesce(
       current_setting('app.completing_work_order', true),
       ''
     ) <> '1' then
    raise exception 'Use the production completion process to complete this work order.';
  end if;

  if new.status not in ('planned', 'in_progress', 'completed', 'closed') then
    raise exception 'Invalid work order status.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_work_order_changes
on public.work_orders;

create trigger trg_guard_work_order_changes
before update or delete on public.work_orders
for each row
execute function public.guard_work_order_changes();

-- BOM cannot change once production starts.

create or replace function public.guard_work_order_line_changes()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_order_id uuid;
  v_status text;
begin
  v_order_id := coalesce(new.order_id, old.order_id);

  select status
    into v_status
  from public.work_orders
  where id = v_order_id;

  if v_status is null then
    raise exception 'Work order not found.';
  end if;

  if v_status <> 'planned' then
    raise exception 'Components can only be changed while work order is planned.';
  end if;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_guard_work_order_line_changes
on public.work_order_lines;

create trigger trg_guard_work_order_line_changes
before insert or update or delete on public.work_order_lines
for each row
execute function public.guard_work_order_line_changes();

-- ============================================================
-- ATOMIC PRODUCTION COMPLETION
-- ============================================================

create or replace function public.complete_work_order(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_order public.work_orders%rowtype;
  v_line record;
  v_product_type text;
  v_godown_name text;
  v_line_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select *
    into v_order
  from public.work_orders
  where id = p_order_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Work order not found.';
  end if;

  if v_order.status <> 'in_progress' then
    raise exception 'Only an in-progress work order can be completed.';
  end if;

  if v_order.item_id is null then
    raise exception 'Finished product is required.';
  end if;

  if v_order.qty is null or v_order.qty <= 0 then
    raise exception 'Production quantity must be greater than zero.';
  end if;

  if v_order.warehouse_id is null or v_order.godown_id is null then
    raise exception 'Production warehouse and godown are required.';
  end if;

  select type
    into v_product_type
  from public.items
  where id = v_order.item_id;

  if v_product_type is distinct from 'finished' then
    raise exception 'Work order product must be a finished item.';
  end if;

  select name
    into v_godown_name
  from public.godowns
  where id = v_order.godown_id
    and warehouse_id = v_order.warehouse_id;

  if v_godown_name is null then
    raise exception 'Selected godown does not belong to selected warehouse.';
  end if;

  select count(*)
    into v_line_count
  from public.work_order_lines
  where order_id = v_order.id
    and user_id = v_user_id;

  if v_line_count = 0 then
    raise exception 'Add at least one component before completing production.';
  end if;

  if exists (
    select 1
    from public.work_order_lines wol
    left join public.items i on i.id = wol.item_id
    where wol.order_id = v_order.id
      and wol.user_id = v_user_id
      and (
        wol.item_id is null
        or wol.qty <= 0
        or i.id is null
        or i.type not in ('raw', 'component')
      )
  ) then
    raise exception 'Work order contains an invalid component.';
  end if;

  -- Consume BOM quantities.
  for v_line in
    select item_id, qty
    from public.work_order_lines
    where order_id = v_order.id
      and user_id = v_user_id
    order by item_id
  loop
    perform public.apply_stock_movement(
      v_line.item_id,
      v_order.warehouse_id,
      v_order.godown_id,
      'out',
      v_line.qty,
      'Production Consumption - ' || v_order.order_no
    );
  end loop;

  -- Produce finished goods.
  perform public.apply_stock_movement(
    v_order.item_id,
    v_order.warehouse_id,
    v_order.godown_id,
    'in',
    v_order.qty,
    'Production Output - ' || v_order.order_no
  );

  perform set_config('app.completing_work_order', '1', true);

  update public.work_orders
  set
    status = 'completed',
    end_date = coalesce(end_date, current_date)
  where id = v_order.id
    and user_id = v_user_id;
end;
$function$;

revoke all on function public.complete_work_order(uuid) from public;
revoke all on function public.complete_work_order(uuid) from anon;
grant execute on function public.complete_work_order(uuid) to authenticated;

commit;
