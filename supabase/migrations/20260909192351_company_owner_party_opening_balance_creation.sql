create or replace function public.create_party_with_opening_balance_v2(
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
set search_path to 'public','pg_temp'
as $function$
declare
  v_party_type text := lower(trim(coalesce(p_party_type,'')));
  v_side text := lower(trim(coalesce(p_balance_side,'')));
  v_name text := trim(coalesce(p_name,''));
  v_amount numeric := round(coalesce(p_opening_amount,0),2);
  v_company uuid := public.current_company_id();
  v_bu uuid := public.current_business_unit_id();
  v_uid uuid := public.legacy_data_user_id();
  v_party_id uuid;
  v_ar uuid;
  v_ap uuid;
  v_obe uuid;
  v_entry uuid;
  v_entry_no text;
  v_result jsonb;
  v_customer public.customers;
  v_supplier public.suppliers;
begin
  perform public.assert_module_permission('master','create');
  perform public.assert_module_permission('accounting','post');

  if auth.uid() is null or v_company is null or v_bu is null or v_uid is null then
    raise exception 'Authentication, active company and business unit are required.';
  end if;
  if v_party_type not in ('customer','supplier') then raise exception 'Party type must be customer or supplier.'; end if;
  if v_name='' then raise exception 'Party name is required.'; end if;
  if v_amount<0 then raise exception 'Opening balance cannot be negative. Use Debit or Credit side with a positive amount.'; end if;
  if v_side not in ('debit','credit') then raise exception 'Balance side must be debit or credit.'; end if;
  if p_opening_date is null then raise exception 'Opening date is required.'; end if;

  if v_party_type='customer' then
    if exists(select 1 from public.customers where company_id=v_company and lower(trim(name))=lower(v_name)) then
      raise exception 'Customer "%" already exists in the active company.',v_name;
    end if;
    v_customer := public.create_customer_with_ar(v_name,p_email,p_phone,p_address);
    v_party_id := v_customer.id;
    update public.customers set name_urdu=coalesce(nullif(trim(coalesce(p_name_urdu,'')),''),public.english_to_urdu_name(v_name)) where id=v_party_id and company_id=v_company;
  else
    if exists(select 1 from public.suppliers where company_id=v_company and lower(trim(name))=lower(v_name)) then
      raise exception 'Supplier "%" already exists in the active company.',v_name;
    end if;
    v_supplier := public.create_supplier_with_ap(v_name,p_email,p_phone,p_address);
    v_party_id := v_supplier.id;
    update public.suppliers set name_urdu=coalesce(nullif(trim(coalesce(p_name_urdu,'')),''),public.english_to_urdu_name(v_name)) where id=v_party_id and company_id=v_company;
  end if;

  if v_amount=0 then
    return jsonb_build_object('success',true,'party_id',v_party_id,'party_type',v_party_type,'opening_amount',0,'opening_posted',false);
  end if;

  select account_id into v_ar from public.account_mappings where company_id=v_company and user_id=v_uid and mapping_key='accounts_receivable' limit 1;
  select account_id into v_ap from public.account_mappings where company_id=v_company and user_id=v_uid and mapping_key='accounts_payable' limit 1;
  if v_party_type='customer' and v_ar is null then raise exception 'Accounts Receivable mapping is missing.'; end if;
  if v_party_type='supplier' and v_ap is null then raise exception 'Accounts Payable mapping is missing.'; end if;

  select account_id into v_obe from public.account_mappings where company_id=v_company and user_id=v_uid and mapping_key='opening_balance_equity' limit 1;
  if v_obe is null then
    select id into v_obe from public.chart_of_accounts where company_id=v_company and user_id=v_uid and (code='3300' or lower(trim(name))='opening balance equity') and is_active=true and is_group=false order by case when code='3300' then 0 else 1 end limit 1;
  end if;
  if v_obe is null then
    insert into public.chart_of_accounts(user_id,company_id,code,name,type,account_role,is_group,normal_balance,allow_manual_entries,is_system_account,is_active,description)
    values(v_uid,v_company,'3300','Opening Balance Equity','equity','general',false,'credit',true,false,true,'System balancing account used only for opening balance migration.')
    returning id into v_obe;
  end if;
  insert into public.account_mappings(user_id,company_id,mapping_key,account_id)
  values(v_uid,v_company,'opening_balance_equity',v_obe)
  on conflict do nothing;

  perform pg_advisory_xact_lock(hashtextextended(v_company::text||':'||v_bu::text||':opening-party:'||to_char(p_opening_date,'YYYYMMDD'),0));
  v_entry_no := 'OBP-'||to_char(p_opening_date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.journal_entries(user_id,company_id,business_unit_id,entry_no,entry_date,description,status,party_name,trans_type,source_module,source_document_type)
  values(v_uid,v_company,v_bu,v_entry_no,p_opening_date,'Opening balance - '||v_name,'draft',v_name,'Opening Balance','accounting','party_opening_balance')
  returning id into v_entry;

  insert into public.journal_lines(user_id,company_id,business_unit_id,entry_id,account_id,account,debit,credit,party_type,party_id,party_name)
  select v_uid,v_company,v_bu,v_entry,coa.id,coa.code||' - '||coa.name,
         case when v_side='debit' then v_amount else 0 end,
         case when v_side='credit' then v_amount else 0 end,
         v_party_type,v_party_id,v_name
  from public.chart_of_accounts coa
  where coa.id=case when v_party_type='customer' then v_ar else v_ap end and coa.company_id=v_company;

  insert into public.journal_lines(user_id,company_id,business_unit_id,entry_id,account_id,account,debit,credit)
  select v_uid,v_company,v_bu,v_entry,coa.id,coa.code||' - '||coa.name,
         case when v_side='credit' then v_amount else 0 end,
         case when v_side='debit' then v_amount else 0 end
  from public.chart_of_accounts coa where coa.id=v_obe and coa.company_id=v_company;

  select public.post_journal_entry(v_entry) into v_result;

  return jsonb_build_object('success',true,'party_id',v_party_id,'party_type',v_party_type,'opening_amount',v_amount,'balance_side',v_side,'opening_date',p_opening_date,'opening_posted',true,'journal_entry_id',v_entry,'journal_entry_no',v_entry_no,'post_result',v_result);
end;
$function$;

revoke all on function public.create_party_with_opening_balance_v2(text,text,text,text,text,text,numeric,text,date) from public,anon;
grant execute on function public.create_party_with_opening_balance_v2(text,text,text,text,text,text,numeric,text,date) to authenticated,service_role;
