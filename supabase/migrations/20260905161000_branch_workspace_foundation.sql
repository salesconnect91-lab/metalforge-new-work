-- Branch/location workspace foundation: Company -> Business -> Branch -> Transactions.
alter table public.user_profiles add column if not exists locked_operating_location_id uuid references public.operating_locations(id) on delete set null;
create index if not exists idx_user_profiles_locked_location on public.user_profiles(locked_operating_location_id);

create table if not exists public.operating_location_memberships(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 business_unit_id uuid not null references public.business_units(id) on delete cascade,
 operating_location_id uuid not null references public.operating_locations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'viewer', is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(operating_location_id,user_id)
);
alter table public.operating_location_memberships enable row level security;
create policy operating_location_memberships_access on public.operating_location_memberships for all to authenticated using(public.is_platform_owner() or user_id=auth.uid() or company_id=public.current_company_id()) with check(public.is_platform_owner() or company_id=public.current_company_id());
grant select,insert,update,delete on public.operating_location_memberships to authenticated;

create or replace function public.current_operating_location_id() returns uuid language sql stable security definer set search_path=public,pg_temp as $$
select coalesce(
 (select p.locked_operating_location_id from public.user_profiles p join public.operating_locations l on l.id=p.locked_operating_location_id where p.id=auth.uid() and l.company_id=public.current_company_id() and l.business_unit_id=public.current_business_unit_id() and l.is_active limit 1),
 (select m.operating_location_id from public.operating_location_memberships m join public.operating_locations l on l.id=m.operating_location_id where m.user_id=auth.uid() and m.company_id=public.current_company_id() and m.business_unit_id=public.current_business_unit_id() and m.is_active and l.is_active order by m.created_at limit 1));$$;
grant execute on function public.current_operating_location_id() to authenticated;

create or replace function public.set_current_operating_location(p_location_id uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_locked uuid;
begin
 select locked_operating_location_id into v_locked from public.user_profiles where id=auth.uid();
 if v_locked is not null and v_locked<>p_location_id then raise exception 'This login is locked to its assigned branch workspace.'; end if;
 if not exists(select 1 from public.operating_locations l where l.id=p_location_id and l.company_id=public.current_company_id() and l.business_unit_id=public.current_business_unit_id() and l.is_active and (public.is_platform_owner() or exists(select 1 from public.operating_location_memberships m where m.operating_location_id=l.id and m.user_id=auth.uid() and m.is_active))) then raise exception 'You do not have access to this branch.'; end if;
 update public.user_profiles set locked_operating_location_id=p_location_id,updated_at=now() where id=auth.uid(); return p_location_id;
end $$;
grant execute on function public.set_current_operating_location(uuid) to authenticated;

create or replace function public.lock_user_to_branch_workspace(p_user_id uuid,p_location_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.operating_locations%rowtype; r text;
begin
 if not public.is_platform_owner() then raise exception 'Platform Owner access required.'; end if;
 select * into l from public.operating_locations where id=p_location_id and is_active;
 if l.id is null or l.business_unit_id is null then raise exception 'Active business branch required.'; end if;
 select role into r from public.company_memberships where company_id=l.company_id and user_id=p_user_id and is_active limit 1;
 if r is null then raise exception 'User is not active in this company.'; end if;
 insert into public.business_unit_memberships(company_id,business_unit_id,user_id,role,is_active) values(l.company_id,l.business_unit_id,p_user_id,r,true) on conflict(business_unit_id,user_id) do update set is_active=true;
 insert into public.operating_location_memberships(company_id,business_unit_id,operating_location_id,user_id,role,is_active) values(l.company_id,l.business_unit_id,l.id,p_user_id,r,true) on conflict(operating_location_id,user_id) do update set is_active=true,role=excluded.role;
 update public.user_profiles set locked_business_unit_id=l.business_unit_id,last_business_unit_id=l.business_unit_id,locked_operating_location_id=l.id,updated_at=now() where id=p_user_id;
end $$;
grant execute on function public.lock_user_to_branch_workspace(uuid,uuid) to authenticated;

-- Journal source already has operating_location_id. Branch-tag operational tables add the same dimension additively.
do $$ declare t text; begin foreach t in array array['sales_orders','purchase_orders','work_orders','cutting_orders','gate_passes','stock_movements','warehouse_stock','party_ledgers','invoice_payment_allocations','purchase_payment_allocations','fixed_assets'] loop execute format('alter table public.%I add column if not exists operating_location_id uuid references public.operating_locations(id) on delete restrict',t); execute format('create index if not exists %I on public.%I(company_id,business_unit_id,operating_location_id)', 'idx_'||t||'_location',t); end loop; end $$;

create or replace function public.stamp_operating_location_context() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare l public.operating_locations%rowtype; v uuid;
begin
 if current_setting('app.maintenance_reset',true)='1' then return new; end if;
 v:=coalesce(new.operating_location_id,public.current_operating_location_id());
 if v is null then return new; end if;
 select * into l from public.operating_locations where id=v and is_active;
 if l.id is null or l.company_id<>new.company_id or (l.business_unit_id is not null and l.business_unit_id<>new.business_unit_id) then raise exception 'Invalid branch/location for this business transaction.'; end if;
 new.operating_location_id:=v; return new;
end $$;
do $$ declare t text; begin foreach t in array array['sales_orders','purchase_orders','work_orders','cutting_orders','gate_passes','stock_movements','warehouse_stock','party_ledgers','invoice_payment_allocations','purchase_payment_allocations','fixed_assets'] loop execute format('drop trigger if exists zz_operating_location_scope on public.%I',t); execute format('create trigger zz_operating_location_scope before insert or update on public.%I for each row execute function public.stamp_operating_location_context()',t); end loop; end $$;