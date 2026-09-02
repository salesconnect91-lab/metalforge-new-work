begin;

create table if not exists public.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  statement_start date not null,
  statement_end date not null,
  opening_statement_balance numeric(14,2) not null default 0,
  closing_statement_balance numeric(14,2) not null default 0,
  calculated_statement_balance numeric(14,2) not null default 0,
  book_balance numeric(14,2) not null default 0,
  difference numeric(14,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','closed')),
  notes text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (statement_end >= statement_start),
  unique (user_id, account_id, statement_start, statement_end)
);

create table if not exists public.bank_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reconciliation_id uuid not null references public.bank_reconciliations(id) on delete cascade,
  ledger_id uuid not null references public.ledgers(id) on delete restrict,
  cleared_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, ledger_id)
);

create index if not exists idx_bank_recon_account_dates on public.bank_reconciliations(user_id, account_id, statement_end desc);
create index if not exists idx_bank_recon_items_recon on public.bank_reconciliation_items(user_id, reconciliation_id);

alter table public.bank_reconciliations enable row level security;
alter table public.bank_reconciliation_items enable row level security;
drop policy if exists bank_reconciliations_select_own on public.bank_reconciliations;
create policy bank_reconciliations_select_own on public.bank_reconciliations for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists bank_reconciliation_items_select_own on public.bank_reconciliation_items;
create policy bank_reconciliation_items_select_own on public.bank_reconciliation_items for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete on public.bank_reconciliations, public.bank_reconciliation_items from authenticated, anon;
grant select on public.bank_reconciliations, public.bank_reconciliation_items to authenticated;

