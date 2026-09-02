begin;

create table if not exists public.fiscal_year_closures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fiscal_year integer not null check (fiscal_year between 2000 and 2200),
  year_start date not null,
  year_end date not null,
  status text not null default 'processing' check (status in ('processing','closed')),
  net_profit_loss numeric(14,2) not null default 0,
  retained_earnings_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  closing_journal_id uuid references public.journal_entries(id) on delete restrict,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(user_id,fiscal_year),
  check(year_end>=year_start)
);

alter table public.journal_entries add column if not exists fiscal_year_closure_id uuid references public.fiscal_year_closures(id) on delete restrict;

create table if not exists public.fiscal_year_opening_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  closure_id uuid not null references public.fiscal_year_closures(id) on delete cascade,
  opening_year integer not null,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  debit_balance numeric(14,2) not null default 0,
  credit_balance numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(closure_id,account_id),
  check(debit_balance>=0 and credit_balance>=0 and not(debit_balance>0 and credit_balance>0))
);

create index if not exists idx_fiscal_closures_user_year on public.fiscal_year_closures(user_id,fiscal_year desc);
create index if not exists idx_fiscal_opening_year on public.fiscal_year_opening_balances(user_id,opening_year,account_id);
alter table public.fiscal_year_closures enable row level security;
alter table public.fiscal_year_opening_balances enable row level security;
drop policy if exists fiscal_closures_select_own on public.fiscal_year_closures;
create policy fiscal_closures_select_own on public.fiscal_year_closures for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists fiscal_opening_select_own on public.fiscal_year_opening_balances;
create policy fiscal_opening_select_own on public.fiscal_year_opening_balances for select to authenticated using ((select auth.uid())=user_id);
revoke insert,update,delete on public.fiscal_year_closures,public.fiscal_year_opening_balances from authenticated,anon;
grant select on public.fiscal_year_closures,public.fiscal_year_opening_balances to authenticated;

create or replace function public.guard_closed_accounting_period()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='posted' and (tg_op='INSERT' or old.status is distinct from 'posted')
     and exists(select 1 from public.accounting_periods ap where ap.user_id=new.user_id and new.entry_date between ap.period_start and ap.period_end and ap.status='closed')
     and not (
       new.fiscal_year_closure_id is not null and exists(
         select 1 from public.fiscal_year_closures fy
         where fy.id=new.fiscal_year_closure_id and fy.user_id=new.user_id and fy.status='processing' and fy.year_end=new.entry_date
       )
     ) then
    raise exception 'Accounting period for % is closed. Reopen the period before posting.',new.entry_date;
  end if;
  return new;
end; $$;

create or replace function public.guard_fiscal_year_period_reopen()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status='closed' and new.status='open' and exists(
    select 1 from public.fiscal_year_closures fy where fy.user_id=new.user_id and fy.status='closed' and new.period_start>=fy.year_start and new.period_end<=fy.year_end
  ) then raise exception 'This period belongs to a closed financial year and cannot be reopened.'; end if;
  return new;
end; $$;
drop trigger if exists trg_guard_fiscal_year_period_reopen on public.accounting_periods;
create trigger trg_guard_fiscal_year_period_reopen before update of status on public.accounting_periods for each row execute function public.guard_fiscal_year_period_reopen();

