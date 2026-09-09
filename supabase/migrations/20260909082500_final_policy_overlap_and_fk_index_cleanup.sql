-- Eliminate remaining overlapping permissive SELECT policies without changing write authority.

drop policy if exists business_unit_memberships_owner_write on public.business_unit_memberships;
create policy business_unit_memberships_owner_insert on public.business_unit_memberships for insert to authenticated with check (is_platform_owner());
create policy business_unit_memberships_owner_update on public.business_unit_memberships for update to authenticated using (is_platform_owner()) with check (is_platform_owner());
create policy business_unit_memberships_owner_delete on public.business_unit_memberships for delete to authenticated using (is_platform_owner());

drop policy if exists business_unit_modules_owner_write on public.business_unit_modules;
create policy business_unit_modules_owner_insert on public.business_unit_modules for insert to authenticated with check (is_platform_owner());
create policy business_unit_modules_owner_update on public.business_unit_modules for update to authenticated using (is_platform_owner()) with check (is_platform_owner());
create policy business_unit_modules_owner_delete on public.business_unit_modules for delete to authenticated using (is_platform_owner());

drop policy if exists business_units_owner_write on public.business_units;
create policy business_units_owner_insert on public.business_units for insert to authenticated with check (is_platform_owner());
create policy business_units_owner_update on public.business_units for update to authenticated using (is_platform_owner()) with check (is_platform_owner());
create policy business_units_owner_delete on public.business_units for delete to authenticated using (is_platform_owner());

drop policy if exists companies_owner_all on public.companies;
create policy companies_owner_insert on public.companies for insert to authenticated with check (is_platform_owner());
create policy companies_owner_update on public.companies for update to authenticated using (is_platform_owner()) with check (is_platform_owner());
create policy companies_owner_delete on public.companies for delete to authenticated using (is_platform_owner());

drop policy if exists memberships_owner_all on public.company_memberships;
create policy memberships_owner_insert on public.company_memberships for insert to authenticated with check (is_platform_owner());
create policy memberships_owner_update on public.company_memberships for update to authenticated using (is_platform_owner()) with check (is_platform_owner());
create policy memberships_owner_delete on public.company_memberships for delete to authenticated using (is_platform_owner());

drop policy if exists user_profiles_owner_select on public.user_profiles;
drop policy if exists user_profiles_select_own on public.user_profiles;
create policy user_profiles_select_access on public.user_profiles for select to authenticated using (is_platform_owner() or id = (select auth.uid()));

create index if not exists idx_inter_unit_mappings_due_to_account on public.inter_unit_account_mappings(due_to_account_id);
create index if not exists idx_inter_unit_mappings_from_bu on public.inter_unit_account_mappings(from_business_unit_id);
create index if not exists idx_inter_unit_mappings_to_bu on public.inter_unit_account_mappings(to_business_unit_id);
create index if not exists idx_invoice_payment_allocations_operating_location on public.invoice_payment_allocations(operating_location_id);
create index if not exists idx_operating_location_memberships_company on public.operating_location_memberships(company_id);
create index if not exists idx_operating_location_memberships_user on public.operating_location_memberships(user_id);
create index if not exists idx_purchase_payment_allocations_operating_location on public.purchase_payment_allocations(operating_location_id);
