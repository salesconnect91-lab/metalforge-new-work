create or replace function public.create_customer_with_ar(
  p_name text,
  p_email text default null::text,
  p_phone text default null::text,
  p_address text default null::text
)
returns public.customers
language plpgsql
set search_path = public
as $function$
declare
  v_user_id uuid;
  v_ar_account_id uuid;
  v_customer public.customers;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'User is not authenticated';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Customer name is required';
  end if;

  select am.account_id
  into v_ar_account_id
  from public.account_mappings am
  where am.user_id = v_user_id
    and am.mapping_key = 'accounts_receivable'
  limit 1;

  if v_ar_account_id is null then
    raise exception 'Accounts Receivable mapping is not configured';
  end if;

  insert into public.customers (
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
    v_ar_account_id
  )
  returning *
  into v_customer;

  return v_customer;
end;
$function$;
