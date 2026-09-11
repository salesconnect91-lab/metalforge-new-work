create table if not exists public.dashboard_widget_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  company_id uuid not null,
  business_unit_id uuid null,
  hidden_widgets text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dashboard_widget_preferences_scope_uq
  on public.dashboard_widget_preferences (user_id, company_id, coalesce(business_unit_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.dashboard_widget_preferences enable row level security;

drop policy if exists dashboard_widget_preferences_select on public.dashboard_widget_preferences;
create policy dashboard_widget_preferences_select on public.dashboard_widget_preferences
for select to authenticated
using (user_id = auth.uid() and company_id = public.current_company_id());

drop policy if exists dashboard_widget_preferences_insert on public.dashboard_widget_preferences;
create policy dashboard_widget_preferences_insert on public.dashboard_widget_preferences
for insert to authenticated
with check (user_id = auth.uid() and company_id = public.current_company_id());

drop policy if exists dashboard_widget_preferences_update on public.dashboard_widget_preferences;
create policy dashboard_widget_preferences_update on public.dashboard_widget_preferences
for update to authenticated
using (user_id = auth.uid() and company_id = public.current_company_id())
with check (user_id = auth.uid() and company_id = public.current_company_id());

drop policy if exists dashboard_widget_preferences_delete on public.dashboard_widget_preferences;
create policy dashboard_widget_preferences_delete on public.dashboard_widget_preferences
for delete to authenticated
using (user_id = auth.uid() and company_id = public.current_company_id());

grant select, insert, update, delete on public.dashboard_widget_preferences to authenticated;

create or replace function public.dashboard_live_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with ctx as (
  select public.current_company_id() as company_id,
         public.current_business_unit_id() as business_unit_id,
         public.current_operating_location_id() as operating_location_id
), mapped as (
  select am.mapping_key, am.account_id
  from public.account_mappings am, ctx
  where am.company_id = ctx.company_id
    and am.mapping_key in ('cash','bank','accounts_receivable','accounts_payable','inventory')
), account_balances as (
  select m.mapping_key,
         coalesce(sum(coalesce(jl.base_debit,jl.debit,0) - coalesce(jl.base_credit,jl.credit,0)),0)::numeric as debit_minus_credit
  from mapped m
  left join public.journal_lines jl on jl.account_id = m.account_id
  left join public.journal_entries je on je.id = jl.entry_id and lower(coalesce(je.status,'')) = 'posted'
  cross join ctx
  where (jl.id is null or (
    jl.company_id = ctx.company_id
    and (ctx.business_unit_id is null or jl.business_unit_id = ctx.business_unit_id)
    and (ctx.operating_location_id is null or jl.operating_location_id = ctx.operating_location_id)
    and je.id is not null
  ))
  group by m.mapping_key
), sales_mtd as (
  select coalesce(sum(so.total),0)::numeric as amount, count(*)::int as documents
  from public.sales_orders so, ctx
  where so.company_id = ctx.company_id
    and (ctx.business_unit_id is null or so.business_unit_id = ctx.business_unit_id)
    and (ctx.operating_location_id is null or so.operating_location_id = ctx.operating_location_id)
    and lower(coalesce(so.status,'')) in ('posted','closed')
    and so.order_date >= date_trunc('month', current_date)::date
    and so.order_date <= current_date
), purchases_mtd as (
  select coalesce(sum(po.total),0)::numeric as amount, count(*)::int as documents
  from public.purchase_orders po, ctx
  where po.company_id = ctx.company_id
    and (ctx.business_unit_id is null or po.business_unit_id = ctx.business_unit_id)
    and (ctx.operating_location_id is null or po.operating_location_id = ctx.operating_location_id)
    and lower(coalesce(po.status,'')) in ('posted','closed')
    and po.order_date >= date_trunc('month', current_date)::date
    and po.order_date <= current_date
), stock_state as (
  select coalesce(sum(ws.quantity),0)::numeric as quantity,
         count(*) filter (where coalesce(ws.quantity,0) <= 0)::int as alerts
  from public.warehouse_stock ws, ctx
  where ws.company_id = ctx.company_id
    and (ctx.business_unit_id is null or ws.business_unit_id = ctx.business_unit_id)
    and (ctx.operating_location_id is null or ws.operating_location_id = ctx.operating_location_id)
), work_state as (
  select count(*) filter (where lower(coalesce(wo.status,'')) not in ('completed','closed','cancelled'))::int as pending
  from public.work_orders wo, ctx
  where wo.company_id = ctx.company_id
    and (ctx.business_unit_id is null or wo.business_unit_id = ctx.business_unit_id)
    and (ctx.operating_location_id is null or wo.operating_location_id = ctx.operating_location_id)
)
select jsonb_build_object(
  'sales_mtd', (select amount from sales_mtd),
  'sales_documents_mtd', (select documents from sales_mtd),
  'purchases_mtd', (select amount from purchases_mtd),
  'purchase_documents_mtd', (select documents from purchases_mtd),
  'cash_balance', coalesce((select debit_minus_credit from account_balances where mapping_key='cash'),0),
  'bank_balance', coalesce((select debit_minus_credit from account_balances where mapping_key='bank'),0),
  'receivables', coalesce((select debit_minus_credit from account_balances where mapping_key='accounts_receivable'),0),
  'payables', -coalesce((select debit_minus_credit from account_balances where mapping_key='accounts_payable'),0),
  'inventory_value', coalesce((select debit_minus_credit from account_balances where mapping_key='inventory'),0),
  'stock_quantity', (select quantity from stock_state),
  'stock_alerts', (select alerts from stock_state),
  'pending_work_orders', (select pending from work_state),
  'as_of', now()
);
$$;

revoke all on function public.dashboard_live_summary() from public, anon;
grant execute on function public.dashboard_live_summary() to authenticated;
