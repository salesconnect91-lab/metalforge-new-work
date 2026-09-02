-- Atomic, owner-scoped bulk journal draft import.
-- Existing data is never deleted or rewritten by this migration.

create or replace function public.guard_unique_journal_entry_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  if new.entry_no is null or btrim(new.entry_no) = '' then
    raise exception 'Journal entry number is required.';
  end if;

  new.entry_no := btrim(new.entry_no);

  if tg_op = 'INSERT'
     or new.user_id is distinct from old.user_id
     or lower(btrim(new.entry_no)) is distinct from lower(btrim(old.entry_no)) then
    -- Serializes concurrent attempts for the same owner/number combination.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        new.user_id::text || ':' || lower(btrim(new.entry_no)),
        0
      )
    );

    if exists (
      select 1
      from public.journal_entries je
      where je.user_id = new.user_id
        and lower(btrim(je.entry_no)) = lower(btrim(new.entry_no))
        and je.id is distinct from new.id
    ) then
      raise exception 'Journal entry number "%" already exists.', new.entry_no;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_unique_journal_entry_number on public.journal_entries;
create trigger trg_unique_journal_entry_number
before insert or update of entry_no, user_id
on public.journal_entries
for each row
execute function public.guard_unique_journal_entry_number();

revoke all on function public.guard_unique_journal_entry_number()
from public, anon, authenticated;

-- Add a true normalized unique index where existing data is already clean.
-- If legacy duplicates exist, the trigger still blocks every future duplicate
-- and the warning identifies why the index was deferred.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'uq_journal_entries_user_entry_no_normalized'
  ) then
    if not exists (
      select 1
      from public.journal_entries
      group by user_id, lower(btrim(entry_no))
      having count(*) > 1
    ) then
      create unique index uq_journal_entries_user_entry_no_normalized
        on public.journal_entries (user_id, lower(btrim(entry_no)));
    else
      raise warning 'Legacy duplicate journal entry numbers found. Future duplicates are blocked; clean legacy duplicates before adding uq_journal_entries_user_entry_no_normalized.';
    end if;
  end if;
end;
$$;

