alter table public.sales_order_lines drop constraint if exists sales_order_lines_qty_positive_check;
alter table public.sales_order_lines add constraint sales_order_lines_qty_positive_check check (qty > 0);
alter table public.sales_order_lines drop constraint if exists sales_order_lines_unit_price_nonnegative_check;
alter table public.sales_order_lines add constraint sales_order_lines_unit_price_nonnegative_check check (unit_price >= 0);
alter table public.sales_order_lines drop constraint if exists sales_order_lines_tax_percent_check;
alter table public.sales_order_lines add constraint sales_order_lines_tax_percent_check check (tax_percent >= 0 and tax_percent <= 100);

alter table public.purchase_order_lines drop constraint if exists purchase_order_lines_qty_positive_check;
alter table public.purchase_order_lines add constraint purchase_order_lines_qty_positive_check check (qty > 0);
alter table public.purchase_order_lines drop constraint if exists purchase_order_lines_unit_cost_nonnegative_check;
alter table public.purchase_order_lines add constraint purchase_order_lines_unit_cost_nonnegative_check check (unit_cost >= 0);

alter table public.sales_order_charges drop constraint if exists sales_order_charges_amount_nonnegative_check;
alter table public.sales_order_charges add constraint sales_order_charges_amount_nonnegative_check check (amount >= 0);
alter table public.sales_order_charges drop constraint if exists sales_order_charges_tax_percent_check;
alter table public.sales_order_charges add constraint sales_order_charges_tax_percent_check check (tax_percent >= 0 and tax_percent <= 100);
