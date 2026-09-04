alter table public.sales_order_lines
  add column if not exists unit_cost_at_posting numeric,
  add column if not exists cogs_total numeric;

create or replace function public.freeze_sales_order_line_costs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.legacy_data_user_id();
  v_company uuid := public.current_company_id();
  r record;
  v_avg numeric;
begin
  if new.status <> 'posted' or old.status = 'posted' then return new; end if;
  if v_uid is null or v_company is null then raise exception 'Authentication and active company are required.'; end if;
  if new.user_id <> v_uid or new.company_id <> v_company then raise exception 'Sales invoice does not belong to the active company.'; end if;
  for r in select id,item_id,qty from public.sales_order_lines where order_id=new.id and user_id=v_uid and company_id=v_company order by id loop
    if r.item_id is null or coalesce(r.qty,0) <= 0 then raise exception 'Invalid sales line while freezing inventory cost.'; end if;
    v_avg := greatest(coalesce(public.get_inventory_avg_cost(r.item_id),0),0);
    update public.sales_order_lines set unit_cost_at_posting=round(v_avg,4),cogs_total=round(r.qty*v_avg,2)
    where id=r.id and user_id=v_uid and company_id=v_company;
  end loop;
  return new;
end;
$$;

revoke all on function public.freeze_sales_order_line_costs() from public, anon, authenticated;
drop trigger if exists trg_freeze_sales_order_line_costs on public.sales_orders;
create trigger trg_freeze_sales_order_line_costs
before update of status on public.sales_orders
for each row
when (new.status = 'posted' and old.status is distinct from 'posted')
execute function public.freeze_sales_order_line_costs();
