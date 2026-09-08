create or replace function public.guard_journal_entry_changes()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_legacy_user_id uuid;
  v_company_id uuid;
begin
  if coalesce(current_setting('app.maintenance_reset', true),'0') = '1' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_legacy_user_id := public.legacy_data_user_id();
    v_company_id := public.current_company_id();

    if new.user_id is null then
      new.user_id := coalesce(v_legacy_user_id, auth.uid());
    end if;

    if auth.uid() is not null
       and new.user_id is distinct from auth.uid()
       and new.user_id is distinct from v_legacy_user_id then
      raise exception 'Journal entry owner is invalid.';
    end if;

    if v_company_id is not null
       and new.company_id is not null
       and new.company_id is distinct from v_company_id then
      raise exception 'Journal entry company is invalid.';
    end if;

    if current_user = 'authenticated' and coalesce(new.status, 'draft') <> 'draft' then
      raise exception 'New journal entries must be created as draft.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'posted' then raise exception 'Posted journal entries cannot be deleted.'; end if;
    return old;
  end if;

  if new.user_id is distinct from old.user_id then raise exception 'Journal entry owner cannot be changed.'; end if;
  if old.status = 'posted' then raise exception 'Posted journal entries cannot be modified.'; end if;
  if old.status <> 'posted' and new.status = 'posted' and current_user = 'authenticated' then raise exception 'Use the journal posting process to post this entry.'; end if;
  if new.status not in ('draft', 'posted') then raise exception 'Invalid journal status.'; end if;
  return new;
end
$function$;
