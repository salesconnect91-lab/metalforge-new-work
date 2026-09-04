create or replace function public.enforce_parent_business_unit_match()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_parent_table text:=tg_argv[0]; v_fk_column text:=tg_argv[1]; v_fk uuid; v_parent_unit uuid;
begin
  if coalesce(current_setting('app.maintenance_reset', true),'0')='1' then return new; end if;
  v_fk:=nullif(to_jsonb(new)->>v_fk_column,'')::uuid;
  if v_fk is null then return new; end if;
  execute format('select business_unit_id from public.%I where id=$1',v_parent_table) into v_parent_unit using v_fk;
  if v_parent_unit is null then raise exception 'Parent record not found for %.%',tg_table_name,v_fk_column; end if;
  if new.business_unit_id is distinct from v_parent_unit then raise exception 'Business unit mismatch between % and parent %.',tg_table_name,v_parent_table; end if;
  return new;
end;
$function$;

DO $do$
declare r record;
begin
  for r in select * from (values
    ('sales_order_lines','order_id','sales_orders','zz_parent_bu_order'),('sales_order_charges','order_id','sales_orders','zz_parent_bu_order'),('sales_order_hawala_invoices','sales_order_id','sales_orders','zz_parent_bu_sales_order'),('sales_order_hawala_invoices','hawala_invoice_id','consolidated_sales_invoices','zz_parent_bu_hawala'),('consolidated_sales_invoice_lines','invoice_id','consolidated_sales_invoices','zz_parent_bu_invoice'),('consolidated_sales_invoice_charges','invoice_id','consolidated_sales_invoices','zz_parent_bu_invoice'),('purchase_order_lines','order_id','purchase_orders','zz_parent_bu_order'),('purchase_order_consolidated_invoices','purchase_order_id','purchase_orders','zz_parent_bu_purchase_order'),('purchase_order_consolidated_invoices','consolidated_invoice_id','consolidated_purchase_invoices','zz_parent_bu_consolidated'),('consolidated_purchase_invoice_lines','invoice_id','consolidated_purchase_invoices','zz_parent_bu_invoice'),('consolidated_purchase_invoice_charges','invoice_id','consolidated_purchase_invoices','zz_parent_bu_invoice'),('work_order_lines','order_id','work_orders','zz_parent_bu_order'),('journal_lines','entry_id','journal_entries','zz_parent_bu_entry'),('ledgers','journal_entry_id','journal_entries','zz_parent_bu_entry'),('party_ledgers','journal_entry_id','journal_entries','zz_parent_bu_entry'),('invoice_payment_allocations','sales_order_id','sales_orders','zz_parent_bu_sales_order'),('purchase_payment_allocations','purchase_order_id','purchase_orders','zz_parent_bu_purchase_order'),('return_note_lines','note_id','return_notes','zz_parent_bu_note'),('bank_reconciliation_items','reconciliation_id','bank_reconciliations','zz_parent_bu_reconciliation'),('fixed_asset_depreciation','asset_id','fixed_assets','zz_parent_bu_asset'),('fiscal_year_opening_balances','closure_id','fiscal_year_closures','zz_parent_bu_closure'),('sales_consolidation_invoices','consolidation_id','sales_consolidations','zz_parent_bu_consolidation')
  ) x(child_table,fk_column,parent_table,trigger_name)
  loop
    if to_regclass('public.'||r.child_table) is not null and to_regclass('public.'||r.parent_table) is not null then
      execute format('drop trigger if exists %I on public.%I',r.trigger_name,r.child_table);
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.enforce_parent_business_unit_match(%L,%L)',r.trigger_name,r.child_table,r.parent_table,r.fk_column);
    end if;
  end loop;
end $do$;
revoke all on function public.enforce_parent_business_unit_match() from public,anon,authenticated;
