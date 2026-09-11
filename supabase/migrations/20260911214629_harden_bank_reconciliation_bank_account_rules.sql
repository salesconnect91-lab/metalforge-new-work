create or replace function public.create_bank_reconciliation(
  p_account_id uuid,
  p_statement_start date,
  p_statement_end date,
  p_opening_balance numeric,
  p_closing_balance numeric,
  p_notes text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := public.legacy_data_user_id();
  v_company uuid := public.current_company_id();
  v_unit uuid := public.current_business_unit_id();
  v_id uuid;
begin
  perform public.assert_module_permission('accounting', 'create');
  if v_user is null or v_company is null or v_unit is null then
    raise exception 'Authentication, active company and business unit are required.';
  end if;
  if p_account_id is null or p_statement_start is null or p_statement_end is null then
    raise exception 'Bank account and statement dates are required.';
  end if;
  if p_statement_end < p_statement_start then
    raise exception 'Statement end cannot be before statement start.';
  end if;

  if not exists (
    select 1
    from public.chart_of_accounts coa
    where coa.id = p_account_id
      and coa.user_id = v_user
      and coa.company_id = v_company
      and coa.is_active = true
      and coa.is_group = false
      and coa.type = 'asset'
      and (
        lower(coalesce(coa.detail_type, '')) = 'bank account'
        or exists (
          select 1
          from public.account_mappings am
          where am.user_id = v_user
            and am.company_id = v_company
            and am.mapping_key = 'bank'
            and am.account_id = coa.id
        )
      )
  ) then
    raise exception 'Select an active posting bank account.';
  end if;

  if exists (
    select 1 from public.bank_reconciliations br
    where br.user_id = v_user
      and br.company_id = v_company
      and br.business_unit_id = v_unit
      and br.account_id = p_account_id
      and br.status = 'draft'
  ) then
    raise exception 'Complete or cancel the existing draft reconciliation for this bank account.';
  end if;

  if exists (
    select 1 from public.bank_reconciliations br
    where br.user_id = v_user
      and br.company_id = v_company
      and br.business_unit_id = v_unit
      and br.account_id = p_account_id
      and br.status = 'closed'
      and daterange(br.statement_start, br.statement_end, '[]') && daterange(p_statement_start, p_statement_end, '[]')
  ) then
    raise exception 'This statement period overlaps a closed reconciliation.';
  end if;

  insert into public.bank_reconciliations(
    user_id, company_id, business_unit_id, account_id,
    statement_start, statement_end,
    opening_statement_balance, closing_statement_balance,
    calculated_statement_balance, difference, notes
  ) values (
    v_user, v_company, v_unit, p_account_id,
    p_statement_start, p_statement_end,
    round(coalesce(p_opening_balance, 0), 2),
    round(coalesce(p_closing_balance, 0), 2),
    round(coalesce(p_opening_balance, 0), 2),
    round(coalesce(p_closing_balance, 0) - coalesce(p_opening_balance, 0), 2),
    nullif(btrim(coalesce(p_notes, '')), '')
  ) returning id into v_id;

  return jsonb_build_object(
    'success', true,
    'reconciliation_id', v_id,
    'company_id', v_company,
    'business_unit_id', v_unit
  );
end;
$function$;

revoke all on function public.create_bank_reconciliation(uuid,date,date,numeric,numeric,text) from public, anon;
grant execute on function public.create_bank_reconciliation(uuid,date,date,numeric,numeric,text) to authenticated;
