create or replace function public.can_manage_company_access(p_company_id uuid)
returns boolean
language sql stable security definer set search_path=public,pg_temp
as $$
  select public.is_platform_owner() or exists(
    select 1 from public.company_memberships m
    join public.user_profiles p on p.id=m.user_id and p.is_active
    join public.companies c on c.id=m.company_id
    where m.company_id=p_company_id and m.user_id=auth.uid() and m.is_active
      and m.role in ('company_owner','admin')
      and c.status in ('active','trial')
      and (c.subscription_expires_at is null or c.subscription_expires_at>now())
  )
$$;
revoke all on function public.can_manage_company_access(uuid) from public,anon;
grant execute on function public.can_manage_company_access(uuid) to authenticated,service_role;

drop policy if exists operating_locations_scope on public.operating_locations;
drop policy if exists operating_locations_select_access on public.operating_locations;
drop policy if exists operating_locations_manager_insert on public.operating_locations;
drop policy if exists operating_locations_manager_update on public.operating_locations;
drop policy if exists operating_locations_manager_delete on public.operating_locations;
create policy operating_locations_select_access on public.operating_locations for select to authenticated using (public.is_platform_owner() or public.has_company_access(company_id));
create policy operating_locations_manager_insert on public.operating_locations for insert to authenticated with check (company_id=public.current_company_id() and public.can_manage_company_access(company_id));
create policy operating_locations_manager_update on public.operating_locations for update to authenticated using (public.can_manage_company_access(company_id)) with check (company_id=public.current_company_id() and public.can_manage_company_access(company_id));
create policy operating_locations_manager_delete on public.operating_locations for delete to authenticated using (public.can_manage_company_access(company_id));
