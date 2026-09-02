-- ============================================================
-- 0032 - Harden Cutting Orders + Gate Pass / Weighbridge
-- ============================================================

-- ------------------------------------------------------------
-- CUTTING ORDERS
-- ------------------------------------------------------------

-- Item relationship was missing.
alter table public.cutting_orders
  drop constraint if exists cutting_orders_item_id_fkey;

alter table public.cutting_orders
  add constraint cutting_orders_item_id_fkey
  foreign key (item_id)
  references public.items(id)
  on delete restrict
  not valid;

-- New records must have a valid item.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cutting_orders_item_required_check'
      and conrelid = 'public.cutting_orders'::regclass
  ) then
    alter table public.cutting_orders
      add constraint cutting_orders_item_required_check
      check (item_id is not null)
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cutting_orders_qty_positive_check'
      and conrelid = 'public.cutting_orders'::regclass
  ) then
    alter table public.cutting_orders
      add constraint cutting_orders_qty_positive_check
      check (qty > 0)
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cutting_orders_loading_qty_check'
      and conrelid = 'public.cutting_orders'::regclass
  ) then
    alter table public.cutting_orders
      add constraint cutting_orders_loading_qty_check
      check (loading_qty >= 0)
      not valid;
  end if;
end $$;

create unique index if not exists uq_cutting_orders_user_order_no
  on public.cutting_orders (user_id, lower(btrim(order_no)));

create or replace function public.next_cutting_order_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_next bigint;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_user::text || ':cutting-order-number')
  );

  select coalesce(
    max(
      case
        when order_no ~ '^CUT-[0-9]+$'
        then substring(order_no from 5)::bigint
        else null
      end
    ),
    0
  ) + 1
  into v_next
  from public.cutting_orders
  where user_id = v_user;

  return 'CUT-' || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function public.next_cutting_order_no() from public;
revoke all on function public.next_cutting_order_no() from anon;
grant execute on function public.next_cutting_order_no() to authenticated;


create or replace function public.guard_cutting_order_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'pending' then
      raise exception 'Only pending cutting orders can be deleted.';
    end if;

    return old;
  end if;

  if btrim(coalesce(new.order_no, '')) = '' then
    raise exception 'Cutting order number is required.';
  end if;

  new.order_no := btrim(new.order_no);

  if new.item_id is null then
    raise exception 'Item is required.';
  end if;

  if coalesce(new.qty, 0) <= 0 then
    raise exception 'Cutting quantity must be greater than zero.';
  end if;

  if coalesce(new.loading_qty, 0) < 0 then
    raise exception 'Loading quantity cannot be negative.';
  end if;

  if new.status not in ('pending', 'in_progress', 'completed', 'closed') then
    raise exception 'Invalid cutting order status.';
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'Cutting order owner cannot be changed.';
    end if;

    if old.status = 'closed' and new is distinct from old then
      raise exception 'Closed cutting orders cannot be modified.';
    end if;

    if old.status = 'completed' then
      if new.status not in ('completed', 'closed') then
        raise exception 'Completed cutting orders can only be closed.';
      end if;

      if (
        new.order_no,
        new.customer_id,
        new.item_id,
        new.cut_length,
        new.qty,
        new.loading_qty,
        new.user_id
      ) is distinct from (
        old.order_no,
        old.customer_id,
        old.item_id,
        old.cut_length,
        old.qty,
        old.loading_qty,
        old.user_id
      ) then
        raise exception 'Completed cutting orders cannot be edited.';
      end if;
    end if;

    if old.status = 'pending'
       and new.status not in ('pending', 'in_progress') then
      raise exception 'Start the cutting order before completing it.';
    end if;

    if old.status = 'in_progress'
       and new.status not in ('in_progress', 'completed') then
      raise exception 'In-progress cutting orders can only be completed.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_cutting_order_changes
  on public.cutting_orders;

create trigger trg_guard_cutting_order_changes
before insert or update or delete
on public.cutting_orders
for each row
execute function public.guard_cutting_order_changes();


-- ------------------------------------------------------------
-- GATE PASS / WEIGHBRIDGE
-- ------------------------------------------------------------

create unique index if not exists uq_gate_passes_user_pass_no
  on public.gate_passes (user_id, lower(btrim(pass_no)));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'gate_passes_weight_nonnegative_check'
      and conrelid = 'public.gate_passes'::regclass
  ) then
    alter table public.gate_passes
      add constraint gate_passes_weight_nonnegative_check
      check (
        tare_weight >= 0
        and gross_weight >= 0
        and net_weight >= 0
      )
      not valid;
  end if;
end $$;

create or replace function public.next_gate_pass_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_next bigint;
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_user::text || ':gate-pass-number')
  );

  select coalesce(
    max(
      case
        when pass_no ~ '^GP-[0-9]+$'
        then substring(pass_no from 4)::bigint
        else null
      end
    ),
    0
  ) + 1
  into v_next
  from public.gate_passes
  where user_id = v_user;

  return 'GP-' || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function public.next_gate_pass_no() from public;
revoke all on function public.next_gate_pass_no() from anon;
grant execute on function public.next_gate_pass_no() to authenticated;


create or replace function public.guard_gate_pass_changes()
returns trigger
language plpgsql
set search_path = public
as $$
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

  if coalesce(new.tare_weight, 0) < 0
     or coalesce(new.gross_weight, 0) < 0 then
    raise exception 'Weights cannot be negative.';
  end if;

  if new.gross_weight < new.tare_weight then
    raise exception 'Gross weight cannot be less than tare weight.';
  end if;

  -- Database is authoritative for net weight.
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

drop trigger if exists trg_guard_gate_pass_changes
  on public.gate_passes;

create trigger trg_guard_gate_pass_changes
before insert or update or delete
on public.gate_passes
for each row
execute function public.guard_gate_pass_changes();

notify pgrst, 'reload schema';
