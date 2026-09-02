alter table public.sales_orders
drop constraint sales_orders_customer_id_fkey;

alter table public.sales_orders
add constraint sales_orders_customer_id_fkey
foreign key (customer_id)
references public.customers(id)
on delete restrict;
