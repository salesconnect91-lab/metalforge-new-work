-- Canonical employee-attributed sales and purchase performance facts.
-- Sales margin uses posted COGS. Purchase performance deliberately does not invent a profit margin.

create or replace view public.salesperson_business_performance_report
with (security_invoker = true) as
with payments as (
  select sales_order_id, company_id, business_unit_id, sum(amount) received
  from public.invoice_payment_allocations
  group by sales_order_id, company_id, business_unit_id
), facts as (
  select
    so.company_id, so.business_unit_id, so.operating_location_id, so.salesperson_id,
    e.name as sales_person, so.id as invoice_id, so.order_no as invoice_no, so.order_date,
    so.customer_id, c.name as customer_name, so.invoice_type, so.payment_mode, so.settlement_method,
    coalesce(sm.sales_amount, so.total, 0) gross_sales,
    coalesce(sm.return_amount, 0) returns,
    coalesce(sm.net_sales_amount, so.total, 0) net_sales,
    coalesce(sm.cost_amount, 0) actual_cogs,
    coalesce(sm.gross_profit, 0) gross_profit,
    coalesce(p.received, so.paid_amount, 0) received,
    greatest(coalesce(sm.net_sales_amount, so.total, 0) - coalesce(p.received, so.paid_amount, 0), 0) outstanding,
    case when so.invoice_type = 'Tax Invoice' then coalesce(so.total,0) else 0 end tax_invoice_total,
    case when so.invoice_type = 'Tax Invoice' then 0 else coalesce(so.total,0) end without_tax_total,
    case when so.invoice_type = 'Tax Invoice' then greatest(coalesce(so.total,0) - coalesce(sm.sales_amount,so.total,0),0) else 0 end vat_amount
  from public.sales_orders so
  left join public.employees e on e.id=so.salesperson_id and e.company_id=so.company_id
  left join public.customers c on c.id=so.customer_id and c.company_id=so.company_id
  left join public.sales_margin_report sm on sm.sales_order_id=so.id
  left join payments p on p.sales_order_id=so.id and p.company_id=so.company_id and p.business_unit_id is not distinct from so.business_unit_id
  where so.status='posted' and so.salesperson_id is not null
)
select *,
  case when lower(coalesce(payment_mode,settlement_method,''))='cash' then net_sales else 0 end cash_business,
  case when lower(coalesce(payment_mode,settlement_method,''))='bank' then net_sales else 0 end bank_business,
  case when lower(coalesce(payment_mode,settlement_method,''))='credit' then net_sales else 0 end credit_business,
  case when net_sales<>0 then round(gross_profit*100/net_sales,2) else 0 end margin_percent
from facts;

create or replace view public.purchaseperson_business_performance_report
with (security_invoker = true) as
with payments as (
  select purchase_order_id, company_id, business_unit_id, sum(amount) paid
  from public.purchase_payment_allocations
  group by purchase_order_id, company_id, business_unit_id
), line_totals as (
  select order_id, company_id, business_unit_id,
         sum(coalesce(qty,0)*coalesce(unit_price,0)) item_value,
         sum(coalesce(qty,0)*coalesce(unit_price,0)*coalesce(tax_percent,0)/100) item_vat
  from public.purchase_order_lines
  group by order_id, company_id, business_unit_id
), charge_totals as (
  select order_id, company_id, business_unit_id,
         sum(coalesce(amount,0)) charges,
         sum(coalesce(amount,0)*coalesce(tax_percent,0)/100) charge_vat
  from public.purchase_order_charges
  group by order_id, company_id, business_unit_id
)
select
  po.company_id, po.business_unit_id, po.operating_location_id,
  po.purchase_person_employee_id as purchase_person_id,
  coalesce(e.name,po.purchase_person) purchase_person,
  po.id invoice_id, po.order_no invoice_no, po.order_date,
  po.supplier_id, s.name supplier_name, po.invoice_type,
  coalesce(lt.item_value,0) item_value,
  coalesce(ct.charges,0) charges,
  coalesce(lt.item_vat,0)+coalesce(ct.charge_vat,0) vat_amount,
  coalesce(po.total,0) gross_purchase,
  coalesce(p.paid,po.paid_amount,0) paid,
  greatest(coalesce(po.total,0)-coalesce(p.paid,po.paid_amount,0),0) outstanding,
  case when po.invoice_type='Tax Invoice' then coalesce(po.total,0) else 0 end tax_invoice_total,
  case when po.invoice_type='Tax Invoice' then 0 else coalesce(po.total,0) end without_tax_total
from public.purchase_orders po
left join public.employees e on e.id=po.purchase_person_employee_id and e.company_id=po.company_id
left join public.suppliers s on s.id=po.supplier_id and s.company_id=po.company_id
left join payments p on p.purchase_order_id=po.id and p.company_id=po.company_id and p.business_unit_id is not distinct from po.business_unit_id
left join line_totals lt on lt.order_id=po.id and lt.company_id=po.company_id and lt.business_unit_id is not distinct from po.business_unit_id
left join charge_totals ct on ct.order_id=po.id and ct.company_id=po.company_id and ct.business_unit_id is not distinct from po.business_unit_id
where po.status='posted' and po.purchase_person_employee_id is not null;
