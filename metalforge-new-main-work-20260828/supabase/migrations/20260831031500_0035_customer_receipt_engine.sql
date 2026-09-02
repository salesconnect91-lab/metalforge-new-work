-- ============================================================
-- 0035 - Customer Receipt / Payment Engine
-- ============================================================
-- Accounting:
--   Dr Cash / Bank
--   Cr Accounts Receivable (Customer)
--
-- Supports:
--   * one or many invoice allocations
--   * partial receipts
--   * customer advance / unallocated receipt
--   * excess receipt retained as customer advance
--   * atomic journal + GL + party ledger + invoice allocation
-- ============================================================


-- ------------------------------------------------------------
-- 1. Harden invoice payment-status recalculation
-- ------------------------------------------------------------

create or replace function public.recalculate_sales_order_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales_order_id uuid;
  v_user_id uuid;
  v_total numeric := 0;
  v_paid numeric := 0;
  v_outstanding numeric := 0;
  v_status text := 'unpaid';
begin
  v_sales_order_id := coalesce(new.sales_order_id, old.sales_order_id);
  v_user_id := coalesce(new.user_id, old.user_id);

  select coalesce(so.total, 0)
    into v_total
  from public.sales_orders so
  where so.id = v_sales_order_id
    and so.user_id = v_user_id;

  if not found then
    raise exception 'Sales invoice not found for payment allocation.';
  end if;

  select coalesce(sum(a.amount), 0)
    into v_paid
  from public.invoice_payment_allocations a
  where a.sales_order_id = v_sales_order_id
    and a.user_id = v_user_id;

  v_paid := round(v_paid, 2);
  v_total := round(v_total, 2);
  v_outstanding := greatest(v_total - v_paid, 0);

  if v_paid <= 0 then
    v_status := 'unpaid';
  elsif v_paid < v_total then
    v_status := 'partial';
  elsif v_paid = v_total then
    v_status := 'paid';
  else
    v_status := 'overpaid';
  end if;

  update public.sales_orders
  set
    paid_amount = v_paid,
    outstanding_amount = v_outstanding,
    payment_status = v_status
  where id = v_sales_order_id
    and user_id = v_user_id;

  return coalesce(new, old);
end;
$$;


-- ------------------------------------------------------------
-- 2. Customer receipt RPC
-- ------------------------------------------------------------

