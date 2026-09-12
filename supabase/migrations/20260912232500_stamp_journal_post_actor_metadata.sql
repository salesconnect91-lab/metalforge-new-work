create or replace function public.stamp_posted_journal_actor()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if old.status is distinct from 'posted' and new.status='posted' then
    new.posted_at:=coalesce(new.posted_at,now());
    new.posted_by:=coalesce(new.posted_by,auth.uid());
    new.updated_at:=now();
    new.updated_by:=coalesce(auth.uid(),new.updated_by);
  end if;
  return new;
end;
$function$;

drop trigger if exists zz_stamp_posted_journal_actor on public.journal_entries;
create trigger zz_stamp_posted_journal_actor
before update of status on public.journal_entries
for each row execute function public.stamp_posted_journal_actor();

revoke all on function public.stamp_posted_journal_actor() from public,anon,authenticated;
