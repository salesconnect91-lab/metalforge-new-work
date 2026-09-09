create unique index if not exists purchase_orders_company_unit_order_no_uidx
  on public.purchase_orders(company_id, business_unit_id, order_no)
  where company_id is not null and business_unit_id is not null and order_no is not null;
