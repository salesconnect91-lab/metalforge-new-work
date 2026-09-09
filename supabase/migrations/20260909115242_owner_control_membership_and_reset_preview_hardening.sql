drop policy if exists memberships_self_select on public.company_memberships;

create policy memberships_select_access
on public.company_memberships
for select
to authenticated
using (public.is_platform_owner() or user_id = (select auth.uid()));

create or replace function public.platform_preview_company_transaction_reset(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_company record;
  v_total bigint := 0;
  v_count bigint;
  v_counts jsonb := '{}'::jsonb;
  v_table text;
  v_tables text[] := array[
    'bank_reconciliation_items','fixed_asset_depreciation','fiscal_year_opening_balances','opening_balance_batches',
    'invoice_payment_allocations','purchase_payment_allocations','return_note_lines','return_notes','hawala_pending_stock',
    'sales_order_hawala_invoices','sales_consolidation_invoices','sales_consolidations','purchase_order_consolidated_invoices',
    'consolidated_sales_invoice_charges','consolidated_sales_invoice_lines','consolidated_sales_invoices',
    'consolidated_purchase_invoice_charges','consolidated_purchase_invoice_lines','purchase_order_lines','consolidated_purchase_invoices',
    'sales_order_charges','sales_order_lines','work_order_lines','gate_passes','cutting_orders','furnace_yields',
    'stock_movements','warehouse_stock','inventory_costs','party_ledgers','ledgers','journal_lines',
    'account_budgets','fixed_assets','bank_reconciliations','fiscal_year_closures','sales_orders','purchase_orders','work_orders','journal_entries'
  ];
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select id,name,code into v_company from public.companies where id=p_company_id;
  if not found then raise exception 'Company not found'; end if;

  foreach v_table in array v_tables loop
    if to_regclass('public.'||v_table) is not null then
      execute format('select count(*) from public.%I where company_id=$1',v_table) into v_count using p_company_id;
      if v_count > 0 then
        v_counts := v_counts || jsonb_build_object(v_table,v_count);
        v_total := v_total + v_count;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'company', jsonb_build_object('id',v_company.id,'name',v_company.name,'code',v_company.code),
    'total_rows', v_total,
    'counts', v_counts,
    'preserved', jsonb_build_array(
      'Company and business units','Users and memberships','Master data','Chart of Accounts and account mappings',
      'Tax and charge setup','Company settings and print setup','Security configuration','Platform audit history'
    )
  );
end;
$$;

revoke all on function public.platform_preview_company_transaction_reset(uuid) from public, anon, authenticated;
grant execute on function public.platform_preview_company_transaction_reset(uuid) to service_role;
