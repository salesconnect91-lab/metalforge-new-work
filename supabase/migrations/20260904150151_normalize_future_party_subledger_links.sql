create or replace function public.normalize_journal_line_party_metadata()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_valid boolean := false;
begin
  if new.party_type is null or new.party_id is null then
    return new;
  end if;

  if new.party_type = 'customer' then
    select exists (
      select 1
      from public.customers c
      left join public.account_mappings am
        on am.user_id = new.user_id
       and am.company_id = new.company_id
       and am.mapping_key = 'accounts_receivable'
      where c.id = new.party_id
        and c.user_id = new.user_id
        and c.company_id = new.company_id
        and new.account_id in (c.account_id, am.account_id)
    ) into v_valid;
  elsif new.party_type = 'supplier' then
    select exists (
      select 1
      from public.suppliers s
      left join public.account_mappings am
        on am.user_id = new.user_id
       and am.company_id = new.company_id
       and am.mapping_key = 'accounts_payable'
      where s.id = new.party_id
        and s.user_id = new.user_id
        and s.company_id = new.company_id
        and new.account_id in (s.account_id, am.account_id)
    ) into v_valid;
  else
    v_valid := false;
  end if;

  if not v_valid then
    new.party_type := null;
    new.party_id := null;
    new.party_name := null;
  end if;

  return new;
end;
$$;

revoke all on function public.normalize_journal_line_party_metadata() from public, anon, authenticated;

drop trigger if exists trg_normalize_journal_line_party_metadata on public.journal_lines;
create trigger trg_normalize_journal_line_party_metadata
before insert or update of account_id, party_type, party_id, party_name
on public.journal_lines
for each row execute function public.normalize_journal_line_party_metadata();

create or replace function public.link_party_ledger_to_control_line()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line_id uuid;
begin
  if new.journal_line_id is not null or new.journal_entry_id is null then
    return new;
  end if;

  select jl.id
    into v_line_id
  from public.journal_lines jl
  where jl.entry_id = new.journal_entry_id
    and jl.user_id = new.user_id
    and jl.company_id = new.company_id
    and jl.party_type = new.party_type
    and jl.party_id = new.party_id
    and abs(coalesce(jl.debit,0) - coalesce(new.debit,0)) < 0.01
    and abs(coalesce(jl.credit,0) - coalesce(new.credit,0)) < 0.01
  order by jl.id
  limit 1;

  if v_line_id is not null then
    new.journal_line_id := v_line_id;
  end if;

  return new;
end;
$$;

revoke all on function public.link_party_ledger_to_control_line() from public, anon, authenticated;

drop trigger if exists trg_link_party_ledger_to_control_line on public.party_ledgers;
create trigger trg_link_party_ledger_to_control_line
before insert or update of journal_entry_id, party_type, party_id, debit, credit
on public.party_ledgers
for each row execute function public.link_party_ledger_to_control_line();
