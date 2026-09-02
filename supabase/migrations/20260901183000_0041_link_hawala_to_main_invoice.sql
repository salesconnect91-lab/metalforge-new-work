begin;

-- =========================================================
-- 0041 - Secure Hawala -> Main Sales Invoice Linking
--
-- Rules:
-- 1. Only POSTED Hawala invoices can be linked.
-- 2. Hawala customer must match Main Sales Invoice customer.
-- 3. Main Sales Invoice must still be DRAFT.
-- 4. One Hawala invoice can belong to only ONE Main Sales Invoice.
-- 5. Browser users can read links, but direct writes are blocked.
-- 6. Linking itself does NOT post stock or accounting.
-- =========================================================

create table if not exists public.sales_order_hawala_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  sales_order_id uuid not null
    references public.sales_orders(id) on delete cascade,
  hawala_invoice_id uuid not null
    references public.consolidated_sales_invoices(id) on delete restrict,
  linked_at timestamptz not null default timezone('utc'::text, now()),

  constraint sales_order_hawala_unique_pair
    unique (sales_order_id, hawala_invoice_id),

  constraint sales_order_hawala_unique_hawala
    unique (hawala_invoice_id)
);

create index if not exists idx_sales_order_hawala_order
  on public.sales_order_hawala_invoices (sales_order_id);

create index if not exists idx_sales_order_hawala_user
  on public.sales_order_hawala_invoices (user_id);

create index if not exists idx_sales_order_hawala_invoice
  on public.sales_order_hawala_invoices (hawala_invoice_id);


-- ---------------------------------------------------------
-- RLS: authenticated user may READ own links only.
-- All writes go through trusted RPC below.
-- ---------------------------------------------------------

alter table public.sales_order_hawala_invoices
  enable row level security;

drop policy if exists sales_order_hawala_select_own
  on public.sales_order_hawala_invoices;

create policy sales_order_hawala_select_own
on public.sales_order_hawala_invoices
for select
to authenticated
using (auth.uid() = user_id);

revoke all
on public.sales_order_hawala_invoices
from public, anon;

grant select
on public.sales_order_hawala_invoices
to authenticated;

revoke insert, update, delete
on public.sales_order_hawala_invoices
from authenticated;


-- ---------------------------------------------------------
-- Replace all Hawala links for one DRAFT Main Sales Invoice.
--
-- Example:
-- select public.replace_sales_order_hawala_invoices(
--   '<sales-order-uuid>',
--   array['<hawala-uuid-1>','<hawala-uuid-2>']::uuid[]
-- );
--
-- Empty array removes all links from the draft invoice.
-- ---------------------------------------------------------

create or replace function public.replace_sales_order_hawala_invoices(
  p_order_id uuid,
  p_hawala_invoice_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.sales_orders%rowtype;
  v_ids uuid[] := coalesce(p_hawala_invoice_ids, array[]::uuid[]);
  v_requested_count integer := 0;
  v_linked_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_order
  from public.sales_orders
  where id = p_order_id
    and user_id = v_uid
  for update;

  if not found then
    raise exception 'Main Sales Invoice not found.';
  end if;

  if coalesce(v_order.status, '') <> 'draft' then
    raise exception
      'Only draft Main Sales Invoices can change Hawala links.';
  end if;

  select count(distinct x.id)
  into v_requested_count
  from unnest(v_ids) as x(id);

  -- Every requested Hawala must:
  -- belong to current user,
  -- already be POSTED,
  -- and belong to the same customer as the Main Invoice.
  if exists (
    select 1
    from unnest(v_ids) as x(id)
    left join public.consolidated_sales_invoices h
      on h.id = x.id
    where h.id is null
       or h.user_id <> v_uid
       or h.status <> 'posted'
       or h.customer_id is distinct from v_order.customer_id
  ) then
    raise exception
      'Invalid Hawala selection. Hawala must be posted and belong to the same customer.';
  end if;

  -- Prevent one Hawala invoice from being attached
  -- to another Main Sales Invoice.
  if exists (
    select 1
    from public.sales_order_hawala_invoices l
    join unnest(v_ids) as x(id)
      on x.id = l.hawala_invoice_id
    where l.user_id = v_uid
      and l.sales_order_id <> p_order_id
  ) then
    raise exception
      'One or more Hawala invoices are already used in another Main Sales Invoice.';
  end if;

  -- Replace links atomically.
  delete from public.sales_order_hawala_invoices
  where user_id = v_uid
    and sales_order_id = p_order_id;

  insert into public.sales_order_hawala_invoices (
    user_id,
    sales_order_id,
    hawala_invoice_id
  )
  select
    v_uid,
    p_order_id,
    x.id
  from (
    select distinct id
    from unnest(v_ids) as u(id)
  ) as x;

  get diagnostics v_linked_count = row_count;

  return jsonb_build_object(
    'success', true,
    'sales_order_id', p_order_id,
    'customer_id', v_order.customer_id,
    'requested_count', v_requested_count,
    'linked_count', v_linked_count,
    'stock_posted', false,
    'accounting_posted', false
  );
end;
$$;

revoke all
on function public.replace_sales_order_hawala_invoices(uuid, uuid[])
from public, anon;

grant execute
on function public.replace_sales_order_hawala_invoices(uuid, uuid[])
to authenticated;


-- ---------------------------------------------------------
-- Helper RPC:
-- Returns POSTED Hawala invoices available for a customer.
-- If p_order_id is supplied, Hawalas already linked to that
-- same draft order are also returned for edit mode.
-- ---------------------------------------------------------

create or replace function public.get_available_hawala_invoices(
  p_customer_id uuid,
  p_order_id uuid default null
)
returns table (
  id uuid,
  invoice_no text,
  invoice_date date,
  reference_name text,
  reference_no text,
  reference_notes text,
  subtotal numeric,
  item_tax numeric,
  charges_total numeric,
  charge_tax numeric,
  total numeric,
  linked_sales_order_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.id,
    h.invoice_no,
    h.invoice_date,
    h.reference_name,
    h.reference_no,
    h.reference_notes,
    h.subtotal,
    h.item_tax,
    h.charges_total,
    h.charge_tax,
    h.total,
    l.sales_order_id as linked_sales_order_id
  from public.consolidated_sales_invoices h
  left join public.sales_order_hawala_invoices l
    on l.hawala_invoice_id = h.id
   and l.user_id = auth.uid()
  where auth.uid() is not null
    and h.user_id = auth.uid()
    and h.customer_id = p_customer_id
    and h.status = 'posted'
    and (
      l.id is null
      or (
        p_order_id is not null
        and l.sales_order_id = p_order_id
      )
    )
  order by h.invoice_date desc, h.invoice_no desc;
$$;

revoke all
on function public.get_available_hawala_invoices(uuid, uuid)
from public, anon;

grant execute
on function public.get_available_hawala_invoices(uuid, uuid)
to authenticated;

notify pgrst, 'reload schema';

commit;
