-- Canonical employee-attributed sales and purchase performance facts.
-- Sales margin uses posted COGS. Purchase performance deliberately does not invent a profit margin.

create or replace function public.sync_transaction_employee_attribution()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_name text;
begin
  if tg_table_name = 'sales_orders' then
    if new.salesperson_id is null and nullif(btrim(new.sales_person),'') is not null then
      select e.id into new.salesperson_id
      from public.employees e
      where e.company_id = new.company_id and lower(btrim(e.name)) = lower(btrim(new.sales_person))
      order by e.is_active desc, e.created_at
      limit 1;
    end if;
    if new.salesperson_id is not null then
      select e.name into v_name from public.employees e where e.id=new.salesperson_id and e.company_id=new.company_id;
      if v_name is not null then new.sales_person := v_name; end if;
    end if;
  elsif tg_table_name = 'purchase_orders' then
    if new.purchase_person_employee_id is null and nullif(btrim(new.purchase_person),'') is not null then
      select e.id into new.purchase_person_employee_id
      from public.employees e
      where e.company_id = new.company_id and lower(btrim(e.name)) = lower(btrim(new.purchase_person))
      order by e.is_active desc, e.created_at
      limit 1;
    end if;
    if new.purchase_person_employee_id is not null then
      select e.name into v_name from public.employees e where e.id=new.purchase_person_employee_id and e.company_id=new.company_id;
      if v_name is not null then new.purchase_person := v_name; end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sales_orders_employee_attribution on public.sales_orders;
create trigger trg_sales_orders_employee_attribution before insert or update of sales_person,salesperson_id,company_id on public.sales_orders for each row execute function public.sync_transaction_employee_attribution();

drop trigger if exists trg_purchase_orders_employee_attribution on public.purchase_orders;
create trigger trg_purchase_orders_employee_attribution before insert or update of purchase_person,purchase_person_employee_id,company_id on public.purchase_orders for each row execute function public.sync_transaction_employee_attribution();

update public.sales_orders so
set salesperson_id=e.id, sales_person=e.name
from public.employees e
where so.company_id=e.company_id and so.salesperson_id is null and nullif(btrim(so.sales_person),'') is not null and lower(btrim(so.sales_person))=lower(btrim(e.name));

update public.purchase_orders po
set purchase_person_employee_id=e.id, purchase_person=e.name
from public.employees e
where po.company_id=e.company_id and po.purchase_person_employee_id is null and nullif(btrim(po.purchase_person),'') is not null and lower(btrim(po.purchase_person))=lower(btrim(e.name));

create or replace view public.salesperson_business_performance_report
with (security_invoker=true) as
with payments as (
  select sales_order_id, company_id, business_unit_id, sum(amount) received
  from public.invoice_payment_allocations
  group by sales_order_id,company_id,business_unit_id
), line_tax as (
  select order_id,company_id,business_unit_id,
         sum(coalesce(line_total,coalesce(qty,0)*coalesce(unit_price,0))*coalesce(tax_percent,0)/100) vat
  from public.sales_order_lines
  group by order_id,company_id,business_unit_id
), charge_tax as (
  select order_id,company_id,business_unit_id,
         sum(coalesce(amount,0)*coalesce(tax_percent,0)/100) vat
  from public.sales_order_charges
  group by order_id,company_id,business_unit_id
)
select so.company_id,so.business_unit_id,so.operating_location_id,so.salesperson_id,e.name sales_person,
       so.id invoice_id,so.order_no invoice_no,so.order_date,so.customer_id,c.name customer_name,
       so.invoice_type,coalesce(so.payment_mode,so.settlement_method) settlement_type,
       coalesce(so.total,0) gross_sales,coalesce(sm.return_amount,0) returns,
       coalesce(sm.net_sales_amount,coalesce(so.total,0)-coalesce(sm.return_amount,0)) net_sales,
       coalesce(lt.vat,0)+coalesce(ct.vat,0) vat_amount,
       case when so.invoice_type='Tax Invoice' then coalesce(so.total,0) else 0 end tax_invoice_total,
       case when so.invoice_type='Tax Invoice' then 0 else coalesce(so.total,0) end without_tax_total,
       case when lower(coalesce(so.payment_mode,so.settlement_method,''))='cash' then coalesce(so.total,0) else 0 end cash_business,
       case when lower(coalesce(so.payment_mode,so.settlement_method,''))='bank' then coalesce(so.total,0) else 0 end bank_business,
       case when lower(coalesce(so.payment_mode,so.settlement_method,''))='credit' then coalesce(so.total,0) else 0 end credit_business,
       coalesce(p.received,so.paid_amount,0) received,
       greatest(coalesce(so.total,0)-coalesce(p.received,so.paid_amount,0),0) outstanding,
       coalesce(sm.cost_amount,0) actual_cogs,coalesce(sm.gross_profit,0) gross_profit,coalesce(sm.margin_percent,0) margin_percent
