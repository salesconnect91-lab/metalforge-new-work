-- ============================================================
-- 0037 - Lock Accounting Records
-- ============================================================
-- Goals:
--   * Draft journals remain editable from Journal Entry UI
--   * Browser cannot directly mark a journal as posted
--   * Posted journals and their lines are immutable
--   * Journal lines must belong to the same user as header
--   * General Ledger is read-only from browser
--   * Party Ledger is read-only from browser
--   * Trusted SECURITY DEFINER posting engines keep working
-- ============================================================


-- ------------------------------------------------------------
-- 1. JOURNAL HEADER INTEGRITY
-- ------------------------------------------------------------

create or replace function public.guard_journal_entry_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is null then
      new.user_id := auth.uid();
    end if;

    if auth.uid() is not null
       and new.user_id is distinct from auth.uid() then
      raise exception 'Journal entry owner is invalid.';
    end if;

    -- Browser/manual creation must always begin as draft.
    if current_user = 'authenticated'
       and coalesce(new.status, 'draft') <> 'draft' then
      raise exception
        'New journal entries must be created as draft.';
    end if;

    return new;
  end if;


  if tg_op = 'DELETE' then
    if old.status = 'posted' then
      raise exception
        'Posted journal entries cannot be deleted.';
    end if;

    return old;
  end if;


  -- user ownership may never change.
  if new.user_id is distinct from old.user_id then
    raise exception
      'Journal entry owner cannot be changed.';
  end if;


  -- Once posted, journal is permanently locked.
  if old.status = 'posted' then
    raise exception
      'Posted journal entries cannot be modified.';
  end if;


  -- Direct client-side posting is forbidden.
  -- post_journal_entry() runs SECURITY DEFINER and therefore
  -- is allowed to make the validated draft -> posted transition.
  if old.status <> 'posted'
     and new.status = 'posted'
     and current_user = 'authenticated' then
    raise exception
      'Use the journal posting process to post this entry.';
  end if;


  if new.status not in ('draft', 'posted') then
    raise exception 'Invalid journal status.';
  end if;

  return new;
end;
$$;


drop trigger if exists trg_guard_journal_entry_changes
on public.journal_entries;

create trigger trg_guard_journal_entry_changes
before insert or update or delete
on public.journal_entries
for each row
execute function public.guard_journal_entry_changes();


-- ------------------------------------------------------------
-- 2. JOURNAL LINE INTEGRITY
-- ------------------------------------------------------------

create or replace function public.guard_journal_line_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_user uuid;
  v_entry_status text;
begin

  if tg_op = 'DELETE' then
    select je.user_id, je.status
      into v_entry_user, v_entry_status
    from public.journal_entries je
    where je.id = old.entry_id;

    if v_entry_status = 'posted' then
      raise exception
        'Lines of a posted journal entry cannot be deleted.';
    end if;

    return old;
  end if;


  -- Header must exist and line must belong to same owner.
  select je.user_id, je.status
    into v_entry_user, v_entry_status
  from public.journal_entries je
  where je.id = new.entry_id;

  if not found then
    raise exception 'Journal entry not found.';
  end if;


  if new.user_id is null then
    new.user_id := auth.uid();
  end if;


  if new.user_id is distinct from v_entry_user then
    raise exception
      'Journal line owner must match journal entry owner.';
  end if;


  -- Users may only edit lines while header is draft.
  if v_entry_status <> 'draft' then
    raise exception
      'Lines of a posted journal entry cannot be modified.';
  end if;


  if tg_op = 'UPDATE' then

    if new.user_id is distinct from old.user_id then
      raise exception
        'Journal line owner cannot be changed.';
    end if;


    -- If somebody attempts to move a line to another journal,
    -- verify the old journal is also still draft.
    if new.entry_id is distinct from old.entry_id then

      select je.status
        into v_entry_status
      from public.journal_entries je
      where je.id = old.entry_id;

      if v_entry_status <> 'draft' then
        raise exception
          'Lines of a posted journal entry cannot be moved.';
      end if;

    end if;

  end if;


  if coalesce(new.debit, 0) < 0
     or coalesce(new.credit, 0) < 0 then
    raise exception
      'Debit and credit cannot be negative.';
  end if;


  if coalesce(new.debit, 0) > 0
     and coalesce(new.credit, 0) > 0 then
    raise exception
      'A journal line cannot contain both debit and credit.';
  end if;


  if coalesce(new.debit, 0) <= 0
     and coalesce(new.credit, 0) <= 0 then
    raise exception
      'Enter either debit or credit.';
  end if;


  return new;
end;
$$;


drop trigger if exists trg_guard_journal_line_changes
on public.journal_lines;

create trigger trg_guard_journal_line_changes
before insert or update or delete
on public.journal_lines
for each row
execute function public.guard_journal_line_changes();


-- ------------------------------------------------------------
-- 3. GENERAL LEDGER = SYSTEM GENERATED / READ ONLY
-- ------------------------------------------------------------

alter table public.ledgers
enable row level security;

drop policy if exists "insert_own_ledgers"
on public.ledgers;

drop policy if exists "update_own_ledgers"
on public.ledgers;

drop policy if exists "delete_own_ledgers"
on public.ledgers;

drop policy if exists "select_own_ledgers"
on public.ledgers;

create policy "select_own_ledgers"
on public.ledgers
for select
to authenticated
using (auth.uid() = user_id);

revoke insert, update, delete
on public.ledgers
from anon, authenticated;

grant select
on public.ledgers
to authenticated;


-- ------------------------------------------------------------
-- 4. PARTY LEDGER = SYSTEM GENERATED / READ ONLY
-- ------------------------------------------------------------

alter table public.party_ledgers
enable row level security;

drop policy if exists "insert_own_party_ledgers"
on public.party_ledgers;

drop policy if exists "update_own_party_ledgers"
on public.party_ledgers;

drop policy if exists "delete_own_party_ledgers"
on public.party_ledgers;

drop policy if exists "select_own_party_ledgers"
on public.party_ledgers;

create policy "select_own_party_ledgers"
on public.party_ledgers
for select
to authenticated
using (auth.uid() = user_id);

revoke insert, update, delete
on public.party_ledgers
from anon, authenticated;

grant select
on public.party_ledgers
to authenticated;


-- ------------------------------------------------------------
-- 5. LIMIT JOURNAL HEADER CLIENT UPDATE COLUMNS
-- ------------------------------------------------------------

revoke update
on public.journal_entries
from authenticated;

grant update (
  entry_no,
  entry_date,
  description,
  payment_mode,
  party_name,
  received_by,
  trans_type
)
on public.journal_entries
to authenticated;


-- ------------------------------------------------------------
-- 6. LIMIT JOURNAL LINE CLIENT UPDATE COLUMNS
-- ------------------------------------------------------------

revoke update
on public.journal_lines
from authenticated;

grant update (
  account,
  debit,
  credit,
  account_id,
  party_name,
  party_type,
  party_id
)
on public.journal_lines
to authenticated;


-- ------------------------------------------------------------
-- 7. FUNCTION PERMISSIONS
-- ------------------------------------------------------------

revoke all on function public.guard_journal_entry_changes()
from public, anon, authenticated;

revoke all on function public.guard_journal_line_changes()
from public, anon, authenticated;


notify pgrst, 'reload schema';
