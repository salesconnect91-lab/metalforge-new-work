-- Final reset contract: preserve configuration/master data and cut-over opening baselines;
-- remove post-cutover operational transactions.

alter table public.order_book_headers
  add column if not exists is_opening_import boolean not null default false,
  add column if not exists opening_status text,
  add column if not exists opening_remarks text;

alter table public.order_book_commitments
  add column if not exists is_opening_import boolean not null default false,
  add column if not exists opening_ordered_qty numeric,
  add column if not exists opening_fulfilled_qty numeric,
  add column if not exists opening_cancelled_qty numeric,
  add column if not exists opening_rate_status text,
  add column if not exists opening_agreed_rate numeric,
  add column if not exists opening_effective_at timestamptz,
  add column if not exists opening_status text,
  add column if not exists opening_remarks text;

create or replace function public.capture_order_book_opening_baseline()
returns trigger language plpgsql set search_path='public','pg_temp' as $$
begin
  if coalesce(current_setting('app.platform_order_import',true),'0')='1' then
    new.is_opening_import:=true;
    if tg_table_name='order_book_headers' then
      new.opening_status:=new.status; new.opening_remarks:=new.remarks;
    else
      new.opening_ordered_qty:=new.ordered_qty; new.opening_fulfilled_qty:=new.fulfilled_qty;
      new.opening_cancelled_qty:=new.cancelled_qty; new.opening_rate_status:=new.rate_status;
      new.opening_agreed_rate:=new.agreed_rate; new.opening_effective_at:=new.effective_at;
      new.opening_status:=new.status; new.opening_remarks:=new.remarks;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists capture_order_book_opening_baseline on public.order_book_headers;
create trigger capture_order_book_opening_baseline before insert on public.order_book_headers
for each row execute function public.capture_order_book_opening_baseline();
drop trigger if exists capture_order_book_opening_baseline on public.order_book_commitments;
create trigger capture_order_book_opening_baseline before insert on public.order_book_commitments
for each row execute function public.capture_order_book_opening_baseline();

