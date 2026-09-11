drop view if exists public.stock_exception_report;
drop view if exists public.monthly_business_performance_report;

create or replace function public.report_customer_profitability(p_from date default null, p_to date default null)
returns table(company_id uuid,business_unit_id uuid,operating_location_id uuid,customer_name text,invoices bigint,net_sales numeric,actual_cogs numeric,gross_profit numeric,margin_percent numeric)
language sql stable security invoker set search_path=public as $$
 select s.company_id,s.business_unit_id,s.operating_location_id,s.customer_name,count(distinct s.sales_order_id),coalesce(sum(s.net_sales_amount),0),coalesce(sum(s.cost_amount),0),coalesce(sum(s.gross_profit),0),case when coalesce(sum(s.net_sales_amount),0)<>0 then round(sum(s.gross_profit)*100/sum(s.net_sales_amount),2) else 0 end
 from public.sales_margin_report s where (p_from is null or s.invoice_date>=p_from) and (p_to is null or s.invoice_date<=p_to)
 group by s.company_id,s.business_unit_id,s.operating_location_id,s.customer_name;
$$;

create or replace function public.report_item_profitability(p_from date default null, p_to date default null)
returns table(company_id uuid,business_unit_id uuid,operating_location_id uuid,item_id uuid,item_name text,size text,unit text,qty_sold numeric,avg_sale_rate numeric,sales_value numeric,actual_cost numeric,gross_profit numeric,margin_percent numeric)
language sql stable security invoker set search_path=public as $$
 select h.company_id,h.business_unit_id,h.operating_location_id,h.item_id,h.item_name,h.size,h.unit,coalesce(sum(h.qty),0),case when sum(h.qty)<>0 then round(sum(h.line_total)/sum(h.qty),4) else 0 end,coalesce(sum(h.line_total),0),coalesce(sum(h.cost_total),0),coalesce(sum(h.line_total-h.cost_total),0),case when sum(h.line_total)<>0 then round(sum(h.line_total-h.cost_total)*100/sum(h.line_total),2) else 0 end
 from public.customer_item_history_report h where (p_from is null or h.order_date>=p_from) and (p_to is null or h.order_date<=p_to)
 group by h.company_id,h.business_unit_id,h.operating_location_id,h.item_id,h.item_name,h.size,h.unit;
$$;

create or replace function public.report_salesperson_profitability(p_from date default null, p_to date default null)
returns table(company_id uuid,business_unit_id uuid,operating_location_id uuid,sales_person text,invoices bigint,net_sales numeric,actual_cogs numeric,gross_profit numeric,margin_percent numeric)
language sql stable security invoker set search_path=public as $$
 select s.company_id,s.business_unit_id,s.operating_location_id,coalesce(nullif(trim(s.sales_person),''),'Unassigned'),count(distinct s.sales_order_id),coalesce(sum(s.net_sales_amount),0),coalesce(sum(s.cost_amount),0),coalesce(sum(s.gross_profit),0),case when sum(s.net_sales_amount)<>0 then round(sum(s.gross_profit)*100/sum(s.net_sales_amount),2) else 0 end
 from public.sales_margin_report s where (p_from is null or s.invoice_date>=p_from) and (p_to is null or s.invoice_date<=p_to)
 group by s.company_id,s.business_unit_id,s.operating_location_id,coalesce(nullif(trim(s.sales_person),''),'Unassigned');
$$;

create or replace function public.report_customer_collection_performance(p_from date default null, p_to date default null)
returns table(company_id uuid,business_unit_id uuid,operating_location_id uuid,customer_id uuid,customer_name text,invoices bigint,invoiced numeric,received numeric,outstanding numeric,overdue_amount numeric,avg_days_outstanding numeric,overdue_percent numeric)
language sql stable security invoker set search_path=public as $$
 select a.company_id,a.business_unit_id,a.operating_location_id,a.customer_id,a.customer_name,count(*),coalesce(sum(a.invoice_amount),0),coalesce(sum(a.paid_amount),0),coalesce(sum(a.outstanding_amount),0),coalesce(sum(case when a.overdue_days>0 then a.outstanding_amount else 0 end),0),round(avg(a.days_outstanding)::numeric,1),case when sum(a.outstanding_amount)<>0 then round(sum(case when a.overdue_days>0 then a.outstanding_amount else 0 end)*100/sum(a.outstanding_amount),2) else 0 end
 from public.customer_invoice_aging a where (p_from is null or a.invoice_date>=p_from) and (p_to is null or a.invoice_date<=p_to)
 group by a.company_id,a.business_unit_id,a.operating_location_id,a.customer_id,a.customer_name;
$$;

