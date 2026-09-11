alter table public.purchase_orders
  add column if not exists purchase_person text,
  add column if not exists purchase_person_employee_id uuid references public.employees(id) on delete set null;

create index if not exists idx_purchase_orders_purchase_person_employee_id
  on public.purchase_orders(purchase_person_employee_id);
