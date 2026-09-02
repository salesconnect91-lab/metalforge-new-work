alter table public.suppliers enable row level security;

alter table public.purchase_orders
drop constraint purchase_orders_supplier_id_fkey;

alter table public.purchase_orders
add constraint purchase_orders_supplier_id_fkey
foreign key (supplier_id)
references public.suppliers(id)
on delete restrict;