from public.sales_orders so
left join public.employees e on e.id=so.salesperson_id and e.company_id=so.company_id
left join public.customers c on c.id=so.customer_id and c.company_id=so.company_id
left join public.sales_margin_report sm on sm.sales_order_id=so.id
left join payments p on p.sales_order_id=so.id and p.company_id=so.company_id and p.business_unit_id is not distinct from so.business_unit_id
left join line_tax lt on lt.order_id=so.id and lt.company_id=so.company_id and lt.business_unit_id is not distinct from so.business_unit_id
left join charge_tax ct on ct.order_id=so.id and ct.company_id=so.company_id and ct.business_unit_id is not distinct from so.business_unit_id
where so.status='posted' and so.salesperson_id is not null;

create or replace view public.purchaseperson_business_performance_report
with (security_invoker=true) as
with payments as (
  select purchase_order_id,company_id,business_unit_id,sum(amount) paid
  from public.purchase_payment_allocations
  group by purchase_order_id,company_id,business_unit_id
), lines as (
  select order_id,company_id,business_unit_id,
         sum(coalesce(line_total,coalesce(qty,0)*coalesce(unit_cost,0))) item_value,
         sum(coalesce(line_total,coalesce(qty,0)*coalesce(unit_cost,0))*coalesce(tax_percent,0)/100) item_vat
  from public.purchase_order_lines
  group by order_id,company_id,business_unit_id
), charges as (
  select order_id,company_id,business_unit_id,
         sum(coalesce(amount,0)) charges,
         sum(coalesce(amount,0)*coalesce(tax_percent,0)/100) charge_vat
  from public.purchase_order_charges
  group by order_id,company_id,business_unit_id
)
select po.company_id,po.business_unit_id,po.operating_location_id,po.purchase_person_employee_id purchase_person_id,
       coalesce(e.name,po.purchase_person) purchase_person,po.id invoice_id,po.order_no invoice_no,po.order_date,
       po.supplier_id,s.name supplier_name,po.invoice_type,
       coalesce(l.item_value,0) item_value,coalesce(ch.charges,0) charges,coalesce(l.item_vat,0)+coalesce(ch.charge_vat,0) vat_amount,
       coalesce(po.total,0) gross_purchase,
       case when po.invoice_type='Tax Invoice' then coalesce(po.total,0) else 0 end tax_invoice_total,
       case when po.invoice_type='Tax Invoice' then 0 else coalesce(po.total,0) end without_tax_total,
       coalesce(p.paid,po.paid_amount,0) paid,
       greatest(coalesce(po.total,0)-coalesce(p.paid,po.paid_amount,0),0) outstanding
from public.purchase_orders po
left join public.employees e on e.id=po.purchase_person_employee_id and e.company_id=po.company_id
left join public.suppliers s on s.id=po.supplier_id and s.company_id=po.company_id
left join payments p on p.purchase_order_id=po.id and p.company_id=po.company_id and p.business_unit_id is not distinct from po.business_unit_id
left join lines l on l.order_id=po.id and l.company_id=po.company_id and l.business_unit_id is not distinct from po.business_unit_id
left join charges ch on ch.order_id=po.id and ch.company_id=po.company_id and ch.business_unit_id is not distinct from po.business_unit_id
where po.status='posted' and po.purchase_person_employee_id is not null;

grant select on public.salesperson_business_performance_report, public.purchaseperson_business_performance_report to authenticated;
