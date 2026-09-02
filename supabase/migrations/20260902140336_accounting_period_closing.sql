create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period_name text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (user_id, period_start),
  unique (user_id, period_end)
);

alter table public.accounting_periods enable row level security;

create index if not exists idx_accounting_periods_user_dates
  on public.accounting_periods (user_id, period_start, period_end);

drop policy if exists "select_own_accounting_periods" on public.accounting_periods;
create policy "select_own_accounting_periods"
on public.accounting_periods for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.accounting_periods from anon;
revoke insert, update, delete on public.accounting_periods from authenticated;
grant select on public.accounting_periods to authenticated;

create or replace function public.initialize_accounting_year(p_year integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_month date;
  v_count integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_year < 2000 or p_year > 2200 then raise exception 'Accounting year is invalid.'; end if;

  for v_month in
    select generate_series(
      pg_catalog.make_date(p_year, 1, 1),
      pg_catalog.make_date(p_year, 12, 1),
      interval '1 month'
    )::date
  loop
    insert into public.accounting_periods (
      user_id, period_name, period_start, period_end, status
    ) values (
      v_user_id,
      pg_catalog.to_char(v_month, 'Mon YYYY'),
      v_month,
      (v_month + interval '1 month - 1 day')::date,
      'open'
    ) on conflict (user_id, period_start) do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;

  return pg_catalog.jsonb_build_object('success', true, 'periods_created', v_count);
end;
$$;

create or replace function public.set_accounting_period_status(
  p_period_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_period public.accounting_periods%rowtype;
  v_old_status text;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_status not in ('open', 'closed') then raise exception 'Period status must be open or closed.'; end if;

  select * into v_period
  from public.accounting_periods
  where id = p_period_id and user_id = v_user_id
  for update;

  if not found then raise exception 'Accounting period was not found.'; end if;
  v_old_status := v_period.status;

  if v_old_status = p_status then
    return pg_catalog.jsonb_build_object('success', true, 'status', p_status, 'unchanged', true);
  end if;

  update public.accounting_periods
  set status = p_status,
      closed_at = case when p_status = 'closed' then now() else null end,
      closed_by = case when p_status = 'closed' then v_user_id else null end,
      updated_at = now()
  where id = p_period_id and user_id = v_user_id;

  insert into public.audit_logs (
    user_id, module, action, table_name, record_id, record_name,
    performed_by, old_data, new_data, metadata
  ) values (
    v_user_id, 'accounting', upper(p_status), 'accounting_periods',
    p_period_id, v_period.period_name, v_user_id,
    pg_catalog.jsonb_build_object('status', v_old_status),
    pg_catalog.jsonb_build_object('status', p_status),
    pg_catalog.jsonb_build_object(
      'period_start', v_period.period_start,
      'period_end', v_period.period_end
    )
  );

  return pg_catalog.jsonb_build_object('success', true, 'status', p_status);
end;
$$;

create or replace function public.guard_closed_accounting_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'posted'
     and (tg_op = 'INSERT' or old.status is distinct from 'posted')
     and exists (
       select 1
       from public.accounting_periods ap
       where ap.user_id = new.user_id
         and new.entry_date between ap.period_start and ap.period_end
         and ap.status = 'closed'
     ) then
    raise exception 'Accounting period for % is closed. Reopen the period before posting.', new.entry_date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_closed_accounting_period on public.journal_entries;
create trigger trg_guard_closed_accounting_period
before insert or update of status, entry_date
on public.journal_entries
for each row execute function public.guard_closed_accounting_period();

revoke all on function public.initialize_accounting_year(integer) from public, anon;
revoke all on function public.set_accounting_period_status(uuid, text) from public, anon;
revoke all on function public.guard_closed_accounting_period() from public, anon, authenticated;
grant execute on function public.initialize_accounting_year(integer) to authenticated;
grant execute on function public.set_accounting_period_status(uuid, text) to authenticated;

notify pgrst, 'reload schema';
