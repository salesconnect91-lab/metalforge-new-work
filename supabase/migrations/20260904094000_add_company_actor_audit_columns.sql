begin;

-- company_id owns the business record; these columns identify the human actor.
do $block$
declare
  v_table text;
begin
  foreach v_table in array array[
    'sales_orders','purchase_orders','journal_entries','stock_movements',
    'work_orders','cutting_orders','customers','suppliers','items','charge_master'
  ]
  loop
    execute format('alter table public.%I add column if not exists created_by uuid references auth.users(id) on delete set null',v_table);
    execute format('alter table public.%I add column if not exists updated_by uuid references auth.users(id) on delete set null',v_table);
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()',v_table);
  end loop;
end
$block$;

alter table public.sales_orders add column if not exists posted_by uuid references auth.users(id) on delete set null;
alter table public.sales_orders add column if not exists posted_at timestamptz;
alter table public.purchase_orders add column if not exists posted_by uuid references auth.users(id) on delete set null;
alter table public.purchase_orders add column if not exists posted_at timestamptz;
alter table public.journal_entries add column if not exists posted_by uuid references auth.users(id) on delete set null;
alter table public.journal_entries add column if not exists posted_at timestamptz;

create or replace function public.stamp_company_record_actor()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if tg_op='INSERT' then
    new.created_by := coalesce(auth.uid(),new.created_by);
    new.updated_by := coalesce(auth.uid(),new.updated_by,new.created_by);
    new.updated_at := coalesce(new.updated_at,now());
  else
    -- Keep immutable attribution, while allowing the migration to backfill legacy rows.
    new.created_by := coalesce(old.created_by,new.created_by);
    new.updated_by := coalesce(auth.uid(),new.updated_by,old.updated_by,new.created_by);
    new.updated_at := now();
  end if;
  return new;
end;
$function$;

create or replace function public.stamp_posted_record_actor()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if new.status='posted' and old.status is distinct from 'posted' then
    new.posted_by := coalesce(auth.uid(),new.posted_by);
    new.posted_at := coalesce(new.posted_at,now());
  elsif old.status='posted' then
    new.posted_by := old.posted_by;
    new.posted_at := old.posted_at;
  end if;
  return new;
end;
$function$;

do $block$
declare
  v_table text;
begin
  foreach v_table in array array[
    'sales_orders','purchase_orders','journal_entries','stock_movements',
    'work_orders','cutting_orders','customers','suppliers','items','charge_master'
  ]
  loop
    execute format('drop trigger if exists trg_stamp_actor on public.%I',v_table);
    execute format('create trigger trg_stamp_actor before insert or update on public.%I for each row execute function public.stamp_company_record_actor()',v_table);
  end loop;
end
$block$;

drop trigger if exists trg_stamp_posted_actor on public.sales_orders;
create trigger trg_stamp_posted_actor before update of status on public.sales_orders for each row execute function public.stamp_posted_record_actor();
drop trigger if exists trg_stamp_posted_actor on public.purchase_orders;
create trigger trg_stamp_posted_actor before update of status on public.purchase_orders for each row execute function public.stamp_posted_record_actor();
drop trigger if exists trg_stamp_posted_actor on public.journal_entries;
create trigger trg_stamp_posted_actor before update of status on public.journal_entries for each row execute function public.stamp_posted_record_actor();

-- Historical rows remain unattributed: rewriting them would activate tenant-write
-- guards without a real signed-in actor. New writes are audited from this point on.

revoke all on function public.stamp_company_record_actor() from public,anon,authenticated;
revoke all on function public.stamp_posted_record_actor() from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
