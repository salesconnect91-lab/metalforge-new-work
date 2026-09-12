begin;

alter table public.accounting_periods
  drop constraint if exists accounting_periods_user_id_period_start_key,
  drop constraint if exists accounting_periods_user_id_period_end_key;

alter table public.accounting_periods
  add constraint accounting_periods_company_period_start_key unique (company_id, period_start),
  add constraint accounting_periods_company_period_end_key unique (company_id, period_end);

create index if not exists idx_accounting_periods_company_dates
  on public.accounting_periods(company_id, period_start, period_end);

create or replace function public.initialize_accounting_year(p_year integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user_id uuid := public.legacy_data_user_id();
  v_company_id uuid := public.current_company_id();
  v_month date;
  v_count integer := 0;
begin
  perform public.assert_module_permission('accounting','create');
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if v_company_id is null then raise exception 'No active company selected.'; end if;
  if p_year < 2000 or p_year > 2200 then raise exception 'Accounting year is invalid.'; end if;

  for v_month in
    select generate_series(
      pg_catalog.make_date(p_year,1,1),
      pg_catalog.make_date(p_year,12,1),
      interval '1 month'
    )::date
  loop
    insert into public.accounting_periods(
      user_id, company_id, period_name, period_start, period_end, status
    ) values (
      v_user_id,
      v_company_id,
      pg_catalog.to_char(v_month,'Mon YYYY'),
      v_month,
      (v_month + interval '1 month - 1 day')::date,
      'open'
    )
    on conflict (company_id, period_start) do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'success',true,
    'company_id',v_company_id,
    'periods_created',v_count
  );
end;
$function$;

create or replace function public.set_accounting_period_status(p_period_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user_id uuid := public.legacy_data_user_id();
  v_company_id uuid := public.current_company_id();
  v_period public.accounting_periods%rowtype;
  v_old_status text;
begin
  perform public.assert_module_permission('accounting','edit');
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if v_company_id is null then raise exception 'No active company selected.'; end if;
  if p_status not in ('open','closed') then raise exception 'Period status must be open or closed.'; end if;

  select * into v_period
  from public.accounting_periods
  where id=p_period_id
    and user_id=v_user_id
    and company_id=v_company_id
  for update;

  if not found then raise exception 'Accounting period was not found in the active company.'; end if;
  v_old_status := v_period.status;

  if v_old_status = p_status then
    return pg_catalog.jsonb_build_object('success',true,'status',p_status,'unchanged',true);
  end if;

  update public.accounting_periods
  set status=p_status,
      closed_at=case when p_status='closed' then now() else null end,
      closed_by=case when p_status='closed' then auth.uid() else null end,
      updated_at=now()
  where id=p_period_id
    and user_id=v_user_id
    and company_id=v_company_id;

  insert into public.audit_logs(
    user_id,module,action,table_name,record_id,record_name,
    performed_by,old_data,new_data,metadata
  ) values (
    v_user_id,'accounting',upper(p_status),'accounting_periods',
    p_period_id,v_period.period_name,auth.uid(),
    pg_catalog.jsonb_build_object('status',v_old_status),
    pg_catalog.jsonb_build_object('status',p_status),
    pg_catalog.jsonb_build_object(
      'company_id',v_company_id,
      'period_start',v_period.period_start,
      'period_end',v_period.period_end
    )
  );

  return pg_catalog.jsonb_build_object('success',true,'company_id',v_company_id,'status',p_status);
end;
$function$;

create or replace function public.guard_closed_accounting_period()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if new.status='posted'
     and (tg_op='INSERT' or old.status is distinct from 'posted')
     and exists(
       select 1
       from public.accounting_periods ap
       where ap.company_id=new.company_id
         and new.entry_date between ap.period_start and ap.period_end
         and ap.status='closed'
     )
     and not (
       new.fiscal_year_closure_id is not null
       and exists(
         select 1
         from public.fiscal_year_closures fy
         where fy.id=new.fiscal_year_closure_id
           and fy.company_id=new.company_id
           and fy.business_unit_id=new.business_unit_id
           and fy.status='processing'
           and fy.year_end=new.entry_date
       )
     ) then
    raise exception 'Accounting period for % is closed. Reopen the period before posting.',new.entry_date;
  end if;
  return new;
end;
$function$;

commit;
