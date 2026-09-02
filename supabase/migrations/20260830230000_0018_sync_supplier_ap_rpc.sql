create or replace function public.create_supplier_with_ap(
  p_name text,
  p_email text default null::text,
  p_phone text default null::text,
  p_address text default null::text
)
returns public.suppliers
language plpgsql
set search_path = public
as $function$
declare
  v_user_id uuid;
  v_ap_account_id uuid;
  v_supplier public.suppliers;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'User is not authenticated';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Supplier name is required';
  end if;

  select am.account_id
  into v_ap_account_id
  from public.account_mappings am
  where am.user_id = v_user_id
    and am.mapping_key = 'accounts_payable'
  limit 1;

  if v_ap_account_id is null then
    raise exception 'Accounts Payable mapping is not configured';
  end if;

  insert into public.suppliers (
    user_id,
    name,
    email,
    phone,
    address,
    account_id
  )
  values (
    v_user_id,
    trim(p_name),
    nullif(trim(p_email), ''),
    nullif(trim(p_phone), ''),
    nullif(trim(p_address), ''),
    v_ap_account_id
  )
  returning *
  into v_supplier;

  return v_supplier;
end;
$function$;

revoke all on function public.create_supplier_with_ap(text,text,text,text) from public;
revoke all on function public.create_supplier_with_ap(text,text,text,text) from anon;
grant execute on function public.create_supplier_with_ap(text,text,text,text) to authenticated;
