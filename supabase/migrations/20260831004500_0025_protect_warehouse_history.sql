begin;

alter table public.sales_order_lines
  drop constraint if exists sales_order_lines_godown_id_fkey;

alter table public.sales_order_lines
  add constraint sales_order_lines_godown_id_fkey
  foreign key (godown_id)
  references public.godowns(id)
  on delete restrict;

alter table public.items
  drop constraint if exists items_warehouse_id_fkey;

alter table public.items
  add constraint items_warehouse_id_fkey
  foreign key (warehouse_id)
  references public.warehouses(id)
  on delete restrict;

commit;
