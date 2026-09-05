-- Dedicated business workspace login model.
-- A normal login can be locked to exactly one business workspace while platform/group owners remain able to work across units.
alter table public.user_profiles add column if not exists locked_business_unit_id uuid references public.business_units(id) on delete set null;
create index if not exists idx_user_profiles_locked_business_unit on public.user_profiles(locked_business_unit_id);

create or replace function public.current_business_unit_id() returns uuid language sql stable security definer set search_path=public,pg_temp as $$
with ctx as (select auth.uid() uid, public.current_company_id() company_id)
select coalesce(
 (select b.id from public.user_profiles p join public.business_units b on b.id=p.locked_business_unit_id cross join ctx where p.id=ctx.uid and b.company_id=ctx.company_id and b.is_active and (public.is_platform_owner() or exists(select 1 from public.business_unit_memberships bm where bm.business_unit_id=b.id and bm.user_id=ctx.uid and bm.is_active)) limit 1),
 (select b.id from public.user_profiles p join public.business_units b on b.id=p.last_business_unit_id cross join ctx where p.id=ctx.uid and b.company_id=ctx.company_id and b.is_active and (public.is_platform_owner() or exists(select 1 from public.business_unit_memberships bm where bm.business_unit_id=b.id and bm.user_id=ctx.uid and bm.is_active)) limit 1),
 (select b.id from public.business_units b cross join ctx where b.company_id=ctx.company_id and b.is_active and (public.is_platform_owner() or exists(select 1 from public.business_unit_memberships bm where bm.business_unit_id=b.id and bm.user_id=ctx.uid and bm.is_active)) order by b.is_default desc,b.created_at asc limit 1));$$;

create or replace function public.set_current_business_unit(p_business_unit_id uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_company_id uuid:=public.current_company_id(); v_locked uuid;
begin
 if v_uid is null then raise exception 'Authentication required.'; end if;
 if v_company_id is null then raise exception 'No active company selected.'; end if;
 select locked_business_unit_id into v_locked from public.user_profiles where id=v_uid;
 if v_locked is not null and v_locked<>p_business_unit_id then raise exception 'This login is locked to its assigned business workspace.'; end if;
 if not exists(select 1 from public.business_units b where b.id=p_business_unit_id and b.company_id=v_company_id and b.is_active and (public.is_platform_owner() or exists(select 1 from public.business_unit_memberships bm where bm.business_unit_id=b.id and bm.user_id=v_uid and bm.is_active))) then raise exception 'You do not have access to this business unit.'; end if;
 update public.user_profiles set last_business_unit_id=p_business_unit_id,updated_at=now() where id=v_uid;
 return p_business_unit_id;
end $$;

create or replace function public.lock_user_to_business_workspace(p_user_id uuid,p_business_unit_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_company uuid;
begin
 if not public.is_platform_owner() then raise exception 'Platform Owner access required.'; end if;
 select company_id into v_company from public.business_units where id=p_business_unit_id and is_active;
 if v_company is null then raise exception 'Business workspace not found.'; end if;
 if not exists(select 1 from public.company_memberships where company_id=v_company and user_id=p_user_id and is_active) then raise exception 'User is not active in this company.'; end if;
 insert into public.business_unit_memberships(company_id,business_unit_id,user_id,role,is_active)
 select v_company,p_business_unit_id,p_user_id,coalesce((select role from public.company_memberships where company_id=v_company and user_id=p_user_id limit 1),'viewer'),true
 on conflict (business_unit_id,user_id) do update set is_active=true;
 update public.business_unit_memberships set is_active=false where company_id=v_company and user_id=p_user_id and business_unit_id<>p_business_unit_id;
 update public.user_profiles set locked_business_unit_id=p_business_unit_id,last_business_unit_id=p_business_unit_id,updated_at=now() where id=p_user_id;
end $$;
grant execute on function public.lock_user_to_business_workspace(uuid,uuid) to authenticated;

create or replace function public.auto_lock_new_workspace_login() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.platform_role='user' and new.last_business_unit_id is not null and new.locked_business_unit_id is null then new.locked_business_unit_id:=new.last_business_unit_id; end if;
 return new;
end $$;
drop trigger if exists zz_auto_lock_new_workspace_login on public.user_profiles;
create trigger zz_auto_lock_new_workspace_login before insert on public.user_profiles for each row execute function public.auto_lock_new_workspace_login();