-- Lender master + lender-wise loan ledger, scoped to active company/business unit.
-- Production migration applied through Supabase on 2026-09-12.

create table if not exists public.loan_parties (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(),
  company_id uuid not null, business_unit_id uuid, name text not null, phone text, notes text,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.loan_party_transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(),
  company_id uuid not null, business_unit_id uuid, lender_id uuid not null references public.loan_parties(id),
  journal_entry_id uuid references public.journal_entries(id), transaction_date date not null,
  transaction_type text not null check (transaction_type in ('loan_received','loan_repayment')),
  amount numeric not null check (amount>0), reference text, notes text, created_at timestamptz not null default now()
);
create index if not exists loan_parties_company_name_idx on public.loan_parties(company_id,name);
create index if not exists loan_party_tx_lender_date_idx on public.loan_party_transactions(lender_id,transaction_date,created_at);
alter table public.loan_parties enable row level security;
alter table public.loan_party_transactions enable row level security;

drop policy if exists loan_parties_user_scope on public.loan_parties;
drop policy if exists loan_parties_company_bu_scope on public.loan_parties;
create policy loan_parties_company_bu_scope on public.loan_parties for all to authenticated
using (user_id=auth.uid() and company_id=public.current_company_id() and (business_unit_id is null or business_unit_id=public.current_business_unit_id()))
with check (user_id=auth.uid() and company_id=public.current_company_id() and (business_unit_id is null or business_unit_id=public.current_business_unit_id()));

drop policy if exists loan_party_transactions_user_scope on public.loan_party_transactions;
drop policy if exists loan_party_transactions_company_bu_scope on public.loan_party_transactions;
create policy loan_party_transactions_company_bu_scope on public.loan_party_transactions for all to authenticated
using (user_id=auth.uid() and company_id=public.current_company_id() and (business_unit_id is null or business_unit_id=public.current_business_unit_id()))
with check (user_id=auth.uid() and company_id=public.current_company_id() and (business_unit_id is null or business_unit_id=public.current_business_unit_id()));

grant select,insert,update on public.loan_parties to authenticated;
grant select,insert on public.loan_party_transactions to authenticated;

-- Function bodies are maintained in production and were applied with this migration set:
-- create_loan_party(text,text,text)
-- record_loan_party_transaction(uuid,uuid,date,text,numeric,text,text)
-- post_loan_party_transaction(uuid,text,date,uuid,numeric,text,text)
-- Anonymous EXECUTE has been revoked from lender and salary SECURITY DEFINER RPCs.
