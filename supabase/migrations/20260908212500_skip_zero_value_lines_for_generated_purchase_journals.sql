create or replace function public.guard_journal_line_changes()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_entry_user uuid;
  v_entry_status text;
  v_entry_no text;
  v_trans_type text;
begin
  if coalesce(current_setting('app.maintenance_reset', true),'0')='1' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  if tg_op='DELETE' then
    select je.user_id,je.status into v_entry_user,v_entry_status
    from public.journal_entries je where je.id=old.entry_id;
    if v_entry_status='posted' then raise exception 'Lines of a posted journal entry cannot be deleted.'; end if;
    return old;
  end if;

  select je.user_id,je.status,je.entry_no,je.trans_type
    into v_entry_user,v_entry_status,v_entry_no,v_trans_type
  from public.journal_entries je where je.id=new.entry_id;
  if not found then raise exception 'Journal entry not found.'; end if;

  if new.user_id is null then new.user_id:=v_entry_user; end if;
  if new.user_id is distinct from v_entry_user then raise exception 'Journal line owner must match journal entry owner.'; end if;
  if v_entry_status<>'draft' then raise exception 'Lines of a posted journal entry cannot be modified.'; end if;

  if tg_op='UPDATE' then
    if new.user_id is distinct from old.user_id then raise exception 'Journal line owner cannot be changed.'; end if;
    if new.entry_id is distinct from old.entry_id then
      select je.status into v_entry_status from public.journal_entries je where je.id=old.entry_id;
      if v_entry_status<>'draft' then raise exception 'Lines of a posted journal entry cannot be moved.'; end if;
    end if;
  end if;

  if coalesce(new.debit,0)<0 or coalesce(new.credit,0)<0 then
    raise exception 'Debit and credit cannot be negative.';
  end if;
  if coalesce(new.debit,0)>0 and coalesce(new.credit,0)>0 then
    raise exception 'A journal line cannot contain both debit and credit.';
  end if;

  if coalesce(new.debit,0)<=0 and coalesce(new.credit,0)<=0 then
    -- Generated purchase journals must not persist zero-value accounting rows.
    -- Manual journal entry validation remains strict.
    if tg_op='INSERT'
       and v_trans_type='Purchase'
       and v_entry_no like 'PUR-%' then
      return null;
    end if;
    raise exception 'Enter either debit or credit.';
  end if;

  return new;
end
$function$;
