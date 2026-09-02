create unique index if not exists purchase_orders_user_order_no_uidx
on public.purchase_orders (user_id, order_no);
