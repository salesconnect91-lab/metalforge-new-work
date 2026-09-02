-- ============================================================
-- 0036 - Supplier Payment Engine
-- ============================================================
-- Accounting:
--   Dr Accounts Payable
--   Cr Cash / Bank
--
-- Supports:
--   * partial/full supplier payments
--   * purchase invoice allocation
--   * supplier party ledger
--   * paid/outstanding/payment status
--   * immutable payment allocation history
-- ============================================================


-- ------------------------------------------------------------
-- 1. Supplier payment allocation history
-- ------------------------------------------------------------

create table if not exists public.purchase_payment_allocations (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    default auth.uid()
    references auth.users(id)
    on delete cascade,

  purchase_order_id uuid not null
    references public.purchase_orders(id)
    on delete restrict,

  order_no text,

  journal_entry_id uuid
    references public.journal_entries(id)
    on delete set null,

  journal_line_id uuid
    references public.journal_lines(id)
    on delete set null,

  supplier_id uuid
    references public.suppliers(id)
    on delete restrict,

  supplier_name text,

  amount numeric(14,2) not null
    check (amount > 0),

  allocation_date date not null
    default current_date,

  reference text,
  notes text,

  created_at timestamptz not null
    default now()
);

create index if not exists idx_purchase_payment_alloc_order
on public.purchase_payment_allocations(
  purchase_order_id,
  allocation_date desc
);

create index if not exists idx_purchase_payment_alloc_supplier
on public.purchase_payment_allocations(
  supplier_id,
  allocation_date desc
);

create index if not exists idx_purchase_payment_alloc_journal
on public.purchase_payment_allocations(journal_entry_id);

alter table public.purchase_payment_allocations
enable row level security;

drop policy if exists "select_own_purchase_payment_allocations"
on public.purchase_payment_allocations;

create policy "select_own_purchase_payment_allocations"
on public.purchase_payment_allocations
for select
to authenticated
using (auth.uid() = user_id);

revoke insert, update, delete
on public.purchase_payment_allocations
from anon, authenticated;

grant select
on public.purchase_payment_allocations
to authenticated;


-- ------------------------------------------------------------
-- 2. Allow ONLY trusted payment-status updates on posted PO
-- ------------------------------------------------------------

create or replace function public.prevent_posted_purchase_order_changes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_payment_update text;
begin
  if old.status = 'posted' then

    if tg_op = 'DELETE' then
      raise exception
        'Posted purchase orders cannot be modified or deleted.';
    end if;

    v_payment_update :=
      current_setting(
        'app.supplier_payment_update',
        true
      );

    if coalesce(v_payment_update, '0') <> '1' then
      raise exception
        'Posted purchase orders cannot be modified or deleted.';
    end if;

    -- During supplier payment processing, ONLY payment fields
    -- are permitted to change.
    if
      (
        to_jsonb(new)
          - 'paid_amount'
          - 'outstanding_amount'
          - 'payment_status'
      )
      is distinct from
      (
        to_jsonb(old)
          - 'paid_amount'
          - 'outstanding_amount'
          - 'payment_status'
      )
    then
      raise exception
        'Only payment status fields may change on a posted purchase order.';
    end if;
  end if;

  return new;
end;
$$;


-- ------------------------------------------------------------
-- 3. Initialize payment status when Purchase is posted
-- ------------------------------------------------------------
-- Since post_purchase_invoice marks status = posted, we use an
-- AFTER UPDATE trigger to initialize outstanding = total once.
-- ------------------------------------------------------------

create or replace function public.initialize_purchase_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from 'posted'
     and new.status = 'posted' then

    perform set_config(
      'app.supplier_payment_update',
      '1',
      true
    );

    update public.purchase_orders
    set
      paid_amount = coalesce(paid_amount, 0),
      outstanding_amount =
        greatest(
          round(coalesce(total, 0), 2)
          - round(coalesce(paid_amount, 0), 2),
          0
        ),
      payment_status =
        case
          when round(coalesce(paid_amount, 0), 2)
               >= round(coalesce(total, 0), 2)
            then 'paid'
          when round(coalesce(paid_amount, 0), 2) > 0
            then 'partial'
          else 'unpaid'
        end
    where id = new.id
      and user_id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_initialize_purchase_payment_status
on public.purchase_orders;

create trigger trg_initialize_purchase_payment_status
after update of status
on public.purchase_orders
for each row
execute function public.initialize_purchase_payment_status();


-- ------------------------------------------------------------
-- 3B. Purchase payment status columns
-- ------------------------------------------------------------

alter table public.purchase_orders
  add column if not exists paid_amount numeric(14,2) not null default 0;

