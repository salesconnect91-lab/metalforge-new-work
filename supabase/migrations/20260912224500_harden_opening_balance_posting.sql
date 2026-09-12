create or replace function public.enforce_journal_core_rules()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_policy public.company_accounting_policies%rowtype;
  v_debit numeric;
  v_credit numeric;
  v_closed boolean;
  v_is_controlled_opening boolean := lower(coalesce(new.trans_type,'')) in ('opening balance','opening_balance');
begin
  select * into v_policy from public.company_accounting_policies where company_id=new.company_id;
  if not found then
    insert into public.company_accounting_policies(company_id) values(new.company_id) returning * into v_policy;
  end if;

  if new.status='posted' then
    if v_policy.enforce_period_lock then
      select exists(
        select 1 from public.accounting_periods p
        where p.company_id=new.company_id
          and p.status='closed'
          and new.entry_date between p.period_start and p.period_end
      ) into v_closed;
      if v_closed then raise exception 'Accounting period is closed for %.',new.entry_date; end if;
    end if;

    if not v_is_controlled_opening
       and v_policy.backdate_days >= 0
       and new.entry_date < current_date - v_policy.backdate_days then
      raise exception 'Posting date exceeds allowed backdating policy (% days).',v_policy.backdate_days;
    end if;

    if v_policy.enforce_balanced_journals then
      select coalesce(sum(debit),0),coalesce(sum(credit),0)
      into v_debit,v_credit
      from public.journal_lines where entry_id=new.id;
      if abs(v_debit-v_credit) >= 0.01 or (v_debit=0 and v_credit=0) then
        raise exception 'Journal entry must be balanced before posting. Debit %, Credit %.',v_debit,v_credit;
      end if;
    end if;

    if new.posted_at is null then new.posted_at:=now(); end if;
    if new.posted_by is null then new.posted_by:=auth.uid(); end if;
  end if;
  return new;
end;
$function$;

