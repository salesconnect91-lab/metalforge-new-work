create or replace function public.enforce_active_business_unit_write_scope()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_active uuid;
  v_company uuid;
begin
  if coalesce(current_setting('app.maintenance_reset', true),'0')='1' then
    return case when tg_op='DELETE' then old else new end;
  end if;
  v_active := public.current_business_unit_id();
  v_company := public.current_company_id();
  if v_active is null then raise exception 'No active business unit selected.'; end if;
  if v_company is null then raise exception 'No active company selected.'; end if;
  if tg_op='DELETE' then
    if old.company_id is distinct from v_company then raise exception 'Transaction does not belong to the active company.'; end if;
    if old.business_unit_id is distinct from v_active then raise exception 'Transaction belongs to another business unit.'; end if;
    return old;
  end if;
  if new.company_id is distinct from v_company then raise exception 'Transaction does not belong to the active company.'; end if;
  if new.business_unit_id is distinct from v_active then raise exception 'Transaction belongs to another business unit.'; end if;
  return new;
end;
$function$;

DO $do$
declare t text;
  tables text[] := array[
    'sales_orders','sales_order_lines','sales_order_charges','sales_order_hawala_invoices','sales_consolidations','sales_consolidation_invoices','consolidated_sales_invoices','consolidated_sales_invoice_lines','consolidated_sales_invoice_charges','purchase_orders','purchase_order_lines','purchase_order_consolidated_invoices','consolidated_purchase_invoices','consolidated_purchase_invoice_lines','consolidated_purchase_invoice_charges','work_orders','work_order_lines','furnace_yields','cutting_orders','gate_passes','stock_movements','warehouse_stock','inventory_costs','hawala_pending_stock','journal_entries','journal_lines','ledgers','party_ledgers','invoice_payment_allocations','purchase_payment_allocations','return_notes','return_note_lines','bank_reconciliations','bank_reconciliation_items','fiscal_year_closures','fiscal_year_opening_balances','opening_balance_batches','account_budgets','fixed_assets','fixed_asset_depreciation'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists zz_business_unit_write_scope on public.%I',t);
      execute format('create trigger zz_business_unit_write_scope before insert or update or delete on public.%I for each row execute function public.enforce_active_business_unit_write_scope()',t);
    end if;
  end loop;
end $do$;

DO $do$
declare v text;
begin
  foreach v in array array['customer_invoice_aging','sales_invoice_financials','service_party_balance_report','steel_item_commercial_summary','steel_stock_reconciliation','stock_godown_report'] loop
    if to_regclass('public.'||v) is not null then execute format('alter view public.%I set (security_invoker = true)',v); end if;
  end loop;
end $do$;

create or replace function public.assert_journal_business_unit(p_entry_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_unit uuid := public.current_business_unit_id(); v_company uuid := public.current_company_id(); v_entry_unit uuid;
begin
  if v_unit is null or v_company is null then raise exception 'Active company and business unit are required.'; end if;
  select business_unit_id into v_entry_unit from public.journal_entries where id=p_entry_id and company_id=v_company;
  if v_entry_unit is null then raise exception 'Journal entry not found in active company.'; end if;
  if v_entry_unit is distinct from v_unit then raise exception 'Journal entry belongs to another business unit.'; end if;
  if exists(select 1 from public.journal_lines jl where jl.entry_id=p_entry_id and jl.company_id=v_company and jl.business_unit_id is distinct from v_unit) then raise exception 'Journal lines contain another business unit.'; end if;
  return v_unit;
end;
$function$;

revoke all on function public.assert_journal_business_unit(uuid) from public,anon;
grant execute on function public.assert_journal_business_unit(uuid) to authenticated;

create or replace view public.business_unit_isolation_audit with (security_invoker = true) as
select 'sales_order_lines'::text table_name,count(*)::bigint mismatch_count from public.sales_order_lines l join public.sales_orders h on h.id=l.order_id where l.business_unit_id is distinct from h.business_unit_id
union all select 'sales_order_charges',count(*)::bigint from public.sales_order_charges l join public.sales_orders h on h.id=l.order_id where l.business_unit_id is distinct from h.business_unit_id
union all select 'purchase_order_lines',count(*)::bigint from public.purchase_order_lines l join public.purchase_orders h on h.id=l.order_id where l.business_unit_id is distinct from h.business_unit_id
union all select 'journal_lines',count(*)::bigint from public.journal_lines l join public.journal_entries h on h.id=l.entry_id where l.business_unit_id is distinct from h.business_unit_id
union all select 'ledgers',count(*)::bigint from public.ledgers l join public.journal_entries h on h.id=l.journal_entry_id where l.journal_entry_id is not null and l.business_unit_id is distinct from h.business_unit_id
union all select 'party_ledgers',count(*)::bigint from public.party_ledgers l join public.journal_entries h on h.id=l.journal_entry_id where l.journal_entry_id is not null and l.business_unit_id is distinct from h.business_unit_id
union all select 'invoice_payment_allocations',count(*)::bigint from public.invoice_payment_allocations l join public.sales_orders h on h.id=l.sales_order_id where l.business_unit_id is distinct from h.business_unit_id
union all select 'purchase_payment_allocations',count(*)::bigint from public.purchase_payment_allocations l join public.purchase_orders h on h.id=l.purchase_order_id where l.business_unit_id is distinct from h.business_unit_id;

grant select on public.business_unit_isolation_audit to authenticated;