create or replace function public.create_bank_reconciliation(
  p_account_id uuid, p_statement_start date, p_statement_end date,
  p_opening_balance numeric, p_closing_balance numeric, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Authentication is required.'; end if;
  if p_account_id is null or p_statement_start is null or p_statement_end is null then raise exception 'Bank account and statement dates are required.'; end if;
  if p_statement_end < p_statement_start then raise exception 'Statement end cannot be before statement start.'; end if;
  if not exists (
    select 1 from public.chart_of_accounts coa
    where coa.id=p_account_id and coa.user_id=v_user and coa.is_active=true and coa.is_group=false and coa.type='asset'
      and (exists(select 1 from public.account_mappings am where am.user_id=v_user and am.mapping_key='bank' and am.account_id=coa.id)
           or lower(coa.name) like '%bank%')
  ) then raise exception 'Select an active posting bank account.'; end if;
  if exists (select 1 from public.bank_reconciliations br where br.user_id=v_user and br.account_id=p_account_id and br.status='draft') then
    raise exception 'Complete or cancel the existing draft reconciliation for this bank account.';
  end if;
  if exists (select 1 from public.bank_reconciliations br where br.user_id=v_user and br.account_id=p_account_id and br.status='closed'
    and daterange(br.statement_start,br.statement_end,'[]') && daterange(p_statement_start,p_statement_end,'[]')) then
    raise exception 'This statement period overlaps a closed reconciliation.';
  end if;
  insert into public.bank_reconciliations(user_id,account_id,statement_start,statement_end,opening_statement_balance,closing_statement_balance,calculated_statement_balance,difference,notes)
  values(v_user,p_account_id,p_statement_start,p_statement_end,round(coalesce(p_opening_balance,0),2),round(coalesce(p_closing_balance,0),2),round(coalesce(p_opening_balance,0),2),round(coalesce(p_closing_balance,0)-coalesce(p_opening_balance,0),2),nullif(btrim(coalesce(p_notes,'')),'')) returning id into v_id;
  return jsonb_build_object('success',true,'reconciliation_id',v_id);
end; $$;

create or replace function public.set_bank_transaction_cleared(
  p_reconciliation_id uuid, p_ledger_id uuid, p_cleared boolean, p_cleared_date date default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_rec public.bank_reconciliations%rowtype; v_ledger public.ledgers%rowtype; v_calc numeric; v_diff numeric;
begin
  if v_user is null then raise exception 'Authentication is required.'; end if;
  select * into v_rec from public.bank_reconciliations where id=p_reconciliation_id and user_id=v_user for update;
  if not found then raise exception 'Reconciliation was not found.'; end if;
  if v_rec.status<>'draft' then raise exception 'Closed reconciliation is locked.'; end if;
  select * into v_ledger from public.ledgers where id=p_ledger_id and user_id=v_user and account_id=v_rec.account_id;
  if not found then raise exception 'Bank ledger transaction was not found.'; end if;
  if v_ledger.entry_date>v_rec.statement_end then raise exception 'Transaction is after the statement end date.'; end if;
  if p_cleared then
    if p_cleared_date is null or p_cleared_date<v_rec.statement_start or p_cleared_date>v_rec.statement_end then raise exception 'Cleared date must be inside the statement period.'; end if;
    insert into public.bank_reconciliation_items(user_id,reconciliation_id,ledger_id,cleared_date)
    values(v_user,v_rec.id,v_ledger.id,p_cleared_date)
    on conflict(user_id,ledger_id) do update set reconciliation_id=excluded.reconciliation_id,cleared_date=excluded.cleared_date
    where public.bank_reconciliation_items.reconciliation_id=v_rec.id;
    if not found then raise exception 'Transaction is already cleared in another reconciliation.'; end if;
  else
    delete from public.bank_reconciliation_items where user_id=v_user and reconciliation_id=v_rec.id and ledger_id=v_ledger.id;
  end if;
  select round(v_rec.opening_statement_balance+coalesce(sum(l.debit-l.credit),0),2) into v_calc
  from public.bank_reconciliation_items bri join public.ledgers l on l.id=bri.ledger_id
  where bri.user_id=v_user and bri.reconciliation_id=v_rec.id;
  v_diff:=round(v_rec.closing_statement_balance-v_calc,2);
  update public.bank_reconciliations set calculated_statement_balance=v_calc,difference=v_diff,updated_at=now() where id=v_rec.id;
  return jsonb_build_object('success',true,'calculated_balance',v_calc,'difference',v_diff);
end; $$;

create or replace function public.close_bank_reconciliation(p_reconciliation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_rec public.bank_reconciliations%rowtype; v_calc numeric; v_book numeric; v_diff numeric;
begin
  if v_user is null then raise exception 'Authentication is required.'; end if;
  select * into v_rec from public.bank_reconciliations where id=p_reconciliation_id and user_id=v_user for update;
  if not found then raise exception 'Reconciliation was not found.'; end if;
  if v_rec.status<>'draft' then raise exception 'Reconciliation is already closed.'; end if;
  select round(v_rec.opening_statement_balance+coalesce(sum(l.debit-l.credit),0),2) into v_calc
  from public.bank_reconciliation_items bri join public.ledgers l on l.id=bri.ledger_id
  where bri.user_id=v_user and bri.reconciliation_id=v_rec.id;
  select round(coalesce(sum(debit-credit),0),2) into v_book from public.ledgers
  where user_id=v_user and account_id=v_rec.account_id and entry_date<=v_rec.statement_end;
  v_diff:=round(v_rec.closing_statement_balance-v_calc,2);
  if abs(v_diff)>0.009 then raise exception 'Reconciliation difference must be zero before closing. Current difference: %',v_diff; end if;
  update public.bank_reconciliations set calculated_statement_balance=v_calc,book_balance=v_book,difference=v_diff,status='closed',closed_at=now(),closed_by=v_user,updated_at=now() where id=v_rec.id;
  return jsonb_build_object('success',true,'status','closed','book_balance',v_book,'statement_balance',v_calc,'difference',v_diff);
end; $$;

create or replace function public.cancel_bank_reconciliation(p_reconciliation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication is required.'; end if;
  delete from public.bank_reconciliations where id=p_reconciliation_id and user_id=v_user and status='draft';
  if not found then raise exception 'Draft reconciliation was not found.'; end if;
  return jsonb_build_object('success',true);
end; $$;

revoke all on function public.create_bank_reconciliation(uuid,date,date,numeric,numeric,text) from public,anon;
revoke all on function public.set_bank_transaction_cleared(uuid,uuid,boolean,date) from public,anon;
revoke all on function public.close_bank_reconciliation(uuid) from public,anon;
revoke all on function public.cancel_bank_reconciliation(uuid) from public,anon;
grant execute on function public.create_bank_reconciliation(uuid,date,date,numeric,numeric,text) to authenticated;
grant execute on function public.set_bank_transaction_cleared(uuid,uuid,boolean,date) to authenticated;
grant execute on function public.close_bank_reconciliation(uuid) to authenticated;
grant execute on function public.cancel_bank_reconciliation(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
