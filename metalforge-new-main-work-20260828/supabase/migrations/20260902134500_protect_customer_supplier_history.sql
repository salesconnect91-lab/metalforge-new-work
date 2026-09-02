-- Preserve customer/supplier accounting history through active/inactive lifecycle.

alter table public.customers
  add column if not exists is_active boolean not null default true;

alter table public.suppliers
  add column if not exists is_active boolean not null default true;

create index if not exists idx_customers_user_active
  on public.customers (user_id, is_active);

create index if not exists idx_suppliers_user_active
  on public.suppliers (user_id, is_active);

alter table public.party_ledgers
  add column if not exists party_name text;

update public.party_ledgers pl
set party_name = case
  when pl.party_type = 'customer' then (
    select c.name from public.customers c
    where c.id = pl.party_id and c.user_id = pl.user_id
  )
  when pl.party_type = 'supplier' then (
    select s.name from public.suppliers s
    where s.id = pl.party_id and s.user_id = pl.user_id
  )
end
where nullif(btrim(pl.party_name), '') is null;

create or replace function public.snapshot_party_ledger_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.party_type = 'customer' then
    select c.name into new.party_name
    from public.customers c
    where c.id = new.party_id and c.user_id = new.user_id;
  elsif new.party_type = 'supplier' then
    select s.name into new.party_name
    from public.suppliers s
    where s.id = new.party_id and s.user_id = new.user_id;
  end if;

  if nullif(btrim(coalesce(new.party_name, '')), '') is null then
    raise exception 'Party does not exist or belongs to another company.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_snapshot_party_ledger_name on public.party_ledgers;
create trigger trg_snapshot_party_ledger_name
before insert or update of party_type, party_id, user_id
on public.party_ledgers
for each row execute function public.snapshot_party_ledger_name();

create or replace function public.protect_customer_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.sales_orders where customer_id = old.id)
     or exists (select 1 from public.cutting_orders where customer_id = old.id)
     or exists (select 1 from public.invoice_payment_allocations where customer_id = old.id)
     or exists (select 1 from public.payment_reminders where customer_id = old.id)
     or exists (
       select 1 from public.journal_lines
       where party_type = 'customer' and party_id = old.id
     )
     or exists (
       select 1 from public.party_ledgers
       where party_type = 'customer' and party_id = old.id
     ) then
    raise exception 'Customer has accounting or transaction history. Deactivate the customer instead of deleting it.';
  end if;
  return old;
end;
$$;

create or replace function public.protect_supplier_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.purchase_orders where supplier_id = old.id)
     or exists (select 1 from public.purchase_payment_allocations where supplier_id = old.id)
     or exists (
       select 1 from public.journal_lines
       where party_type = 'supplier' and party_id = old.id
     )
     or exists (
       select 1 from public.party_ledgers
       where party_type = 'supplier' and party_id = old.id
     ) then
    raise exception 'Supplier has accounting or transaction history. Deactivate the supplier instead of deleting it.';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_protect_customer_history on public.customers;
create trigger trg_protect_customer_history
before delete on public.customers
for each row execute function public.protect_customer_history();

drop trigger if exists trg_protect_supplier_history on public.suppliers;
create trigger trg_protect_supplier_history
before delete on public.suppliers
for each row execute function public.protect_supplier_history();

create or replace function public.guard_active_transaction_party()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_party_id uuid;
  v_party_active boolean;
  v_party_user uuid;
begin
  v_party_id := nullif(pg_catalog.to_jsonb(new) ->> tg_argv[0], '')::uuid;
  if v_party_id is null then return new; end if;

  if tg_argv[1] = 'customers' then
    select c.is_active, c.user_id into v_party_active, v_party_user
    from public.customers c where c.id = v_party_id;
  elsif tg_argv[1] = 'suppliers' then
    select s.is_active, s.user_id into v_party_active, v_party_user
    from public.suppliers s where s.id = v_party_id;
  else
    raise exception 'Invalid party lifecycle trigger configuration.';
  end if;

  if v_party_user is null or v_party_user is distinct from new.user_id then
    raise exception 'Selected party does not exist or belongs to another company.';
  end if;

  if not v_party_active then
    raise exception 'Inactive parties cannot be used for new transactions.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sales_order_active_customer on public.sales_orders;
create trigger trg_sales_order_active_customer
before insert or update of customer_id on public.sales_orders
for each row execute function public.guard_active_transaction_party('customer_id', 'customers');

drop trigger if exists trg_cutting_order_active_customer on public.cutting_orders;
create trigger trg_cutting_order_active_customer
before insert or update of customer_id on public.cutting_orders
for each row execute function public.guard_active_transaction_party('customer_id', 'customers');

drop trigger if exists trg_purchase_order_active_supplier on public.purchase_orders;
create trigger trg_purchase_order_active_supplier
before insert or update of supplier_id on public.purchase_orders
for each row execute function public.guard_active_transaction_party('supplier_id', 'suppliers');

revoke all on function public.snapshot_party_ledger_name() from public, anon, authenticated;
revoke all on function public.protect_customer_history() from public, anon, authenticated;
revoke all on function public.protect_supplier_history() from public, anon, authenticated;
revoke all on function public.guard_active_transaction_party() from public, anon, authenticated;

notify pgrst, 'reload schema';
