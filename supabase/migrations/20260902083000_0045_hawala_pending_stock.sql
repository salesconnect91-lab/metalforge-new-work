-- ============================================================
-- 0045 - Hawala / Unbilled Dispatch Inventory
--
-- Accounting rule:
-- Hawala posting is NOT a sale.
--
-- Hawala Post:
--   Physical warehouse stock decreases.
--   Hawala Pending Stock increases operationally.
--   NO AR
--   NO Sales Revenue
--   NO Output VAT journal
--   NO COGS journal
--   NO General Ledger / Party Ledger
--
-- Main Sales Invoice will later:
--   recognize Revenue / VAT / AR
--   recognize COGS using frozen Hawala cost
--   clear Hawala Pending Stock
--   NOT reduce physical warehouse stock again
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Operational subledger for stock already dispatched
--    physically but not yet financially invoiced.
-- ------------------------------------------------------------

create table if not exists public.hawala_pending_stock (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null default auth.uid(),

  hawala_invoice_id uuid not null
    references public.consolidated_sales_invoices(id)
    on delete restrict,

  hawala_line_id uuid not null
    references public.consolidated_sales_invoice_lines(id)
    on delete restrict,

  item_id uuid not null
    references public.items(id)
    on delete restrict,

  source_warehouse_id uuid,
  source_godown_id uuid,

  qty_dispatched numeric(18,4) not null
    check (qty_dispatched > 0),

  qty_remaining numeric(18,4) not null
    check (qty_remaining >= 0),

  unit_cost numeric(18,4) not null default 0
    check (unit_cost >= 0),

  value_remaining numeric(18,2) not null default 0
    check (value_remaining >= 0),

  status text not null default 'pending'
    check (status in ('pending', 'cleared')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cleared_at timestamptz,

  constraint hawala_pending_stock_unique_line
    unique (hawala_line_id)
);

create index if not exists idx_hawala_pending_stock_user
  on public.hawala_pending_stock(user_id);

create index if not exists idx_hawala_pending_stock_invoice
  on public.hawala_pending_stock(hawala_invoice_id);

create index if not exists idx_hawala_pending_stock_item
  on public.hawala_pending_stock(item_id);

create index if not exists idx_hawala_pending_stock_status
  on public.hawala_pending_stock(user_id, status);


-- ------------------------------------------------------------
-- 2. RLS
--    Browser can read its own pending stock.
--    Posting/clearing must happen through trusted RPCs.
-- ------------------------------------------------------------

alter table public.hawala_pending_stock
enable row level security;

drop policy if exists hawala_pending_stock_select_own
on public.hawala_pending_stock;

create policy hawala_pending_stock_select_own
on public.hawala_pending_stock
for select
to authenticated
using (auth.uid() = user_id);

revoke all
on public.hawala_pending_stock
from anon;

revoke insert, update, delete
on public.hawala_pending_stock
from authenticated;

grant select
on public.hawala_pending_stock
to authenticated;


-- ------------------------------------------------------------
-- 3. Replace Hawala posting engine.
--
-- Physical warehouse stock OUT + pending stock IN.
-- No accounting entries are created here.
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
  v_avg_cost numeric := 0;

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
      'Consolidated/Hawala document not found or access denied.';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception
      'Only draft Consolidated/Hawala documents can be posted.';
  end if;

  -- 0041 link table is authoritative.
  -- A draft Hawala should never already be linked.
  if exists (
    select 1
    from public.sales_order_hawala_invoices l
    where l.user_id = v_user_id
      and l.hawala_invoice_id = p_invoice_id
  ) then
    raise exception
      'This Hawala document is already attached to a Main Sales Invoice.';
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
      and l.user_id = v_user_id
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

    select ws.quantity
    into v_stock
    from public.warehouse_stock ws
    where ws.user_id = v_user_id
      and ws.item_id = r.item_id
      and ws.warehouse_id = r.warehouse_id
      and ws.godown_id = r.godown_id
    for update;

    if coalesce(v_stock, 0) < r.qty then
      raise exception
        'Insufficient stock for % in Godown %. Available: %, Required: %.',
        r.item_name,
        r.godown_name,
        coalesce(v_stock, 0),
        r.qty;
    end if;

    -- Freeze weighted-average inventory cost at dispatch time.
    v_avg_cost :=
      greatest(
        coalesce(public.get_inventory_avg_cost(r.item_id), 0),
        0
      );

    update public.consolidated_sales_invoice_lines
    set
      unit_cost_at_posting = round(v_avg_cost, 4),
      cogs_total = round(r.qty * v_avg_cost, 2)
    where id = r.id
      and invoice_id = p_invoice_id
      and user_id = v_user_id;

    -- Physical stock leaves the selected Godown now.
    update public.warehouse_stock
    set
      quantity = quantity - r.qty,
      godown = r.godown_name,
      updated_at = now()
    where user_id = v_user_id
      and item_id = r.item_id
      and warehouse_id = r.warehouse_id
      and godown_id = r.godown_id;

    -- Operational pending inventory.
    -- Company still owns this inventory until Main Invoice posting.
    insert into public.hawala_pending_stock (
      user_id,
      hawala_invoice_id,
      hawala_line_id,
      item_id,
      source_warehouse_id,
      source_godown_id,
      qty_dispatched,
      qty_remaining,
      unit_cost,
      value_remaining,
      status
    )
    values (
      v_user_id,
      p_invoice_id,
      r.id,
      r.item_id,
      r.warehouse_id,
      r.godown_id,
      r.qty,
      r.qty,
      round(v_avg_cost, 4),
      round(r.qty * v_avg_cost, 2),
      'pending'
    );

    -- Physical stock movement only.
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
    total = round(
      v_total
      + coalesce(item_tax, 0)
      + coalesce(charges_total, 0)
      + coalesce(charge_tax, 0),
      2
    ),
    status = 'posted',
    posted_at = now(),
    updated_at = now()
  where id = p_invoice_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'invoice_no', v_invoice.invoice_no,
    'subtotal', round(v_total, 2),
    'total', round(
      v_total
      + coalesce(v_invoice.item_tax, 0)
      + coalesce(v_invoice.charges_total, 0)
      + coalesce(v_invoice.charge_tax, 0),
      2
    ),
    'status', 'posted',
    'line_count', v_line_count,

    'physical_stock_posted', true,
    'hawala_pending_created', true,

    'customer_ledger_posted', false,
    'sales_revenue_posted', false,
    'vat_posted', false,
    'cogs_posted', false,
    'general_ledger_posted', false
  );
end;
$$;

revoke all
on function public.post_consolidated_sales_invoice(uuid)
from public, anon;

grant execute
on function public.post_consolidated_sales_invoice(uuid)
to authenticated;

notify pgrst, 'reload schema';

commit;