create or replace function public.close_fiscal_year(p_fiscal_year integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid(); v_start date; v_end date; v_closure uuid; v_journal uuid; v_retained uuid;
  v_net numeric:=0; v_debits numeric:=0; v_credits numeric:=0; v_trial_difference numeric:=0; v_line_count integer:=0; r record;
begin
  if v_user is null then raise exception 'Authentication is required.'; end if;
  if p_fiscal_year<2000 or p_fiscal_year>2200 then raise exception 'Invalid financial year.'; end if;
  v_start:=make_date(p_fiscal_year,1,1); v_end:=make_date(p_fiscal_year,12,31);
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||':fiscal-close:'||p_fiscal_year::text,0));
  if exists(select 1 from public.fiscal_year_closures where user_id=v_user and fiscal_year=p_fiscal_year) then raise exception 'Financial year % has already been closed or is being processed.',p_fiscal_year; end if;
  if (select count(*) from public.accounting_periods where user_id=v_user and period_start>=v_start and period_end<=v_end)<>12
     or exists(select 1 from public.accounting_periods where user_id=v_user and period_start>=v_start and period_end<=v_end and status<>'closed') then
    raise exception 'All 12 monthly accounting periods must exist and be closed first.';
  end if;
  if exists(select 1 from public.journal_entries where user_id=v_user and entry_date between v_start and v_end and status='draft') then raise exception 'Draft journal entries exist in this year. Post or delete them before closing.'; end if;
  select round(coalesce(sum(debit-credit),0),2) into v_trial_difference from public.ledgers
  where user_id=v_user and entry_date between v_start and v_end;
  if abs(v_trial_difference)>=0.01 then raise exception 'Trial Balance is not balanced for %. Difference: %',p_fiscal_year,v_trial_difference; end if;
  if exists(
    select 1 from public.journal_entries je
    where je.user_id=v_user and je.entry_date between v_start and v_end and je.status='posted'
      and ((select count(*) from public.journal_lines jl where jl.user_id=v_user and jl.entry_id=je.id)
           <> (select count(*) from public.ledgers l where l.user_id=v_user and l.journal_entry_id=je.id))
  ) then raise exception 'One or more posted journals are not fully represented in the General Ledger.'; end if;
  select am.account_id into v_retained from public.account_mappings am join public.chart_of_accounts coa on coa.id=am.account_id
  where am.user_id=v_user and am.mapping_key='retained_earnings' and coa.user_id=v_user and coa.type='equity' and coa.is_active=true and coa.is_group=false;
  if v_retained is null then raise exception 'Active Retained Earnings account mapping is required.'; end if;
  select round(coalesce(sum(l.credit-l.debit),0),2) into v_net
  from public.ledgers l join public.chart_of_accounts coa on coa.id=l.account_id and coa.user_id=v_user
  where l.user_id=v_user and l.entry_date between v_start and v_end and coa.type in('revenue','expense');
  insert into public.fiscal_year_closures(user_id,fiscal_year,year_start,year_end,status,net_profit_loss,retained_earnings_account_id)
  values(v_user,p_fiscal_year,v_start,v_end,'processing',v_net,v_retained) returning id into v_closure;
  insert into public.journal_entries(user_id,entry_no,entry_date,description,status,trans_type,fiscal_year_closure_id)
  values(v_user,'YEC-'||p_fiscal_year,v_end,'Financial year closing '||p_fiscal_year,'draft','Year End Closing',v_closure) returning id into v_journal;
  for r in
    select coa.id,coa.code,coa.name,round(sum(l.debit-l.credit),2) as net_debit
    from public.ledgers l join public.chart_of_accounts coa on coa.id=l.account_id and coa.user_id=v_user
    where l.user_id=v_user and l.entry_date between v_start and v_end and coa.type in('revenue','expense')
    group by coa.id,coa.code,coa.name having abs(round(sum(l.debit-l.credit),2))>=0.01 order by coa.code
  loop
    insert into public.journal_lines(user_id,entry_id,account_id,account,debit,credit)
    values(v_user,v_journal,r.id,r.code||' - '||r.name,case when r.net_debit<0 then abs(r.net_debit) else 0 end,case when r.net_debit>0 then r.net_debit else 0 end);
    v_line_count:=v_line_count+1;
  end loop;
  if abs(v_net)>=0.01 then
    insert into public.journal_lines(user_id,entry_id,account_id,account,debit,credit)
    select v_user,v_journal,coa.id,coa.code||' - '||coa.name,case when v_net<0 then abs(v_net) else 0 end,case when v_net>0 then v_net else 0 end
    from public.chart_of_accounts coa where coa.id=v_retained;
    v_line_count:=v_line_count+1;
  end if;
  if v_line_count>0 then
    select round(sum(debit),2),round(sum(credit),2) into v_debits,v_credits from public.journal_lines where entry_id=v_journal and user_id=v_user;
    if abs(v_debits-v_credits)>=0.01 then raise exception 'Generated year-end journal is not balanced.'; end if;
    insert into public.ledgers(user_id,journal_entry_id,journal_line_id,account_id,entry_date,description,debit,credit)
    select v_user,v_journal,jl.id,jl.account_id,v_end,'YEC-'||p_fiscal_year||' - Financial year closing',jl.debit,jl.credit
    from public.journal_lines jl where jl.entry_id=v_journal and jl.user_id=v_user;
    update public.journal_entries set status='posted' where id=v_journal and user_id=v_user;
  else
    delete from public.journal_entries where id=v_journal and user_id=v_user;
    v_journal:=null;
  end if;
  update public.fiscal_year_closures set status='closed',closing_journal_id=v_journal,closed_at=now(),closed_by=v_user where id=v_closure;
  insert into public.fiscal_year_opening_balances(user_id,closure_id,opening_year,account_id,debit_balance,credit_balance)
  select v_user,v_closure,p_fiscal_year+1,coa.id,greatest(round(sum(l.debit-l.credit),2),0),greatest(round(sum(l.credit-l.debit),2),0)
  from public.ledgers l join public.chart_of_accounts coa on coa.id=l.account_id and coa.user_id=v_user
  where l.user_id=v_user and l.entry_date<=v_end and coa.type in('asset','liability','equity')
  group by coa.id having abs(round(sum(l.debit-l.credit),2))>=0.01;
  insert into public.audit_logs(user_id,module,action,table_name,record_id,record_name,performed_by,new_data,metadata)
  values(v_user,'accounting','CLOSE_YEAR','fiscal_year_closures',v_closure,p_fiscal_year::text,v_user,
    jsonb_build_object('status','closed','net_profit_loss',v_net),jsonb_build_object('closing_journal_id',v_journal,'opening_year',p_fiscal_year+1));
  return jsonb_build_object('success',true,'closure_id',v_closure,'fiscal_year',p_fiscal_year,'net_profit_loss',v_net,'closing_journal_id',v_journal,'opening_year',p_fiscal_year+1);
end; $$;

revoke all on function public.close_fiscal_year(integer) from public,anon;
revoke all on function public.guard_fiscal_year_period_reopen() from public,anon,authenticated;
grant execute on function public.close_fiscal_year(integer) to authenticated;
notify pgrst,'reload schema';
commit;
