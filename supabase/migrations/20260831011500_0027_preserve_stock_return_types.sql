begin;

create or replace function public.apply_stock_movement(
  p_item_id uuid,
  p_warehouse_id uuid,
  p_godown_id uuid,
  p_type text,
  p_qty numeric,
  p_reference text default null
)
returns numeric
language plpgsql
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_stock_id uuid;
  v_godown_name text;
  v_current_quantity numeric := 0;
  v_new_quantity numeric;
  v_effect text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_item_id is null or p_warehouse_id is null or p_godown_id is null then
    raise exception 'Item, warehouse and godown are required.';
  end if;

  if p_type not in (
    'in',
    'out',
    'adjust',
    'purchase_return',
    'sale_return'
  ) then
    raise exception 'Invalid movement type: %', p_type;
  end if;

  if p_qty is null
     or (
       p_type <> 'adjust'
       and p_qty <= 0
     )
     or (
       p_type = 'adjust'
       and p_qty < 0
     ) then
    raise exception 'Invalid quantity.';
  end if;

  if not exists (
    select 1
    from public.items
    where id = p_item_id
  ) then
    raise exception 'Selected item does not exist.';
  end if;

  select g.name
    into v_godown_name
  from public.godowns g
  where g.id = p_godown_id
    and g.warehouse_id = p_warehouse_id;

  if v_godown_name is null then
    raise exception 'Selected godown does not belong to selected warehouse.';
  end if;

  v_effect :=
    case
      when p_type in ('in', 'sale_return') then 'in'
      when p_type in ('out', 'purchase_return') then 'out'
      else 'adjust'
    end;

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_user_id::text || ':' ||
      p_item_id::text || ':' ||
      p_warehouse_id::text || ':' ||
      p_godown_id::text,
      0
    )
  );

  select ws.id, coalesce(ws.quantity, 0)
    into v_stock_id, v_current_quantity
  from public.warehouse_stock ws
  where ws.user_id = v_user_id
    and ws.item_id = p_item_id
    and ws.warehouse_id = p_warehouse_id
    and ws.godown_id = p_godown_id
  limit 1
  for update;

  v_current_quantity := coalesce(v_current_quantity, 0);

  if v_effect = 'in' then
    v_new_quantity := v_current_quantity + p_qty;

  elsif v_effect = 'out' then
    if p_qty > v_current_quantity then
      raise exception
        'Insufficient stock. Available: %, Required: %.',
        v_current_quantity,
        p_qty;
    end if;

    v_new_quantity := v_current_quantity - p_qty;

  else
    v_new_quantity := p_qty;
  end if;

  if v_stock_id is null then
    insert into public.warehouse_stock (
      user_id,
      item_id,
      warehouse_id,
      godown_id,
      godown,
      quantity,
      updated_at
    )
    values (
      v_user_id,
      p_item_id,
      p_warehouse_id,
      p_godown_id,
      v_godown_name,
      v_new_quantity,
      now()
    );
  else
    update public.warehouse_stock
    set
      quantity = v_new_quantity,
      godown = v_godown_name,
      updated_at = now()
    where id = v_stock_id
      and user_id = v_user_id;
  end if;

  insert into public.stock_movements (
    user_id,
    item_id,
    warehouse_id,
    godown_id,
    godown,
    type,
    qty,
    reference
  )
  values (
    v_user_id,
    p_item_id,
    p_warehouse_id,
    p_godown_id,
    v_godown_name,
    p_type,
    p_qty,
    nullif(btrim(p_reference), '')
  );

  return v_new_quantity;
end;
$function$;

revoke all on function public.apply_stock_movement(
  uuid, uuid, uuid, text, numeric, text
) from public;

revoke all on function public.apply_stock_movement(
  uuid, uuid, uuid, text, numeric, text
) from anon;

grant execute on function public.apply_stock_movement(
  uuid, uuid, uuid, text, numeric, text
) to authenticated;

commit;
