-- ============================================================
-- 0040 - Freeze Hawala weighted-average cost at STOCK POSTING
-- ============================================================

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

    -- Freeze weighted-average cost at the exact stock-posting moment.
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
    raise exception 'Add at least one item before posting.';
  end if;

  update public.consolidated_sales_invoices
  set
    subtotal = round(v_total, 2),
    total = round(
      v_total +
      coalesce(item_tax, 0) +
      coalesce(charges_total, 0) +
      coalesce(charge_tax, 0),
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
    'status', 'posted',
    'line_count', v_line_count,
    'stock_posted', true,
    'accounting_posted', false
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