create or replace function public.report_supplier_performance(p_from date default null, p_to date default null)
returns table(company_id uuid,business_unit_id uuid,operating_location_id uuid,supplier_id uuid,supplier_name text,purchase_invoices bigint,qty_purchased numeric,purchase_value numeric,avg_rate numeric,current_outstanding numeric,current_overdue numeric)
language sql stable security invoker set search_path=public as $$
 with p as (
  select h.company_id,h.business_unit_id,h.operating_location_id,h.supplier_id,h.supplier_name,count(distinct h.purchase_order_id) purchase_invoices,sum(h.qty) qty_purchased,sum(h.line_total) purchase_value,case when sum(h.qty)<>0 then sum(h.line_total)/sum(h.qty) else 0 end avg_rate
  from public.supplier_item_history_report h where (p_from is null or h.order_date>=p_from) and (p_to is null or h.order_date<=p_to)
  group by h.company_id,h.business_unit_id,h.operating_location_id,h.supplier_id,h.supplier_name
 ), a as (
  select company_id,business_unit_id,operating_location_id,supplier_id,sum(outstanding_amount) outstanding,sum(case when overdue_days>0 then outstanding_amount else 0 end) overdue
  from public.supplier_invoice_aging group by company_id,business_unit_id,operating_location_id,supplier_id
 )
 select p.company_id,p.business_unit_id,p.operating_location_id,p.supplier_id,p.supplier_name,p.purchase_invoices,p.qty_purchased,p.purchase_value,round(p.avg_rate,4),coalesce(a.outstanding,0),coalesce(a.overdue,0)
 from p left join a using(company_id,business_unit_id,operating_location_id,supplier_id);
$$;

create or replace function public.report_purchase_price_variance(p_from date default null, p_to date default null)
returns table(company_id uuid,business_unit_id uuid,operating_location_id uuid,supplier_id uuid,supplier_name text,item_id uuid,item_name text,size text,purchases bigint,qty_purchased numeric,purchase_value numeric,avg_purchase_rate numeric,min_rate numeric,max_rate numeric,rate_spread numeric)
language sql stable security invoker set search_path=public as $$
 select h.company_id,h.business_unit_id,h.operating_location_id,h.supplier_id,h.supplier_name,h.item_id,h.item_name,h.size,count(distinct h.purchase_order_id),sum(h.qty),sum(h.line_total),case when sum(h.qty)<>0 then round(sum(h.line_total)/sum(h.qty),4) else 0 end,min(h.rate),max(h.rate),max(h.rate)-min(h.rate)
 from public.supplier_item_history_report h where (p_from is null or h.order_date>=p_from) and (p_to is null or h.order_date<=p_to)
 group by h.company_id,h.business_unit_id,h.operating_location_id,h.supplier_id,h.supplier_name,h.item_id,h.item_name,h.size;
$$;

create or replace function public.report_inventory_turnover(p_from date default null, p_to date default null)
returns table(company_id uuid,business_unit_id uuid,operating_location_id uuid,item_id uuid,item_name text,size text,current_qty numeric,current_stock_value numeric,qty_sold numeric,cogs numeric,turnover_current_stock_basis numeric)
language sql stable security invoker set search_path=public as $$
 with s as (
  select company_id,business_unit_id,operating_location_id,item_id,item_name,size,sum(quantity) current_qty,sum(stock_value) current_stock_value
  from public.stock_godown_report group by company_id,business_unit_id,operating_location_id,item_id,item_name,size
 ), c as (
  select company_id,business_unit_id,operating_location_id,item_id,sum(qty) qty_sold,sum(cost_total) cogs
  from public.customer_item_history_report where (p_from is null or order_date>=p_from) and (p_to is null or order_date<=p_to)
  group by company_id,business_unit_id,operating_location_id,item_id
 )
 select s.company_id,s.business_unit_id,s.operating_location_id,s.item_id,s.item_name,s.size,s.current_qty,s.current_stock_value,coalesce(c.qty_sold,0),coalesce(c.cogs,0),case when s.current_stock_value<>0 then round(coalesce(c.cogs,0)/s.current_stock_value,4) else null end
 from s left join c using(company_id,business_unit_id,operating_location_id,item_id);
$$;

create view public.stock_exception_report with (security_invoker=true) as
with last_move as (
 select distinct on(company_id,business_unit_id,operating_location_id,item_id,godown_id)
 company_id,business_unit_id,operating_location_id,item_id,godown_id,resulting_qty,created_at
 from public.stock_movements
 order by company_id,business_unit_id,operating_location_id,item_id,godown_id,created_at desc
)
select s.company_id,s.business_unit_id,s.operating_location_id,s.item_id,s.item_name,s.size,s.godown,s.quantity,s.avg_cost,s.stock_value,l.resulting_qty as last_movement_resulting_qty,
 case when s.quantity<0 then 'Negative Stock'
      when s.quantity=0 then 'Zero Stock'
      when s.quantity>0 and coalesce(s.avg_cost,0)<=0 then 'Missing / Zero Cost'
      when l.resulting_qty is not null and abs(s.quantity-l.resulting_qty)>0.0001 then 'Stock / Movement Mismatch'
      else 'Other' end exception_type
