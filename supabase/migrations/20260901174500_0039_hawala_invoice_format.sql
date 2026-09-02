-- ============================================================
-- 0039 - Hawala invoice full sales-format fields + hardening
-- ============================================================

alter table public.consolidated_sales_invoices
  add column if not exists customer_id uuid references public.customers(id) on delete restrict,
  add column if not exists invoice_type text not null default 'Tax Invoice',
  add column if not exists tax_percent numeric(8,3) not null default 18,
  add column if not exists item_tax numeric(18,2) not null default 0,
  add column if not exists charges_total numeric(18,2) not null default 0,
  add column if not exists charge_tax numeric(18,2) not null default 0;

alter table public.consolidated_sales_invoice_lines
  add column if not exists tax_percent numeric(8,3) not null default 0,
  add column if not exists unit_cost_at_posting numeric(18,4),
  add column if not exists cogs_total numeric(18,2);

create table if not exists public.consolidated_sales_invoice_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  invoice_id uuid not null
    references public.consolidated_sales_invoices(id) on delete cascade,
  charge_key text not null,
  amount numeric(18,2) not null default 0,
  tax_percent numeric(8,3) not null default 0,
  created_at timestamptz not null default now(),
  unique(invoice_id, charge_key)
);

create index if not exists idx_consolidated_sales_invoice_charges_invoice
on public.consolidated_sales_invoice_charges(invoice_id);

alter table public.consolidated_sales_invoice_charges enable row level security;

drop policy if exists consolidated_sales_invoice_charges_select_own
on public.consolidated_sales_invoice_charges;
create policy consolidated_sales_invoice_charges_select_own
on public.consolidated_sales_invoice_charges
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists consolidated_sales_invoice_charges_insert_own
on public.consolidated_sales_invoice_charges;
create policy consolidated_sales_invoice_charges_insert_own
on public.consolidated_sales_invoice_charges
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists consolidated_sales_invoice_charges_update_own
on public.consolidated_sales_invoice_charges;
create policy consolidated_sales_invoice_charges_update_own
on public.consolidated_sales_invoice_charges
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists consolidated_sales_invoice_charges_delete_own
on public.consolidated_sales_invoice_charges;
create policy consolidated_sales_invoice_charges_delete_own
on public.consolidated_sales_invoice_charges
for delete to authenticated
using (auth.uid() = user_id);

create or replace function public.guard_consolidated_sales_invoice_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Posted Consolidated/Hawala invoices are locked.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status <> 'draft' then
    raise exception 'Posted Consolidated/Hawala invoices are locked.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_consolidated_sales_invoice_changes
on public.consolidated_sales_invoices;

create trigger trg_guard_consolidated_sales_invoice_changes
before update or delete
on public.consolidated_sales_invoices
for each row
execute function public.guard_consolidated_sales_invoice_changes();

create or replace function public.guard_consolidated_sales_child_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_status text;
begin
  v_invoice_id :=
    case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;

  select status
  into v_status
  from public.consolidated_sales_invoices
  where id = v_invoice_id;

  if v_status is distinct from 'draft' then
    raise exception 'Posted Consolidated/Hawala invoice details are locked.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_consolidated_sales_lines
on public.consolidated_sales_invoice_lines;

create trigger trg_guard_consolidated_sales_lines
before insert or update or delete
on public.consolidated_sales_invoice_lines
for each row
execute function public.guard_consolidated_sales_child_changes();

drop trigger if exists trg_guard_consolidated_sales_charges
on public.consolidated_sales_invoice_charges;

create trigger trg_guard_consolidated_sales_charges
before insert or update or delete
on public.consolidated_sales_invoice_charges
for each row
execute function public.guard_consolidated_sales_child_changes();

revoke all
on function public.guard_consolidated_sales_invoice_changes()
from public, anon, authenticated;

revoke all
on function public.guard_consolidated_sales_child_changes()
from public, anon, authenticated;

notify pgrst, 'reload schema';