create or replace function public.receive_customer_payment(
  p_customer_id uuid,
  p_payment_date date,
  p_payment_account_id uuid,
  p_payment_method text,
  p_reference text,
  p_description text,
  p_notes text,
  p_allocations jsonb,
  p_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();

  v_customer public.customers%rowtype;

  v_ar_account_id uuid;
  v_cash_account_id uuid;
  v_bank_account_id uuid;

  v_payment_amount numeric := 0;
  v_allocated_total numeric := 0;

  v_payment_date date := coalesce(p_payment_date, current_date);

  v_journal_id uuid;
  v_ar_line_id uuid;

  v_entry_no text;
  v_next_no bigint;

  v_payment_account_text text;
  v_ar_account_text text;

  r record;
  v_invoice public.sales_orders%rowtype;
  v_existing_paid numeric;
  v_invoice_outstanding numeric;
begin
  -- ----------------------------------------------------------
  -- Authentication / basic validation
  -- ----------------------------------------------------------

  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_customer_id is null then
    raise exception 'Customer is required.';
  end if;

  if p_payment_account_id is null then
    raise exception 'Payment account is required.';
  end if;

  select *
    into v_customer
  from public.customers c
  where c.id = p_customer_id
    and c.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Customer not found or access denied.';
  end if;


  -- ----------------------------------------------------------
  -- Accounting mappings
  -- ----------------------------------------------------------

  select am.account_id
    into v_ar_account_id
  from public.account_mappings am
  where am.user_id = v_user_id
    and am.mapping_key = 'accounts_receivable'
  limit 1;

  select am.account_id
    into v_cash_account_id
  from public.account_mappings am
  where am.user_id = v_user_id
    and am.mapping_key = 'cash'
  limit 1;

  select am.account_id
    into v_bank_account_id
  from public.account_mappings am
  where am.user_id = v_user_id
    and am.mapping_key = 'bank'
  limit 1;

  if v_ar_account_id is null then
    raise exception 'Accounts Receivable mapping is missing.';
  end if;

  if v_customer.account_id is distinct from v_ar_account_id then
    raise exception
      'Customer is not linked to the configured Accounts Receivable account.';
  end if;

  if p_payment_account_id is distinct from v_cash_account_id
     and p_payment_account_id is distinct from v_bank_account_id then
    raise exception
      'Payment account must be the configured Cash or Bank account.';
  end if;

  select coa.code || ' - ' || coa.name
    into v_payment_account_text
  from public.chart_of_accounts coa
  where coa.id = p_payment_account_id
    and coa.user_id = v_user_id;

  if v_payment_account_text is null then
    raise exception 'Selected payment account does not exist.';
  end if;

  select coa.code || ' - ' || coa.name
    into v_ar_account_text
  from public.chart_of_accounts coa
  where coa.id = v_ar_account_id
    and coa.user_id = v_user_id;

  if v_ar_account_text is null then
    raise exception 'Accounts Receivable account does not exist.';
  end if;


  -- ----------------------------------------------------------
  -- Normalize and validate allocations
  -- ----------------------------------------------------------

  if p_allocations is null then
    p_allocations := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Payment allocations must be a JSON array.';
  end if;

  -- Lock every allocated invoice in deterministic order.
  for r in
    select distinct
      (x.value->>'sales_order_id')::uuid as sales_order_id
    from jsonb_array_elements(p_allocations) x(value)
    where nullif(x.value->>'sales_order_id', '') is not null
    order by 1
  loop
    perform 1
    from public.sales_orders so
    where so.id = r.sales_order_id
      and so.user_id = v_user_id
    for update;
  end loop;


  -- Aggregate duplicate invoice rows from the payload.
  for r in
    select
      (x.value->>'sales_order_id')::uuid as sales_order_id,
      round(sum((x.value->>'amount')::numeric), 2) as amount
    from jsonb_array_elements(p_allocations) x(value)
    group by (x.value->>'sales_order_id')::uuid
    order by (x.value->>'sales_order_id')::uuid
  loop
    if r.sales_order_id is null then
      raise exception 'Allocation invoice is required.';
    end if;

    if r.amount is null or r.amount <= 0 then
      raise exception 'Allocation amount must be greater than zero.';
    end if;

    select *
      into v_invoice
    from public.sales_orders so
    where so.id = r.sales_order_id
      and so.user_id = v_user_id
      and so.customer_id = p_customer_id
    for update;

    if not found then
      raise exception
        'Allocated invoice does not belong to the selected customer.';
    end if;

    if v_invoice.status <> 'posted' then
      raise exception
        'Only posted sales invoices can receive payment. Invoice: %',
        v_invoice.order_no;
    end if;

    select coalesce(sum(a.amount), 0)
      into v_existing_paid
    from public.invoice_payment_allocations a
    where a.user_id = v_user_id
      and a.sales_order_id = v_invoice.id;

    v_invoice_outstanding :=
      greatest(
        round(coalesce(v_invoice.total, 0), 2)
        - round(coalesce(v_existing_paid, 0), 2),
        0
      );

    if r.amount > v_invoice_outstanding + 0.005 then
      raise exception
        'Allocation for invoice % exceeds outstanding balance. Outstanding: %, Allocation: %.',
        v_invoice.order_no,
        v_invoice_outstanding,
        r.amount;
    end if;

    v_allocated_total := v_allocated_total + r.amount;
  end loop;

  v_allocated_total := round(v_allocated_total, 2);

  -- Backward compatibility:
  -- old invoice-payment callers may omit p_amount.
  v_payment_amount :=
    round(coalesce(p_amount, v_allocated_total), 2);

  if v_payment_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if v_allocated_total > v_payment_amount + 0.005 then
    raise exception
      'Allocated amount (%) cannot exceed payment amount (%).',
      v_allocated_total,
      v_payment_amount;
  end if;


  -- ----------------------------------------------------------
  -- Generate customer receipt number safely
  -- ----------------------------------------------------------

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_user_id::text || ':customer_receipt_number',
      0
    )
  );

  select
    coalesce(
      max(
        nullif(
          substring(je.entry_no from '^CR-([0-9]+)$'),
          ''
        )::bigint
      ),
      0
    ) + 1
  into v_next_no
  from public.journal_entries je
  where je.user_id = v_user_id
    and je.entry_no ~ '^CR-[0-9]+$';

  v_entry_no :=
    'CR-' || lpad(v_next_no::text, 4, '0');


  -- ----------------------------------------------------------
  -- Create DRAFT journal
  -- ----------------------------------------------------------

  insert into public.journal_entries (
    user_id,
    entry_no,
    entry_date,
    description,
    status,
    payment_mode,
    party_name,
    trans_type
  )
  values (
    v_user_id,
    v_entry_no,
    v_payment_date,
    coalesce(
      nullif(btrim(p_description), ''),
      'Customer Receipt - ' || v_customer.name
    ),
    'draft',
    coalesce(nullif(btrim(p_payment_method), ''), 'Receipt'),
    v_customer.name,
    'Customer Receipt'
  )
  returning id into v_journal_id;


  -- Dr Cash / Bank
  insert into public.journal_lines (
    user_id,
    entry_id,
    account,
    debit,
    credit,
    account_id,
    party_name,
    party_type,
    party_id
  )
  values (
    v_user_id,
    v_journal_id,
    v_payment_account_text,
    v_payment_amount,
    0,
    p_payment_account_id,
    null,
    null,
    null
  );


  -- Cr Accounts Receivable / Customer
  insert into public.journal_lines (
    user_id,
    entry_id,
    account,
    debit,
    credit,
    account_id,
    party_name,
    party_type,
    party_id
  )
  values (
    v_user_id,
    v_journal_id,
    v_ar_account_text,
    0,
    v_payment_amount,
    v_ar_account_id,
    v_customer.name,
    'customer',
    v_customer.id
  )
  returning id into v_ar_line_id;


  -- ----------------------------------------------------------
  -- Post through centralized accounting engine
  -- This creates GL + party ledger and validates AR/customer.
  -- ----------------------------------------------------------

  perform public.post_journal_entry(v_journal_id);


  -- ----------------------------------------------------------
  -- Invoice allocations
  -- Excess/unallocated amount remains customer advance credit.
  -- ----------------------------------------------------------

  for r in
    select
      (x.value->>'sales_order_id')::uuid as sales_order_id,
      round(sum((x.value->>'amount')::numeric), 2) as amount
    from jsonb_array_elements(p_allocations) x(value)
    group by (x.value->>'sales_order_id')::uuid
    order by (x.value->>'sales_order_id')::uuid
  loop
    select *
      into v_invoice
    from public.sales_orders so
    where so.id = r.sales_order_id
      and so.user_id = v_user_id
      and so.customer_id = p_customer_id;

    insert into public.invoice_payment_allocations (
      user_id,
      sales_order_id,
      order_no,
      journal_entry_id,
      journal_line_id,
      customer_id,
      customer_name,
      amount,
      allocation_date,
      reference,
      notes
    )
    values (
      v_user_id,
      v_invoice.id,
      v_invoice.order_no,
      v_journal_id,
      v_ar_line_id,
      v_customer.id,
      v_customer.name,
      r.amount,
      v_payment_date,
      nullif(btrim(p_reference), ''),
      nullif(btrim(p_notes), '')
    );
  end loop;


  return jsonb_build_object(
    'success', true,
    'entry_no', v_entry_no,
    'journal_entry_id', v_journal_id,
    'payment_amount', v_payment_amount,
    'allocated_amount', v_allocated_total,
    'advance_amount', round(v_payment_amount - v_allocated_total, 2),
    'customer_id', v_customer.id
  );