alter table public.purchase_orders
  add column if not exists outstanding_amount numeric(14,2) not null default 0;

alter table public.purchase_orders
  add column if not exists payment_status text not null default 'unpaid';

-- ------------------------------------------------------------
-- 4. Backfill already-posted purchase invoices
-- ------------------------------------------------------------

do $$
begin
  perform set_config(
    'app.supplier_payment_update',
    '1',
    true
  );

  update public.purchase_orders
  set
    paid_amount = coalesce(paid_amount, 0),

    outstanding_amount =
      greatest(
        round(coalesce(total, 0), 2)
        - round(coalesce(paid_amount, 0), 2),
        0
      ),

    payment_status =
      case
        when round(coalesce(paid_amount, 0), 2)
             >= round(coalesce(total, 0), 2)
          then 'paid'
        when round(coalesce(paid_amount, 0), 2) > 0
          then 'partial'
        else 'unpaid'
      end
  where status = 'posted';
end
$$;


-- ------------------------------------------------------------
-- 5. Supplier Payment RPC
-- ------------------------------------------------------------

create or replace function public.pay_supplier(
  p_supplier_id uuid,
  p_payment_date date,
  p_payment_account_id uuid,
  p_payment_method text,
  p_reference text,
  p_description text,
  p_notes text,
  p_purchase_order_id uuid,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();

  v_supplier public.suppliers%rowtype;
  v_order public.purchase_orders%rowtype;

  v_ap_account_id uuid;
  v_cash_account_id uuid;
  v_bank_account_id uuid;

  v_payment_amount numeric;
  v_existing_paid numeric;
  v_outstanding numeric;

  v_payment_date date :=
    coalesce(p_payment_date, current_date);

  v_journal_id uuid;
  v_ap_line_id uuid;

  v_entry_no text;
  v_next_no bigint;

  v_payment_account_text text;
  v_ap_account_text text;
begin
  -- ----------------------------------------------------------
  -- Authentication
  -- ----------------------------------------------------------

  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_supplier_id is null then
    raise exception 'Supplier is required.';
  end if;

  if p_purchase_order_id is null then
    raise exception 'Purchase invoice is required.';
  end if;

  if p_payment_account_id is null then
    raise exception 'Payment account is required.';
  end if;

  v_payment_amount :=
    round(coalesce(p_amount, 0), 2);

  if v_payment_amount <= 0 then
    raise exception
      'Payment amount must be greater than zero.';
  end if;


  -- ----------------------------------------------------------
  -- Supplier
  -- ----------------------------------------------------------

  select *
  into v_supplier
  from public.suppliers s
  where s.id = p_supplier_id
    and s.user_id = v_user_id
  for update;

  if not found then
    raise exception
      'Supplier not found or access denied.';
  end if;


  -- ----------------------------------------------------------
  -- Purchase invoice
  -- ----------------------------------------------------------

  select *
  into v_order
  from public.purchase_orders po
  where po.id = p_purchase_order_id
    and po.user_id = v_user_id
    and po.supplier_id = p_supplier_id
  for update;

  if not found then
    raise exception
      'Purchase invoice does not belong to the selected supplier.';
  end if;

  if v_order.status <> 'posted' then
    raise exception
      'Only posted purchase invoices can be paid.';
  end if;


  -- ----------------------------------------------------------
  -- Accounting mappings
  -- ----------------------------------------------------------

  select am.account_id
  into v_ap_account_id
  from public.account_mappings am
  where am.user_id = v_user_id
    and am.mapping_key = 'accounts_payable'
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

  if v_ap_account_id is null then
    raise exception
      'Accounts Payable mapping is missing.';
  end if;

  if v_supplier.account_id is distinct from v_ap_account_id then
    raise exception
      'Supplier is not linked to the configured Accounts Payable account.';
  end if;

  if p_payment_account_id is distinct from v_cash_account_id
     and p_payment_account_id is distinct from v_bank_account_id then
    raise exception
      'Payment account must be the configured Cash or Bank account.';
  end if;


  -- ----------------------------------------------------------
  -- Invoice outstanding validation
  -- ----------------------------------------------------------

  select coalesce(sum(a.amount), 0)
  into v_existing_paid
  from public.purchase_payment_allocations a
  where a.user_id = v_user_id
    and a.purchase_order_id = v_order.id;

  v_existing_paid :=
    round(coalesce(v_existing_paid, 0), 2);

  v_outstanding :=
    greatest(
      round(coalesce(v_order.total, 0), 2)
      - v_existing_paid,
      0
    );

  if v_payment_amount > v_outstanding + 0.005 then
    raise exception
      'Payment exceeds purchase invoice outstanding balance. Outstanding: %, Payment: %.',
      v_outstanding,
      v_payment_amount;
  end if;


  -- ----------------------------------------------------------
  -- Account display names
  -- ----------------------------------------------------------

  select coa.code || ' - ' || coa.name
  into v_payment_account_text
  from public.chart_of_accounts coa
  where coa.id = p_payment_account_id
    and coa.user_id = v_user_id;

  if v_payment_account_text is null then
    raise exception
      'Selected payment account does not exist.';
  end if;

  select coa.code || ' - ' || coa.name
  into v_ap_account_text
  from public.chart_of_accounts coa
  where coa.id = v_ap_account_id
    and coa.user_id = v_user_id;

  if v_ap_account_text is null then
    raise exception
      'Accounts Payable account does not exist.';
  end if;


  -- ----------------------------------------------------------
  -- Generate supplier payment number
  -- ----------------------------------------------------------

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_user_id::text || ':supplier_payment_number',
      0
    )
  );

  select
    coalesce(
      max(
        nullif(
          substring(
            je.entry_no
            from '^SP-([0-9]+)$'
          ),
          ''
        )::bigint
      ),
      0
    ) + 1
  into v_next_no
  from public.journal_entries je
  where je.user_id = v_user_id
    and je.entry_no ~ '^SP-[0-9]+$';

  v_entry_no :=
    'SP-' || lpad(v_next_no::text, 4, '0');


  -- ----------------------------------------------------------
  -- Create draft journal
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
      'Supplier Payment - ' || v_supplier.name
    ),
    'draft',
    coalesce(
      nullif(btrim(p_payment_method), ''),
      'Payment'
    ),
    v_supplier.name,
    'Supplier Payment'
  )
  returning id into v_journal_id;


  -- ----------------------------------------------------------
  -- Dr Accounts Payable
  -- ----------------------------------------------------------

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
    v_ap_account_text,
    v_payment_amount,
    0,
    v_ap_account_id,
    v_supplier.name,
    'supplier',
    v_supplier.id
  )
  returning id into v_ap_line_id;


  -- ----------------------------------------------------------
  -- Cr Cash / Bank
  -- ----------------------------------------------------------

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
    0,
    v_payment_amount,
    p_payment_account_id,
    null,
    null,
    null
  );


  -- ----------------------------------------------------------
  -- Centralized posting
  -- Creates GL + supplier party ledger
  -- ----------------------------------------------------------

  perform public.post_journal_entry(v_journal_id);


  -- ----------------------------------------------------------
  -- Payment allocation history
  -- ----------------------------------------------------------

  insert into public.purchase_payment_allocations (
    user_id,
    purchase_order_id,
    order_no,
    journal_entry_id,
    journal_line_id,
    supplier_id,
    supplier_name,
    amount,
    allocation_date,
    reference,
    notes
  )
  values (
    v_user_id,
    v_order.id,
    v_order.order_no,
    v_journal_id,
    v_ap_line_id,
    v_supplier.id,
    v_supplier.name,
    v_payment_amount,
    v_payment_date,
    nullif(btrim(p_reference), ''),
    nullif(btrim(p_notes), '')
  );


  -- ----------------------------------------------------------
  -- Update purchase invoice payment status
  -- ----------------------------------------------------------

  v_existing_paid :=
    round(v_existing_paid + v_payment_amount, 2);

  v_outstanding :=
    greatest(
      round(coalesce(v_order.total, 0), 2)
      - v_existing_paid,
      0
    );

  perform set_config(
    'app.supplier_payment_update',
    '1',
    true
  );

  update public.purchase_orders
  set
    paid_amount = v_existing_paid,
    outstanding_amount = v_outstanding,
    payment_status =
      case
        when v_existing_paid
             >= round(coalesce(total, 0), 2)
          then 'paid'
        when v_existing_paid > 0
          then 'partial'
        else 'unpaid'
      end
  where id = v_order.id
    and user_id = v_user_id;


  return jsonb_build_object(
    'success', true,
    'entry_no', v_entry_no,
    'journal_entry_id', v_journal_id,
    'payment_amount', v_payment_amount,
    'paid_amount', v_existing_paid,
    'outstanding_amount', v_outstanding,
    'purchase_order_id', v_order.id,
    'supplier_id', v_supplier.id
  );
end;
$$;


-- ------------------------------------------------------------
-- 6. RPC permissions
-- ------------------------------------------------------------

revoke all on function public.pay_supplier(
  uuid,
  date,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  numeric
) from public;

revoke all on function public.pay_supplier(
  uuid,
  date,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  numeric
) from anon;

grant execute on function public.pay_supplier(
  uuid,
  date,
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  numeric
) to authenticated;


notify pgrst, 'reload schema';
