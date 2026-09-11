create table if not exists public.dashboard_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  company_id uuid not null default public.current_company_id(),
  visible_cards text[] not null default array['cash','bank','receivables','payables','inventory_value','month_sales']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id)
);

alter table public.dashboard_preferences enable row level security;

drop policy if exists dashboard_preferences_select on public.dashboard_preferences;
create policy dashboard_preferences_select on public.dashboard_preferences
for select to authenticated
using (auth.uid() = user_id and public.has_company_access(company_id));

drop policy if exists dashboard_preferences_insert on public.dashboard_preferences;
create policy dashboard_preferences_insert on public.dashboard_preferences
for insert to authenticated
with check (auth.uid() = user_id and public.has_company_access(company_id));

drop policy if exists dashboard_preferences_update on public.dashboard_preferences;
create policy dashboard_preferences_update on public.dashboard_preferences
for update to authenticated
using (auth.uid() = user_id and public.has_company_access(company_id))
with check (auth.uid() = user_id and public.has_company_access(company_id));

drop policy if exists dashboard_preferences_delete on public.dashboard_preferences;
create policy dashboard_preferences_delete on public.dashboard_preferences
for delete to authenticated
using (auth.uid() = user_id and public.has_company_access(company_id));

grant select, insert, update, delete on public.dashboard_preferences to authenticated;

create or replace function public.get_dashboard_summary()
returns table (
  cash_balance numeric,
  bank_balance numeric,
  receivables numeric,
  payables numeric,
  inventory_value numeric,
  inventory_qty numeric,
  month_sales numeric,
  month_gross_profit numeric,
  pending_work_orders bigint,
  stock_exceptions bigint,
  refreshed_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
with mapped as (
  select am.mapping_key, am.account_id
  from public.account_mappings am
  where am.company_id = public.current_company_id()
    and am.mapping_key in ('cash','bank')
), account_balances as (
  select m.mapping_key,
         coalesce(sum(coalesce(l.debit,0) - coalesce(l.credit,0)),0)::numeric as balance
  from mapped m
  left join public.ledgers l on l.account_id = m.account_id
  group by m.mapping_key
), ar as (
  select coalesce(sum(greatest(coalesce(outstanding_amount,0),0)),0)::numeric as amount
  from public.customer_invoice_aging
  where company_id = public.current_company_id()
), ap as (
  select coalesce(sum(greatest(coalesce(outstanding_amount,0),0)),0)::numeric as amount
  from public.supplier_invoice_aging
  where company_id = public.current_company_id()
), stock as (
  select coalesce(sum(coalesce(stock_value,0)),0)::numeric as value,
         coalesce(sum(coalesce(quantity,0)),0)::numeric as qty,
         count(*) filter (where coalesce(quantity,0) < 0)::bigint as exceptions
  from public.stock_godown_report
  where company_id = public.current_company_id()
), sales as (
  select coalesce(sum(coalesce(net_sales_amount,0)),0)::numeric as net_sales,
         coalesce(sum(coalesce(gross_profit,0)),0)::numeric as gross_profit
  from public.sales_margin_report
  where company_id = public.current_company_id()
    and invoice_date >= date_trunc('month', current_date)::date
    and invoice_date < (date_trunc('month', current_date) + interval '1 month')::date
), work as (
  select count(*) filter (where lower(coalesce(status,'')) not in ('completed','closed','cancelled'))::bigint as pending
  from public.work_orders
  where company_id = public.current_company_id()
)
select
  coalesce((select balance from account_balances where mapping_key='cash'),0),
  coalesce((select balance from account_balances where mapping_key='bank'),0),
  ar.amount,
  ap.amount,
  stock.value,
  stock.qty,
  sales.net_sales,
  sales.gross_profit,
  work.pending,
  stock.exceptions,
  now()
from ar, ap, stock, sales, work;
$$;

revoke all on function public.get_dashboard_summary() from public, anon;
grant execute on function public.get_dashboard_summary() to authenticated;
comment on function public.get_dashboard_summary() is 'Tenant-safe live dashboard summary using posted accounting/reporting sources and current workspace RLS.';