create or replace function public.platform_reset_company_transactions(p_company_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare
  v_company record; v_total bigint:=0; v_count bigint; v_deleted jsonb:='{}'::jsonb; v_table text;
  v_tables text[]:=array[
    'bank_reconciliation_items','fixed_asset_depreciation','fiscal_year_opening_balances',
    'invoice_payment_allocations','purchase_payment_allocations','return_note_lines','return_notes','hawala_pending_stock',
    'sales_order_hawala_invoices','sales_consolidation_invoices','sales_consolidations','purchase_order_consolidated_invoices',
    'consolidated_sales_invoice_charges','consolidated_sales_invoice_lines','consolidated_sales_invoices',
    'consolidated_purchase_invoice_charges','consolidated_purchase_invoice_lines','purchase_order_lines','consolidated_purchase_invoices',
    'sales_order_charges','sales_order_lines','work_order_lines','gate_passes','cutting_orders','furnace_yields',
    'stock_movements','warehouse_stock','inventory_costs','account_budgets','fixed_assets','bank_reconciliations',
    'fiscal_year_closures','sales_orders','purchase_orders','work_orders'];
begin
  select id,name,code into v_company from public.companies where id=p_company_id;
  if not found then raise exception 'Company not found'; end if;
  perform set_config('app.maintenance_reset','1',true);

  update public.journal_entries set fiscal_year_closure_id=null,reversal_of_entry_id=null
   where company_id=p_company_id and coalesce(trans_type,'')<>'opening_balance';
  update public.fiscal_year_closures set closing_journal_id=null where company_id=p_company_id;

  delete from public.order_book_allocations where company_id=p_company_id;
  delete from public.order_book_fulfillments where company_id=p_company_id;
  delete from public.order_book_qty_history where company_id=p_company_id;
  delete from public.order_book_rate_history where company_id=p_company_id;
  delete from public.order_book_cancellation_history where company_id=p_company_id;
  delete from public.order_book_headers where company_id=p_company_id and not is_opening_import;

  update public.order_book_commitments set
    ordered_qty=opening_ordered_qty, fulfilled_qty=opening_fulfilled_qty, cancelled_qty=opening_cancelled_qty,
    rate_status=opening_rate_status, agreed_rate=opening_agreed_rate, effective_at=opening_effective_at,
    status=opening_status, remarks=opening_remarks, updated_at=now()
  where company_id=p_company_id and is_opening_import;
  update public.order_book_headers set status=coalesce(opening_status,status),remarks=opening_remarks,
    cancellation_reason=null,cancelled_at=null,cancelled_by=null,updated_at=now()
  where company_id=p_company_id and is_opening_import;

  foreach v_table in array v_tables loop
    if to_regclass('public.'||v_table) is not null then
      execute format('delete from public.%I where company_id=$1',v_table) using p_company_id;
      get diagnostics v_count=row_count;
      if v_count>0 then v_deleted:=v_deleted||jsonb_build_object(v_table,v_count); v_total:=v_total+v_count; end if;
    end if;
  end loop;

  delete from public.party_ledgers x where company_id=p_company_id and
    (journal_entry_id is null or not exists(select 1 from public.journal_entries j where j.id=x.journal_entry_id and j.company_id=p_company_id and j.trans_type='opening_balance'));
  delete from public.ledgers x where company_id=p_company_id and
    (journal_entry_id is null or not exists(select 1 from public.journal_entries j where j.id=x.journal_entry_id and j.company_id=p_company_id and j.trans_type='opening_balance'));
  delete from public.journal_lines x where company_id=p_company_id and
    not exists(select 1 from public.journal_entries j where j.id=x.entry_id and j.company_id=p_company_id and j.trans_type='opening_balance');
  delete from public.journal_entries where company_id=p_company_id and coalesce(trans_type,'')<>'opening_balance';

  insert into public.platform_audit_logs(actor_user_id,company_id,action,target_type,target_id,details)
  values(p_actor_id,p_company_id,'company_transaction_data_reset','company',p_company_id,
    jsonb_build_object('company_name',v_company.name,'company_code',v_company.code,'deleted_rows',v_total,
      'deleted_by_table',v_deleted,'preserved','master/config/security/audit + opening party balances + imported opening order book baselines'));
  return jsonb_build_object('success',true,'company',jsonb_build_object('id',v_company.id,'name',v_company.name,'code',v_company.code),
    'deleted_rows',v_total,'deleted',v_deleted,'preserved',jsonb_build_array(
      'Master/config/security/audit data','Opening party balance journals and ledgers','Imported opening Sales/Purchase Order Book baselines'));
end $$;

create or replace function public.platform_preview_company_transaction_reset(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_company record; v_total bigint:=0; v_count bigint; v_counts jsonb:='{}'::jsonb; v_table text;
  v_tables text[]:=array['sales_orders','purchase_orders','work_orders','stock_movements','warehouse_stock','return_notes','consolidated_sales_invoices','consolidated_purchase_invoices','order_book_allocations','order_book_fulfillments'];
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Service role required'; end if;
  select id,name,code into v_company from public.companies where id=p_company_id; if not found then raise exception 'Company not found'; end if;
  foreach v_table in array v_tables loop
    if to_regclass('public.'||v_table) is not null then
      execute format('select count(*) from public.%I where company_id=$1',v_table) into v_count using p_company_id;
      if v_count>0 then v_counts:=v_counts||jsonb_build_object(v_table,v_count); v_total:=v_total+v_count; end if;
    end if;
  end loop;
  select count(*) into v_count from public.journal_entries where company_id=p_company_id and coalesce(trans_type,'')<>'opening_balance';
  if v_count>0 then v_counts:=v_counts||jsonb_build_object('journal_entries',v_count); v_total:=v_total+v_count; end if;
  select count(*) into v_count from public.order_book_headers where company_id=p_company_id and not is_opening_import;
  if v_count>0 then v_counts:=v_counts||jsonb_build_object('operational_order_book_headers',v_count); v_total:=v_total+v_count; end if;
  return jsonb_build_object('company',jsonb_build_object('id',v_company.id,'name',v_company.name,'code',v_company.code),
    'total_rows',v_total,'counts',v_counts,'preserved',jsonb_build_array(
      'Company, business units, branches, users and permissions','Master data and warehouses/godowns',
      'Chart of Accounts, mappings, tax, charges and settings','Opening party balance journals and their ledger effect',
      'Imported opening Sales/Purchase Order Book baseline','Security configuration and platform audit history'));
end $$;

revoke all on function public.platform_preview_company_transaction_reset(uuid) from public,anon,authenticated;
grant execute on function public.platform_preview_company_transaction_reset(uuid) to service_role;
