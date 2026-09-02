begin;

-- Work order finished product relationship
alter table public.work_orders
  drop constraint if exists work_orders_item_id_fkey;

alter table public.work_orders
  add constraint work_orders_item_id_fkey
  foreign key (item_id)
  references public.items(id)
  on delete restrict;

-- Work order BOM component relationship
alter table public.work_order_lines
  drop constraint if exists work_order_lines_item_id_fkey;

alter table public.work_order_lines
  add constraint work_order_lines_item_id_fkey
  foreign key (item_id)
  references public.items(id)
  on delete restrict;

-- BOM lines belong to a work order
alter table public.work_order_lines
  drop constraint if exists work_order_lines_order_id_fkey;

alter table public.work_order_lines
  add constraint work_order_lines_order_id_fkey
  foreign key (order_id)
  references public.work_orders(id)
  on delete cascade;

commit;

notify pgrst, 'reload schema';
