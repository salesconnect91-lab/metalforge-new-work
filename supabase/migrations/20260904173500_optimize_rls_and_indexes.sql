-- Live production hardening applied after SaaS controls.
create index if not exists idx_consolidated_sales_invoice_lines_user_id on public.consolidated_sales_invoice_lines(user_id);
create index if not exists idx_purchase_payment_allocations_user_id on public.purchase_payment_allocations(user_id);

drop policy if exists "Users can view own audit logs" on public.audit_logs;
create policy "Users can view own audit logs" on public.audit_logs for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists memberships_self_select on public.company_memberships;
create policy memberships_self_select on public.company_memberships for select to authenticated using(user_id=(select auth.uid()));

drop policy if exists tax_rates_company_admin on public.tax_rates;
create policy tax_rates_company_admin on public.tax_rates for all to authenticated
using(company_id=(select public.current_company_id()) and ((select public.is_platform_owner()) or exists(select 1 from public.company_memberships m where m.company_id=tax_rates.company_id and m.user_id=(select auth.uid()) and m.is_active and m.role in('company_owner','admin'))))
with check(company_id=(select public.current_company_id()) and ((select public.is_platform_owner()) or exists(select 1 from public.company_memberships m where m.company_id=tax_rates.company_id and m.user_id=(select auth.uid()) and m.is_active and m.role in('company_owner','admin'))));

drop policy if exists charge_rate_settings_company_admin on public.charge_rate_settings;
create policy charge_rate_settings_company_admin on public.charge_rate_settings for all to authenticated
using(company_id=(select public.current_company_id()) and ((select public.is_platform_owner()) or exists(select 1 from public.company_memberships m where m.company_id=charge_rate_settings.company_id and m.user_id=(select auth.uid()) and m.is_active and m.role in('company_owner','admin'))))
with check(company_id=(select public.current_company_id()) and ((select public.is_platform_owner()) or exists(select 1 from public.company_memberships m where m.company_id=charge_rate_settings.company_id and m.user_id=(select auth.uid()) and m.is_active and m.role in('company_owner','admin'))));

drop policy if exists subscription_plans_owner_write on public.subscription_plans;
create policy subscription_plans_owner_insert on public.subscription_plans for insert to authenticated with check(public.is_platform_owner());
create policy subscription_plans_owner_update on public.subscription_plans for update to authenticated using(public.is_platform_owner()) with check(public.is_platform_owner());
create policy subscription_plans_owner_delete on public.subscription_plans for delete to authenticated using(public.is_platform_owner());
drop policy if exists company_subscriptions_owner_write on public.company_subscriptions;
create policy company_subscriptions_owner_insert on public.company_subscriptions for insert to authenticated with check(public.is_platform_owner());
create policy company_subscriptions_owner_update on public.company_subscriptions for update to authenticated using(public.is_platform_owner()) with check(public.is_platform_owner());
create policy company_subscriptions_owner_delete on public.company_subscriptions for delete to authenticated using(public.is_platform_owner());
drop policy if exists company_modules_owner_write on public.company_modules;
create policy company_modules_owner_insert on public.company_modules for insert to authenticated with check(public.is_platform_owner());
create policy company_modules_owner_update on public.company_modules for update to authenticated using(public.is_platform_owner()) with check(public.is_platform_owner());
create policy company_modules_owner_delete on public.company_modules for delete to authenticated using(public.is_platform_owner());
