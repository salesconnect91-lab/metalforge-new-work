-- Final RLS correctness/performance cleanup and covering FK indexes.

drop policy if exists ob_headers_insert on public.order_book_headers;
drop policy if exists ob_headers_select on public.order_book_headers;
drop policy if exists ob_headers_update on public.order_book_headers;
drop policy if exists ob_commitments_insert on public.order_book_commitments;
drop policy if exists ob_commitments_select on public.order_book_commitments;
drop policy if exists ob_commitments_update on public.order_book_commitments;

drop policy if exists business_units_select_access on public.business_units;
create policy business_units_select_access on public.business_units for select to authenticated using (is_platform_owner() or exists (select 1 from public.business_unit_memberships bm where bm.business_unit_id = business_units.id and bm.user_id = (select auth.uid()) and bm.is_active));

drop policy if exists business_unit_memberships_select_access on public.business_unit_memberships;
create policy business_unit_memberships_select_access on public.business_unit_memberships for select to authenticated using (is_platform_owner() or user_id = (select auth.uid()));

drop policy if exists business_unit_modules_select_access on public.business_unit_modules;
create policy business_unit_modules_select_access on public.business_unit_modules for select to authenticated using (is_platform_owner() or exists (select 1 from public.business_unit_memberships bm where bm.business_unit_id = business_unit_modules.business_unit_id and bm.user_id = (select auth.uid()) and bm.is_active));

drop policy if exists operating_location_memberships_access on public.operating_location_memberships;
create policy operating_location_memberships_access on public.operating_location_memberships for all to authenticated using (is_platform_owner() or user_id = (select auth.uid()) or company_id = current_company_id()) with check (is_platform_owner() or company_id = current_company_id());

drop policy if exists user_language_preferences_select_own on public.user_language_preferences;
create policy user_language_preferences_select_own on public.user_language_preferences for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists user_language_preferences_insert_own on public.user_language_preferences;
create policy user_language_preferences_insert_own on public.user_language_preferences for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists user_language_preferences_update_own on public.user_language_preferences;
create policy user_language_preferences_update_own on public.user_language_preferences for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

do $$
declare r record; idx_name text; cols text;
begin
  for r in select n.nspname schema_name,t.relname table_name,c.conname constraint_name,c.conrelid,c.conkey from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where c.contype='f' and n.nspname='public' and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid and i.indisready and (i.indkey::smallint[])[0:cardinality(c.conkey)-1]=c.conkey)
  loop
    select string_agg(quote_ident(a.attname), ', ' order by u.ord) into cols from unnest(r.conkey) with ordinality as u(attnum,ord) join pg_attribute a on a.attrelid=r.conrelid and a.attnum=u.attnum;
    idx_name:=left('idx_fk_'||r.table_name||'_'||r.constraint_name,63);
    execute format('create index if not exists %I on %I.%I (%s)',idx_name,r.schema_name,r.table_name,cols);
  end loop;
end $$;
