create or replace function public.create_party_with_opening_balance(
  p_party_type text,
  p_name text,
  p_name_urdu text default null,
  p_email text default null,
  p_phone text default null,
  p_address text default null,
  p_opening_amount numeric default 0,
  p_balance_side text default 'debit',
  p_opening_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_party_type text := lower(trim(coalesce(p_party_type,'')));
  v_side text := lower(trim(coalesce(p_balance_side,'')));
  v_name text := trim(coalesce(p_name,''));
  v_urdu text := nullif(trim(coalesce(p_name_urdu,'')), '');
  v_amount numeric := round(coalesce(p_opening_amount,0),2);
  v_party_id uuid;
  v_import jsonb := null;
  v_customer public.customers;
  v_supplier public.suppliers;
begin
  if not public.is_platform_owner() then raise exception 'Only the software platform owner can create a party with an opening balance.'; end if;
  if public.current_company_id() is null then raise exception 'No active company selected.'; end if;
  if v_party_type not in ('customer','supplier') then raise exception 'Party type must be customer or supplier.'; end if;
  if v_name = '' then raise exception 'Party name is required.'; end if;
  if v_amount < 0 then raise exception 'Opening balance cannot be negative. Use Debit or Credit side with a positive amount.'; end if;
  if v_side not in ('debit','credit') then raise exception 'Balance side must be debit or credit.'; end if;
  if p_opening_date is null then raise exception 'Opening date is required.'; end if;

  if v_party_type = 'customer' then
    if exists (select 1 from public.customers c where c.company_id=public.current_company_id() and lower(trim(c.name))=lower(v_name)) then raise exception 'Customer "%" already exists in the selected company.',v_name; end if;
    v_customer := public.create_customer_with_ar(v_name,p_email,p_phone,p_address);
    v_party_id := v_customer.id;
    update public.customers set name_urdu=coalesce(v_urdu,public.english_to_urdu_name(v_name)) where id=v_party_id;
  else
    if exists (select 1 from public.suppliers s where s.company_id=public.current_company_id() and lower(trim(s.name))=lower(v_name)) then raise exception 'Supplier "%" already exists in the selected company.',v_name; end if;
    v_supplier := public.create_supplier_with_ap(v_name,p_email,p_phone,p_address);
    v_party_id := v_supplier.id;
    update public.suppliers set name_urdu=coalesce(v_urdu,public.english_to_urdu_name(v_name)) where id=v_party_id;
  end if;

  if v_amount > 0 then
    v_import := public.import_opening_party_balances(p_opening_date,jsonb_build_array(jsonb_build_object(
      'party_type',v_party_type,'name',v_name,'name_urdu',coalesce(v_urdu,public.english_to_urdu_name(v_name)),
      'amount',v_amount,'side',v_side,'email',nullif(trim(coalesce(p_email,'')),''),'phone',nullif(trim(coalesce(p_phone,'')),''),'address',nullif(trim(coalesce(p_address,'')),'')
    )));
  end if;

  return jsonb_build_object('success',true,'party_id',v_party_id,'party_type',v_party_type,'opening_amount',v_amount,'balance_side',v_side,'opening_date',p_opening_date,'opening_posting',v_import);
end;
$$;

revoke all on function public.create_party_with_opening_balance(text,text,text,text,text,text,numeric,text,date) from public, anon;
grant execute on function public.create_party_with_opening_balance(text,text,text,text,text,text,numeric,text,date) to authenticated;