end;
$$;


-- ------------------------------------------------------------
-- 3. RPC permissions
-- ------------------------------------------------------------

revoke all on function public.receive_customer_payment(
  uuid,
  date,
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  numeric
) from public;

revoke all on function public.receive_customer_payment(
  uuid,
  date,
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  numeric
) from anon;

grant execute on function public.receive_customer_payment(
  uuid,
  date,
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  numeric
) to authenticated;


-- ------------------------------------------------------------
-- 4. Allocation history becomes immutable from browser/client
-- ------------------------------------------------------------

alter table public.invoice_payment_allocations
enable row level security;

drop policy if exists "insert_own_invoice_payment_allocations"
  on public.invoice_payment_allocations;

drop policy if exists "update_own_invoice_payment_allocations"
  on public.invoice_payment_allocations;

drop policy if exists "delete_own_invoice_payment_allocations"
  on public.invoice_payment_allocations;

drop policy if exists "select_own_invoice_payment_allocations"
  on public.invoice_payment_allocations;

create policy "select_own_invoice_payment_allocations"
on public.invoice_payment_allocations
for select
to authenticated
using (auth.uid() = user_id);

revoke insert, update, delete
on public.invoice_payment_allocations
from anon, authenticated;

grant select
on public.invoice_payment_allocations
to authenticated;


notify pgrst, 'reload schema';
