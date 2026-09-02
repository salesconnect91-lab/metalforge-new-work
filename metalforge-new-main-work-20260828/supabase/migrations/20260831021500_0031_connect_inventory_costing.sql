-- 0031_connect_inventory_costing.sql
-- Connect weighted-average inventory costing to Purchase, Production and Sales.

----------------------------------------------------------------------
-- 1. PURCHASE:
-- After a Purchase Invoice is successfully posted, recalculate the
-- weighted-average cost of every purchased item.
----------------------------------------------------------------------

create or replace function public.sync_purchase_inventory_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_current_qty numeric;
  v_old_qty numeric;
  r record;
begin
  if old.status is not distinct from 'posted'
     or new.status is distinct from 'posted' then
    return new;
  end if;

  v_user_id := new.user_id;

  if v_user_id is null then
    raise exception 'Purchase Order has no user.';
  end if;

  -- Direct status changes must not create costing without accounting.
  if not exists (
    select 1
    from public.journal_entries je
    where je.user_id = v_user_id
      and je.entry_no = 'PUR-' || new.order_no
  ) then
    raise exception
      'Purchase Invoice must be posted through the purchase posting process.';
  end if;

  for r in
    select
      pol.item_id,
      sum(coalesce(pol.qty, 0)) as purchase_qty,
      sum(
        coalesce(pol.qty, 0) * coalesce(pol.unit_cost, 0)
      ) as purchase_value
    from public.purchase_order_lines pol
    where pol.order_id = new.id
      and pol.user_id = v_user_id
    group by pol.item_id
    order by pol.item_id
  loop

    perform pg_advisory_xact_lock(
      hashtextextended(
        v_user_id::text || ':cost:' || r.item_id::text,
        0
      )
    );

    select coalesce(sum(ws.quantity), 0)
      into v_current_qty
    from public.warehouse_stock ws
    where ws.user_id = v_user_id
      and ws.item_id = r.item_id;

    v_old_qty :=
      greatest(
        coalesce(v_current_qty, 0) - coalesce(r.purchase_qty, 0),
        0
      );

    perform public.apply_inventory_cost_in(
      r.item_id,
      v_old_qty,
      r.purchase_qty,
      case
        when r.purchase_qty > 0
          then r.purchase_value / r.purchase_qty
        else 0
      end
    );

  end loop;

  return new;
end;
$$;

drop trigger if exists trg_sync_purchase_inventory_cost
  on public.purchase_orders;

create trigger trg_sync_purchase_inventory_cost
after update of status
on public.purchase_orders
for each row
when (
  old.status is distinct from new.status
  and new.status = 'posted'
)
execute function public.sync_purchase_inventory_cost();


----------------------------------------------------------------------
-- 2. PRODUCTION:
-- Calculate actual BOM consumption value and transfer that value into
-- the Finished Good weighted-average inventory cost.
--
-- No GL journal is required here while both Raw/Component and Finished
-- Goods use the same Inventory control account: production is an
-- internal inventory-value transfer.
----------------------------------------------------------------------

create or replace function public.apply_work_order_inventory_cost(
  p_order_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.work_orders%rowtype;

  v_consumed_cost numeric := 0;
  v_production_unit_cost numeric := 0;

  v_current_finished_qty numeric := 0;
  v_old_finished_qty numeric := 0;

  r record;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select wo.*
    into v_order
  from public.work_orders wo
  where wo.id = p_order_id
    and wo.user_id = v_user_id;

  if not found then
    raise exception 'Work Order not found or access denied.';
  end if;

  if v_order.status <> 'completed' then
    raise exception
      'Work Order must be completed before inventory costing.';
  end if;

  if v_order.item_id is null or coalesce(v_order.qty, 0) <= 0 then
    raise exception 'Finished item and production quantity are required.';
  end if;

  --------------------------------------------------------------------
  -- Lock cost records in deterministic item order.
  --------------------------------------------------------------------

  for r in
    select x.item_id
    from (
      select wol.item_id
      from public.work_order_lines wol
      where wol.order_id = v_order.id

      union

      select v_order.item_id
    ) x
    where x.item_id is not null
    order by x.item_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        v_user_id::text || ':cost:' || r.item_id::text,
        0
      )
    );
  end loop;

  --------------------------------------------------------------------
  -- BOM consumed value.
  --------------------------------------------------------------------

  select
    coalesce(
      sum(
        coalesce(wol.qty, 0)
        * public.get_inventory_avg_cost(wol.item_id)
      ),
      0
    )
    into v_consumed_cost
  from public.work_order_lines wol
  where wol.order_id = v_order.id;

  if v_consumed_cost < 0 then
    raise exception 'Invalid production consumption value.';
  end if;

  v_production_unit_cost :=
    case
      when v_order.qty > 0
        then v_consumed_cost / v_order.qty
      else 0
    end;

  --------------------------------------------------------------------
  -- Stock already contains the newly produced quantity at this stage.
  --------------------------------------------------------------------

  select coalesce(sum(ws.quantity), 0)
    into v_current_finished_qty
  from public.warehouse_stock ws
  where ws.user_id = v_user_id
    and ws.item_id = v_order.item_id;

  v_old_finished_qty :=
    greatest(
      v_current_finished_qty - v_order.qty,
      0
    );

  perform public.apply_inventory_cost_in(
    v_order.item_id,
    v_old_finished_qty,
    v_order.qty,
    v_production_unit_cost
  );

  return round(v_production_unit_cost, 6);
end;
$$;

revoke all on function public.apply_work_order_inventory_cost(uuid)
  from public;

revoke all on function public.apply_work_order_inventory_cost(uuid)
  from anon;

grant execute on function public.apply_work_order_inventory_cost(uuid)
  to authenticated;


