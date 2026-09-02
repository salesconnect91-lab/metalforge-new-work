create or replace function public.next_purchase_order_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_next integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':purchase_order_no'));

  select coalesce(
    max(
      case
        when order_no ~ '^PO-[0-9]+$'
        then substring(order_no from 4)::integer
        else null
      end
    ),
    0
  ) + 1
  into v_next
  from public.purchase_orders
  where user_id = v_user_id;

  return 'PO-' || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function public.next_purchase_order_no() from public;
grant execute on function public.next_purchase_order_no() to authenticated;
