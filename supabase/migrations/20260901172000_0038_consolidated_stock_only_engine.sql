-- ============================================================
-- 0038 - Consolidated / Hawala Stock-Only Engine
-- ============================================================
-- Business rule:
--
-- Consolidated/Hawala Invoice:
--   YES -> item / qty / rate / godown
--   YES -> warehouse stock OUT
--   YES -> stock movement
--   NO  -> journal entry
--   NO  -> general ledger
--   NO  -> party/customer ledger
--   NO  -> sales revenue
--   NO  -> COGS accounting
--
-- Later a normal Main Sales Invoice may select these documents
-- for financial posting without posting their stock a second time.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Consolidated/Hawala document header
-- ------------------------------------------------------------

create table if not exists public.consolidated_sales_invoices (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,

  invoice_no text not null,
  invoice_date date not null default current_date,

  reference_name text,
  reference_no text,
  reference_notes text,

  status text not null default 'draft'
    check (status in ('draft', 'posted', 'cancelled')),

  subtotal numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0,

  main_sales_order_id uuid
    references public.sales_orders(id) on delete restrict,

  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(user_id, invoice_no)
);


create index if not exists
  idx_consolidated_sales_invoices_user_date
on public.consolidated_sales_invoices(user_id, invoice_date desc);


create index if not exists
  idx_consolidated_sales_invoices_main_order
on public.consolidated_sales_invoices(main_sales_order_id);


-- ------------------------------------------------------------
-- 2. Consolidated/Hawala invoice lines
-- ------------------------------------------------------------

create table if not exists public.consolidated_sales_invoice_lines (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,

  invoice_id uuid not null
    references public.consolidated_sales_invoices(id)
    on delete cascade,

  item_id uuid not null
    references public.items(id) on delete restrict,

  godown_id uuid not null
    references public.godowns(id) on delete restrict,

  qty numeric(18,3) not null
    check (qty > 0),

  unit_price numeric(18,2) not null default 0
    check (unit_price >= 0),

  line_total numeric(18,2) not null default 0,

  created_at timestamptz not null default now()
);


create index if not exists
  idx_consolidated_sales_invoice_lines_invoice
on public.consolidated_sales_invoice_lines(invoice_id);


create index if not exists
  idx_consolidated_sales_invoice_lines_item
on public.consolidated_sales_invoice_lines(item_id);


-- ------------------------------------------------------------
-- 3. Ownership validation
-- ------------------------------------------------------------

create or replace function public.validate_consolidated_sales_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_user uuid;
begin

  select user_id
    into v_invoice_user
  from public.consolidated_sales_invoices
  where id = new.invoice_id;

  if not found then
    raise exception 'Consolidated/Hawala invoice not found.';
  end if;

  if new.user_id is null then
    new.user_id := v_invoice_user;
  end if;

  if new.user_id is distinct from v_invoice_user then
    raise exception
      'Invoice line owner must match consolidated invoice owner.';
  end if;

  new.line_total :=
    round(
      coalesce(new.qty, 0) *
      coalesce(new.unit_price, 0),
      2
    );

  return new;
end;
$$;


drop trigger if exists
  trg_validate_consolidated_sales_line
on public.consolidated_sales_invoice_lines;


create trigger trg_validate_consolidated_sales_line
before insert or update
on public.consolidated_sales_invoice_lines
for each row
execute function public.validate_consolidated_sales_line();


-- ------------------------------------------------------------
-- 4. Stock-only posting RPC
-- ------------------------------------------------------------