create or replace function public.sync_completed_work_order_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from 'completed'
     and new.status = 'completed' then

    perform public.apply_work_order_inventory_cost(new.id);

  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_completed_work_order_cost
  on public.work_orders;

create trigger trg_sync_completed_work_order_cost
after update of status
on public.work_orders
for each row
when (
  old.status is distinct from new.status
  and new.status = 'completed'
)
execute function public.sync_completed_work_order_cost();


----------------------------------------------------------------------
-- 3. SALES:
-- Existing sales posting uses items.cost for product COGS.
-- After posting, reconcile only the product COGS + Inventory journal
-- lines to the user-specific weighted-average inventory cost.
----------------------------------------------------------------------

create or replace function public.sync_sales_inventory_cogs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;

  v_journal_id uuid;
  v_cogs_account uuid;
  v_inventory_account uuid;

  v_legacy_cogs numeric := 0;
  v_actual_cogs numeric := 0;

  v_cogs_line_id uuid;
  v_inventory_line_id uuid;

  v_count integer;
begin
  if old.status is not distinct from 'posted'
     or new.status is distinct from 'posted' then
    return new;
  end if;

  v_user_id := new.user_id;

  --------------------------------------------------------------------
  -- Find the journal created by post_sales_invoice().
  --------------------------------------------------------------------

  select je.id
    into v_journal_id
  from public.journal_entries je
  where je.user_id = v_user_id
    and je.entry_no = new.order_no
  limit 1;

  if v_journal_id is null then
    raise exception
      'Sales Invoice must be posted through the sales posting process.';
  end if;

  --------------------------------------------------------------------
  -- Resolve COGS mapping.
  --------------------------------------------------------------------

  select am.account_id
    into v_cogs_account
  from public.account_mappings am
  where am.user_id = v_user_id
    and am.mapping_key = 'cogs'
    and am.account_id is not null
  limit 1;

  if v_cogs_account is null then
    select am.account_id
      into v_cogs_account
    from public.account_mappings am
    where am.user_id = v_user_id
      and am.mapping_key = 'cost_of_goods_sold'
      and am.account_id is not null
    limit 1;
  end if;

  select am.account_id
    into v_inventory_account
  from public.account_mappings am
  where am.user_id = v_user_id
    and am.mapping_key = 'inventory'
    and am.account_id is not null
  limit 1;

  if v_cogs_account is null or v_inventory_account is null then
    raise exception
      'COGS or Inventory account mapping is missing.';
  end if;

  --------------------------------------------------------------------
  -- What the legacy posting function calculated.
  --------------------------------------------------------------------

  select
    coalesce(
      sum(
        coalesce(sol.qty, 0)
        * greatest(coalesce(i.cost, 0), 0)
      ),
      0
    )
    into v_legacy_cogs
  from public.sales_order_lines sol
  join public.items i
    on i.id = sol.item_id
  where sol.order_id = new.id;

  --------------------------------------------------------------------
  -- Correct weighted-average COGS.
  --------------------------------------------------------------------

  select
    coalesce(
      sum(
        coalesce(sol.qty, 0)
        * public.get_inventory_avg_cost(sol.item_id)
      ),
      0
    )
    into v_actual_cogs
  from public.sales_order_lines sol
  where sol.order_id = new.id;

  v_legacy_cogs := round(v_legacy_cogs, 2);
  v_actual_cogs := round(v_actual_cogs, 2);

  if v_legacy_cogs = v_actual_cogs then
    return new;
  end if;

  --------------------------------------------------------------------
  -- Find exactly the product COGS line created by the legacy function.
  --------------------------------------------------------------------

  select count(*), min(jl.id)
    into v_count, v_cogs_line_id
  from public.journal_lines jl
  where jl.entry_id = v_journal_id
    and jl.user_id = v_user_id
    and jl.account_id = v_cogs_account
    and round(coalesce(jl.debit, 0), 2) = v_legacy_cogs
    and round(coalesce(jl.credit, 0), 2) = 0;

  if v_legacy_cogs > 0 and v_count <> 1 then
    raise exception
      'Unable to uniquely identify Sales COGS journal line.';
  end if;

  select count(*), min(jl.id)
    into v_count, v_inventory_line_id
  from public.journal_lines jl
  where jl.entry_id = v_journal_id
    and jl.user_id = v_user_id
    and jl.account_id = v_inventory_account
    and round(coalesce(jl.credit, 0), 2) = v_legacy_cogs
    and round(coalesce(jl.debit, 0), 2) = 0;

  if v_legacy_cogs > 0 and v_count <> 1 then
    raise exception
      'Unable to uniquely identify Sales Inventory journal line.';
  end if;

  --------------------------------------------------------------------
  -- Revalue journal + general ledger.
  --------------------------------------------------------------------

  if v_cogs_line_id is not null then
    update public.journal_lines
    set debit = v_actual_cogs
    where id = v_cogs_line_id
      and user_id = v_user_id;

    update public.ledgers
    set debit = v_actual_cogs
    where journal_line_id = v_cogs_line_id
      and user_id = v_user_id;
  end if;

  if v_inventory_line_id is not null then
    update public.journal_lines
    set credit = v_actual_cogs
    where id = v_inventory_line_id
      and user_id = v_user_id;

    update public.ledgers
    set credit = v_actual_cogs
    where journal_line_id = v_inventory_line_id
      and user_id = v_user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_sales_inventory_cogs
  on public.sales_orders;

create trigger trg_sync_sales_inventory_cogs
after update of status
on public.sales_orders
for each row
when (
  old.status is distinct from new.status
  and new.status = 'posted'
)
execute function public.sync_sales_inventory_cogs();


notify pgrst, 'reload schema';
