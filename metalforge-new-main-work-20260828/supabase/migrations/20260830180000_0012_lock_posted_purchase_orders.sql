-- Lock posted purchase orders and their lines against direct modification.

create or replace function public.prevent_posted_purchase_order_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'posted' then
    raise exception 'Posted purchase orders cannot be modified or deleted.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_lock_posted_purchase_orders
on public.purchase_orders;

create trigger trg_lock_posted_purchase_orders
before update or delete
on public.purchase_orders
for each row
execute function public.prevent_posted_purchase_order_changes();


create or replace function public.prevent_posted_purchase_order_line_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order_id uuid;
  v_status text;
begin
  v_order_id := case
    when tg_op = 'DELETE' then old.order_id
    else new.order_id
  end;

  select po.status
  into v_status
  from public.purchase_orders po
  where po.id = v_order_id;

  if v_status = 'posted' then
    raise exception 'Lines of a posted purchase order cannot be modified.';
  end if;

  -- Also prevent moving an existing line away from a posted order.
  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    select po.status
    into v_status
    from public.purchase_orders po
    where po.id = old.order_id;

    if v_status = 'posted' then
      raise exception 'Lines of a posted purchase order cannot be modified.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_lock_posted_purchase_order_lines
on public.purchase_order_lines;

create trigger trg_lock_posted_purchase_order_lines
before insert or update or delete
on public.purchase_order_lines
for each row
execute function public.prevent_posted_purchase_order_line_changes();