create or replace function public.post_consolidated_sales_invoice(
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();

  v_invoice public.consolidated_sales_invoices%rowtype;

  v_stock numeric;
  v_total numeric := 0;
  v_line_count integer := 0;

  r record;
begin

  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;


  select *
    into v_invoice
  from public.consolidated_sales_invoices
  where id = p_invoice_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception
      'Consolidated/Hawala invoice not found or access denied.';
  end if;


  if v_invoice.status <> 'draft' then
    raise exception
      'Only draft Consolidated/Hawala invoices can be posted.';
  end if;


  if v_invoice.main_sales_order_id is not null then
    raise exception
      'This Consolidated/Hawala invoice is already attached to a Main Sales Invoice.';
  end if;


  for r in
    select
      l.id,
      l.item_id,
      l.godown_id,
      l.qty,
      l.unit_price,
      l.line_total,

      i.name as item_name,
      i.sku,

      g.name as godown_name,
      g.warehouse_id

    from public.consolidated_sales_invoice_lines l

    join public.items i
      on i.id = l.item_id

    join public.godowns g
      on g.id = l.godown_id

    where l.invoice_id = p_invoice_id

    order by l.id

  loop

    v_line_count := v_line_count + 1;


    if coalesce(r.qty, 0) <= 0 then
      raise exception
        'Invalid quantity for item %.',
        coalesce(r.item_name, r.item_id::text);
    end if;


    if r.warehouse_id is null then
      raise exception
        'Selected Godown % is not linked to a warehouse.',
        r.godown_name;
    end if;


    select quantity
      into v_stock
    from public.warehouse_stock
    where user_id = v_user_id
      and item_id = r.item_id
      and warehouse_id = r.warehouse_id
      and godown_id = r.godown_id
    for update;


    if coalesce(v_stock, 0) < r.qty then
      raise exception
        'Insufficient stock for % in Godown %. Available: %, Required: %.',
        r.item_name,
        r.godown_name,
        coalesce(v_stock, 0),
        r.qty;
    end if;


    update public.warehouse_stock
    set
      quantity = quantity - r.qty,
      godown = r.godown_name,
      updated_at = now()
    where user_id = v_user_id
      and item_id = r.item_id
      and warehouse_id = r.warehouse_id
      and godown_id = r.godown_id;


    insert into public.stock_movements (
      user_id,
      item_id,
      type,
      qty,
      reference,
      godown,
      warehouse_id,
      godown_id
    )
    values (
      v_user_id,
      r.item_id,
      'out',
      r.qty,
      v_invoice.invoice_no,
      r.godown_name,
      r.warehouse_id,
      r.godown_id
    );


    v_total :=
      v_total +
      round(
        coalesce(r.qty, 0) *
        coalesce(r.unit_price, 0),
        2
      );

  end loop;


  if v_line_count = 0 then
    raise exception
      'Add at least one item before posting.';
  end if;


  update public.consolidated_sales_invoices
  set
    subtotal = round(v_total, 2),
    total = round(v_total, 2),
    status = 'posted',
    posted_at = now(),
    updated_at = now()
  where id = p_invoice_id
    and user_id = v_user_id;


  return jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'invoice_no', v_invoice.invoice_no,
    'total', round(v_total, 2),
    'line_count', v_line_count,
    'status', 'posted',
    'stock_posted', true,
    'accounting_posted', false
  );

end;
$$;


-- ------------------------------------------------------------
-- 5. Security
-- ------------------------------------------------------------

alter table public.consolidated_sales_invoices
enable row level security;

alter table public.consolidated_sales_invoice_lines
enable row level security;


drop policy if exists
  consolidated_sales_invoices_select_own
on public.consolidated_sales_invoices;

create policy consolidated_sales_invoices_select_own
on public.consolidated_sales_invoices
for select
to authenticated
using (auth.uid() = user_id);


drop policy if exists
  consolidated_sales_invoices_insert_own
on public.consolidated_sales_invoices;

create policy consolidated_sales_invoices_insert_own
on public.consolidated_sales_invoices
for insert
to authenticated
with check (auth.uid() = user_id);


drop policy if exists
  consolidated_sales_invoices_update_own
on public.consolidated_sales_invoices;

create policy consolidated_sales_invoices_update_own
on public.consolidated_sales_invoices
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);


drop policy if exists
  consolidated_sales_invoices_delete_own
on public.consolidated_sales_invoices;

create policy consolidated_sales_invoices_delete_own
on public.consolidated_sales_invoices
for delete
to authenticated
using (
  auth.uid() = user_id
  and status = 'draft'
);


drop policy if exists
  consolidated_sales_invoice_lines_select_own
on public.consolidated_sales_invoice_lines;

create policy consolidated_sales_invoice_lines_select_own
on public.consolidated_sales_invoice_lines
for select
to authenticated
using (auth.uid() = user_id);


drop policy if exists
  consolidated_sales_invoice_lines_insert_own
on public.consolidated_sales_invoice_lines;

create policy consolidated_sales_invoice_lines_insert_own
on public.consolidated_sales_invoice_lines
for insert
to authenticated
with check (auth.uid() = user_id);


drop policy if exists
  consolidated_sales_invoice_lines_update_own
on public.consolidated_sales_invoice_lines;

create policy consolidated_sales_invoice_lines_update_own
on public.consolidated_sales_invoice_lines
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);


drop policy if exists
  consolidated_sales_invoice_lines_delete_own
on public.consolidated_sales_invoice_lines;

create policy consolidated_sales_invoice_lines_delete_own
on public.consolidated_sales_invoice_lines
for delete
to authenticated
using (auth.uid() = user_id);


revoke all
on function public.post_consolidated_sales_invoice(uuid)
from public, anon;

grant execute
on function public.post_consolidated_sales_invoice(uuid)
to authenticated;


revoke all
on function public.validate_consolidated_sales_line()
from public, anon, authenticated;


notify pgrst, 'reload schema';
