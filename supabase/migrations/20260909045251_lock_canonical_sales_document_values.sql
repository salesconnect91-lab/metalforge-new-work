alter table public.sales_orders drop constraint if exists sales_orders_invoice_type_check;
alter table public.sales_orders add constraint sales_orders_invoice_type_check check (invoice_type in ('Sale Invoice','Tax Invoice'));

alter table public.consolidated_sales_invoices drop constraint if exists consolidated_sales_invoices_invoice_type_check;
alter table public.consolidated_sales_invoices add constraint consolidated_sales_invoices_invoice_type_check check (invoice_type in ('Sale Invoice','Tax Invoice'));