from public.stock_godown_report s
left join last_move l on l.company_id=s.company_id and l.business_unit_id is not distinct from s.business_unit_id and l.operating_location_id is not distinct from s.operating_location_id and l.item_id=s.item_id and l.godown_id is not distinct from s.godown_id
where s.quantity<=0 or (s.quantity>0 and coalesce(s.avg_cost,0)<=0) or (l.resulting_qty is not null and abs(s.quantity-l.resulting_qty)>0.0001);

create view public.monthly_business_performance_report with (security_invoker=true) as
with months as (
 select company_id,business_unit_id,date_trunc('month',invoice_date)::date month_start from public.sales_margin_report
 union select company_id,business_unit_id,date_trunc('month',order_date)::date from public.purchase_register_report
 union select company_id,business_unit_id,date_trunc('month',allocation_date)::date from public.invoice_payment_allocations
 union select company_id,business_unit_id,date_trunc('month',entry_date)::date from public.ledgers
), sales as (
 select company_id,business_unit_id,date_trunc('month',invoice_date)::date month_start,sum(net_sales_amount) net_sales,sum(gross_profit) gross_profit
 from public.sales_margin_report group by 1,2,3
), purch as (
 select company_id,business_unit_id,date_trunc('month',order_date)::date month_start,sum(total) purchases
 from public.purchase_register_report group by 1,2,3
), coll as (
 select company_id,business_unit_id,date_trunc('month',allocation_date)::date month_start,sum(amount) collections
 from public.invoice_payment_allocations group by 1,2,3
), pl as (
 select l.company_id,l.business_unit_id,date_trunc('month',l.entry_date)::date month_start,
 sum(case when a.type='revenue' then l.credit-l.debit else 0 end) ledger_revenue,
 sum(case when a.type='expense' then l.debit-l.credit else 0 end) expenses
 from public.ledgers l join public.chart_of_accounts a on a.id=l.account_id group by 1,2,3
), base as (
 select m.company_id,m.business_unit_id,m.month_start,coalesce(s.net_sales,0) net_sales,coalesce(p.purchases,0) purchases,coalesce(s.gross_profit,0) gross_profit,coalesce(pl.expenses,0) expenses,coalesce(pl.ledger_revenue,0)-coalesce(pl.expenses,0) net_profit,coalesce(c.collections,0) collections
 from months m left join sales s using(company_id,business_unit_id,month_start) left join purch p using(company_id,business_unit_id,month_start) left join coll c using(company_id,business_unit_id,month_start) left join pl using(company_id,business_unit_id,month_start)
)
select b.*,
 lag(net_sales) over(partition by company_id,business_unit_id order by month_start) previous_net_sales,
 case when lag(net_sales) over(partition by company_id,business_unit_id order by month_start)<>0 then round((net_sales-lag(net_sales) over(partition by company_id,business_unit_id order by month_start))*100/abs(lag(net_sales) over(partition by company_id,business_unit_id order by month_start)),2) end sales_change_percent,
 lag(gross_profit) over(partition by company_id,business_unit_id order by month_start) previous_gross_profit,
 lag(net_profit) over(partition by company_id,business_unit_id order by month_start) previous_net_profit,
 case when b.month_start=date_trunc('month',current_date)::date then (select coalesce(sum(a.outstanding_amount),0) from public.customer_invoice_aging a where a.company_id=b.company_id and a.business_unit_id is not distinct from b.business_unit_id) end current_ar,
 case when b.month_start=date_trunc('month',current_date)::date then (select coalesce(sum(a.outstanding_amount),0) from public.supplier_invoice_aging a where a.company_id=b.company_id and a.business_unit_id is not distinct from b.business_unit_id) end current_ap,
 case when b.month_start=date_trunc('month',current_date)::date then (select coalesce(sum(s.stock_value),0) from public.stock_godown_report s where s.company_id=b.company_id and s.business_unit_id is not distinct from b.business_unit_id) end current_inventory_value
from base b;

revoke all on function public.report_customer_profitability(date,date),public.report_item_profitability(date,date),public.report_salesperson_profitability(date,date),public.report_customer_collection_performance(date,date),public.report_supplier_performance(date,date),public.report_purchase_price_variance(date,date),public.report_inventory_turnover(date,date) from public,anon;
grant execute on function public.report_customer_profitability(date,date),public.report_item_profitability(date,date),public.report_salesperson_profitability(date,date),public.report_customer_collection_performance(date,date),public.report_supplier_performance(date,date),public.report_purchase_price_variance(date,date),public.report_inventory_turnover(date,date) to authenticated;
grant select on public.stock_exception_report,public.monthly_business_performance_report to authenticated;
notify pgrst,'reload schema';