create or replace function public.post_opening_balances(p_opening_date date, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=public.legacy_data_user_id();
  v_company uuid:=public.current_company_id();
  v_unit uuid:=public.current_business_unit_id();
  v_location uuid:=public.current_operating_location_id();
  v_year int;
  v_debit numeric;
  v_credit numeric;
  v_journal uuid;
  v_result jsonb;
  x jsonb;
  v_account uuid;
  v_party_type text;
  v_party uuid;
  v_party_name text;
  coa public.chart_of_accounts%rowtype;
  v_ar uuid;
  v_ap uuid;
  v_unit_code text;
begin
  perform public.assert_module_permission('accounting','post');
  if v_user is null or v_company is null or v_unit is null or v_location is null then
    raise exception 'Authentication, active company, business unit and branch are required.';
  end if;
  if p_opening_date is null or extract(month from p_opening_date)<>1 or extract(day from p_opening_date)<>1 then
    raise exception 'Opening balance date must be January 1.';
  end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<2 then
    raise exception 'At least two opening lines are required.';
  end if;
  v_year:=extract(year from p_opening_date);

  if exists(select 1 from public.opening_balance_batches where company_id=v_company and business_unit_id=v_unit and opening_year=v_year) then
    raise exception 'Opening balances are already posted for this business unit/year.';
  end if;
  if exists(select 1 from public.ledgers where company_id=v_company and business_unit_id=v_unit and entry_date<p_opening_date)
     and not exists(select 1 from public.fiscal_year_closures where company_id=v_company and business_unit_id=v_unit and fiscal_year=v_year-1 and status='closed') then
    raise exception 'Prior activity exists in this business unit. Close previous financial year instead.';
  end if;

  select account_id into v_ar from public.account_mappings where user_id=v_user and company_id=v_company and mapping_key='accounts_receivable';
  select account_id into v_ap from public.account_mappings where user_id=v_user and company_id=v_company and mapping_key='accounts_payable';

  select round(sum(coalesce((value->>'debit')::numeric,0)),2),
         round(sum(coalesce((value->>'credit')::numeric,0)),2)
  into v_debit,v_credit from jsonb_array_elements(p_lines);
  if v_debit<=0 or abs(v_debit-v_credit)>=.01 then
    raise exception 'Opening balances must have equal positive debit and credit totals.';
  end if;

  select upper(regexp_replace(coalesce(code,'BU'),'[^A-Za-z0-9]+','','g'))
  into v_unit_code from public.business_units where id=v_unit and company_id=v_company;
  v_unit_code:=coalesce(nullif(v_unit_code,''),'BU');

  insert into public.journal_entries(
    user_id,company_id,business_unit_id,operating_location_id,entry_no,entry_date,description,status,trans_type,source_module,source_document_type
  ) values(
    v_user,v_company,v_unit,v_location,'OB-'||v_year||'-'||v_unit_code,p_opening_date,
    'Opening balances '||v_year,'draft','Opening Balance','accounting','opening_balances'
  ) returning id into v_journal;

  for x in select value from jsonb_array_elements(p_lines) loop
    v_account:=(x->>'account_id')::uuid;
    v_party_type:=nullif(lower(trim(x->>'party_type')),'');
    v_party:=nullif(x->>'party_id','')::uuid;
    v_party_name:=nullif(trim(x->>'party_name'),'');

    select * into coa from public.chart_of_accounts
    where id=v_account and user_id=v_user and company_id=v_company and is_active=true and is_group=false;
    if not found then raise exception 'Invalid opening balance account.'; end if;
    if coa.type in ('revenue','expense') then
      raise exception 'Revenue and expense accounts cannot carry opening balances. Use retained earnings/equity after year close.';
    end if;
    if coalesce((x->>'debit')::numeric,0)<0 or coalesce((x->>'credit')::numeric,0)<0
       or (coalesce((x->>'debit')::numeric,0)>0 and coalesce((x->>'credit')::numeric,0)>0)
       or (coalesce((x->>'debit')::numeric,0)<=0 and coalesce((x->>'credit')::numeric,0)<=0) then
      raise exception 'Each opening line must contain exactly one positive Debit or Credit amount.';
    end if;

    if v_account=v_ar then
      if v_party_type is distinct from 'customer' or v_party is null then
        raise exception 'Accounts Receivable opening balances require a Customer.';
      end if;
      if not exists(select 1 from public.customers c where c.id=v_party and c.company_id=v_company and c.account_id=v_ar and c.is_active=true) then
        raise exception 'Invalid customer on Accounts Receivable opening balance.';
      end if;
      select name into v_party_name from public.customers where id=v_party and company_id=v_company;
    elsif v_account=v_ap then
      if v_party_type is distinct from 'supplier' or v_party is null then
        raise exception 'Accounts Payable opening balances require a Supplier.';
      end if;
      if not exists(select 1 from public.suppliers s where s.id=v_party and s.company_id=v_company and s.account_id=v_ap and s.is_active=true) then
        raise exception 'Invalid supplier on Accounts Payable opening balance.';
      end if;
      select name into v_party_name from public.suppliers where id=v_party and company_id=v_company;
    elsif v_party is not null or v_party_type is not null then
      raise exception 'Party can only be selected on Accounts Receivable or Accounts Payable opening lines.';
    end if;

    insert into public.journal_lines(
      user_id,company_id,business_unit_id,operating_location_id,entry_id,account_id,account,debit,credit,party_type,party_id,party_name
    ) values(
      v_user,v_company,v_unit,v_location,v_journal,coa.id,coa.code||' - '||coa.name,
      round(coalesce((x->>'debit')::numeric,0),2),round(coalesce((x->>'credit')::numeric,0),2),
      v_party_type,v_party,v_party_name
    );
  end loop;

  v_result:=public.post_journal_entry(v_journal);
  insert into public.opening_balance_batches(user_id,company_id,business_unit_id,opening_year,opening_date,journal_entry_id,total_debit,total_credit)
  values(v_user,v_company,v_unit,v_year,p_opening_date,v_journal,v_debit,v_credit);

  insert into public.audit_logs(user_id,module,action,table_name,record_id,record_name,performed_by,new_data,metadata)
  values(v_user,'accounting','POST_OPENING_BALANCES','opening_balance_batches',v_journal,'Opening balances '||v_year,auth.uid(),
         jsonb_build_object('total_debit',v_debit,'total_credit',v_credit),
         jsonb_build_object('company_id',v_company,'business_unit_id',v_unit,'operating_location_id',v_location,'opening_year',v_year));

  return jsonb_build_object('success',true,'journal_entry_id',v_journal,'business_unit_id',v_unit,'operating_location_id',v_location,'total_debit',v_debit,'total_credit',v_credit,'post_result',v_result);
end;
$function$;