create or replace function public.bulk_load_journal_entries(p_entries jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry jsonb;
  v_line jsonb;
  v_entry_no text;
  v_entry_date date;
  v_description text;
  v_entry_id uuid;
  v_account public.chart_of_accounts%rowtype;
  v_account_count integer;
  v_debit numeric;
  v_credit numeric;
  v_total_debit numeric;
  v_total_credit numeric;
  v_line_count integer;
  v_created_count integer := 0;
  v_created_entries jsonb := '[]'::jsonb;
  v_ar_account_id uuid;
  v_ap_account_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_entries is null or pg_catalog.jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Journal import payload must be an array.';
  end if;

  if pg_catalog.jsonb_array_length(p_entries) = 0 then
    raise exception 'No journal entries were supplied.';
  end if;

  if pg_catalog.jsonb_array_length(p_entries) > 200 then
    raise exception 'A maximum of 200 journal entries may be loaded at once.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_entries) item
    group by lower(btrim(item ->> 'entry_no'))
    having count(*) > 1
  ) then
    raise exception 'The import file contains duplicate journal entry numbers.';
  end if;

  select am.account_id into v_ar_account_id
  from public.account_mappings am
  where am.user_id = v_user_id and am.mapping_key = 'accounts_receivable';

  select am.account_id into v_ap_account_id
  from public.account_mappings am
  where am.user_id = v_user_id and am.mapping_key = 'accounts_payable';

  for v_entry in select value from pg_catalog.jsonb_array_elements(p_entries)
  loop
    if pg_catalog.jsonb_typeof(v_entry) <> 'object' then
      raise exception 'Every journal entry must be an object.';
    end if;

    v_entry_no := btrim(coalesce(v_entry ->> 'entry_no', ''));
    if v_entry_no = '' then
      raise exception 'Journal entry number is required.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text || ':' || lower(v_entry_no), 0)
    );

    if exists (
      select 1 from public.journal_entries je
      where je.user_id = v_user_id
        and lower(btrim(je.entry_no)) = lower(v_entry_no)
    ) then
      raise exception 'Journal entry number "%" already exists.', v_entry_no;
    end if;

    begin
      v_entry_date := (v_entry ->> 'entry_date')::date;
    exception when others then
      raise exception '%: entry date must use YYYY-MM-DD format.', v_entry_no;
    end;

    v_description := nullif(btrim(coalesce(v_entry ->> 'description', '')), '');

    if pg_catalog.jsonb_typeof(v_entry -> 'lines') <> 'array' then
      raise exception '%: journal lines must be an array.', v_entry_no;
    end if;

    v_line_count := pg_catalog.jsonb_array_length(v_entry -> 'lines');
    if v_line_count < 2 then
      raise exception '%: at least two journal lines are required.', v_entry_no;
    end if;

    v_total_debit := 0;
    v_total_credit := 0;

    for v_line in select value from pg_catalog.jsonb_array_elements(v_entry -> 'lines')
    loop
      begin
        v_debit := round(coalesce(nullif(btrim(v_line ->> 'debit'), '')::numeric, 0), 2);
        v_credit := round(coalesce(nullif(btrim(v_line ->> 'credit'), '')::numeric, 0), 2);
      exception when others then
        raise exception '%: debit and credit must be valid numbers.', v_entry_no;
      end;

      if v_debit < 0 or v_credit < 0 then
        raise exception '%: debit and credit cannot be negative.', v_entry_no;
      end if;

      if (v_debit > 0 and v_credit > 0) or (v_debit <= 0 and v_credit <= 0) then
        raise exception '%: each line must contain either debit or credit.', v_entry_no;
      end if;

      v_account_count := 0;

      if nullif(btrim(coalesce(v_line ->> 'account_code', '')), '') is not null then
        select count(*) into v_account_count
        from public.chart_of_accounts coa
        where coa.user_id = v_user_id
          and lower(btrim(coa.code)) = lower(btrim(v_line ->> 'account_code'));

        if v_account_count = 1 then
          select coa.* into v_account
          from public.chart_of_accounts coa
          where coa.user_id = v_user_id
            and lower(btrim(coa.code)) = lower(btrim(v_line ->> 'account_code'));
        end if;
      elsif nullif(btrim(coalesce(v_line ->> 'account_name', '')), '') is not null then
        select count(*) into v_account_count
        from public.chart_of_accounts coa
        left join public.chart_of_accounts parent on parent.id = coa.parent_id
        where coa.user_id = v_user_id
          and lower(btrim(coa.name)) = lower(btrim(v_line ->> 'account_name'))
          and (
            nullif(btrim(coalesce(v_line ->> 'account_head', '')), '') is null
            or lower(btrim(coalesce(parent.name, coa.parent_head, ''))) = lower(btrim(v_line ->> 'account_head'))
          );

        if v_account_count = 1 then
          select coa.* into v_account
          from public.chart_of_accounts coa
          left join public.chart_of_accounts parent on parent.id = coa.parent_id
          where coa.user_id = v_user_id
            and lower(btrim(coa.name)) = lower(btrim(v_line ->> 'account_name'))
            and (
              nullif(btrim(coalesce(v_line ->> 'account_head', '')), '') is null
              or lower(btrim(coalesce(parent.name, coa.parent_head, ''))) = lower(btrim(v_line ->> 'account_head'))
            );
        end if;
      end if;

      if v_account_count = 0 then
        raise exception '%: account was not found.', v_entry_no;
      elsif v_account_count > 1 then
        raise exception '%: account is ambiguous; provide its account code.', v_entry_no;
      end if;

      if not v_account.is_active or v_account.is_group or not v_account.allow_manual_entries then
        raise exception '%: account "%" is not an active manual posting account.', v_entry_no, v_account.name;
      end if;

      if v_account.id = v_ar_account_id or v_account.id = v_ap_account_id then
        raise exception '%: customer/supplier control accounts require party details and cannot be loaded by this import format.', v_entry_no;
      end if;

      v_total_debit := v_total_debit + v_debit;
      v_total_credit := v_total_credit + v_credit;
    end loop;

    if abs(round(v_total_debit, 2) - round(v_total_credit, 2)) >= 0.01 then
      raise exception '%: journal is not balanced. Debit %, Credit %.', v_entry_no, v_total_debit, v_total_credit;
    end if;

    insert into public.journal_entries (
      user_id, entry_no, entry_date, description, status
    ) values (
      v_user_id, v_entry_no, v_entry_date, v_description, 'draft'
    ) returning id into v_entry_id;

    for v_line in select value from pg_catalog.jsonb_array_elements(v_entry -> 'lines')
    loop
      v_debit := round(coalesce(nullif(btrim(v_line ->> 'debit'), '')::numeric, 0), 2);
      v_credit := round(coalesce(nullif(btrim(v_line ->> 'credit'), '')::numeric, 0), 2);

      if nullif(btrim(coalesce(v_line ->> 'account_code', '')), '') is not null then
        select coa.* into v_account
        from public.chart_of_accounts coa
        where coa.user_id = v_user_id
          and lower(btrim(coa.code)) = lower(btrim(v_line ->> 'account_code'));
      else
        select coa.* into v_account
        from public.chart_of_accounts coa
        left join public.chart_of_accounts parent on parent.id = coa.parent_id
        where coa.user_id = v_user_id
          and lower(btrim(coa.name)) = lower(btrim(v_line ->> 'account_name'))
          and (
            nullif(btrim(coalesce(v_line ->> 'account_head', '')), '') is null
            or lower(btrim(coalesce(parent.name, coa.parent_head, ''))) = lower(btrim(v_line ->> 'account_head'))
          );
      end if;

      insert into public.journal_lines (
        user_id, entry_id, account_id, account, debit, credit
      ) values (
        v_user_id,
        v_entry_id,
        v_account.id,
        v_account.code || ' - ' || v_account.name,
        v_debit,
        v_credit
      );
    end loop;

    v_created_count := v_created_count + 1;
    v_created_entries := v_created_entries || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('id', v_entry_id, 'entry_no', v_entry_no)
    );
  end loop;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'count', v_created_count,
    'entries', v_created_entries
  );
end;
$$;

revoke all on function public.bulk_load_journal_entries(jsonb)
from public, anon;
grant execute on function public.bulk_load_journal_entries(jsonb)
to authenticated;

notify pgrst, 'reload schema';
