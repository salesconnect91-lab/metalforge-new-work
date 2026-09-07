-- Professional charge-wise accounting for NAVILO Sales + Purchase.
-- Each material charge may map to its own revenue/cost account.
-- Purchase landed-cost charges capitalize into Inventory; purchase expense charges
-- debit their configured cost account (fallback: General Expense).

-- 1) Dedicated cutting charge accounts for existing companies/users.
insert into public.chart_of_accounts
  (user_id, company_id, code, name, type, is_active, is_group, allow_manual_entries)
select distinct cm.user_id, cm.company_id, '4210', 'Cutting Charges Income', 'revenue', true, false, true
from public.charge_master cm
where cm.charge_key in ('cutting','cutting_charges')
  and not exists (
    select 1 from public.chart_of_accounts coa
    where coa.user_id=cm.user_id and coa.company_id=cm.company_id and coa.code='4210'
  );

insert into public.chart_of_accounts
  (user_id, company_id, code, name, type, is_active, is_group, allow_manual_entries)
select distinct cm.user_id, cm.company_id, '6410', 'Cutting Charges Expense', 'expense', true, false, true
from public.charge_master cm
where cm.charge_key in ('cutting','cutting_charges')
  and not exists (
    select 1 from public.chart_of_accounts coa
    where coa.user_id=cm.user_id and coa.company_id=cm.company_id and coa.code='6410'
  );

-- Normalize the historical key and make Cutting available to both workflows.
update public.charge_master cm
set charge_key='cutting',
    applies_to='both',
    revenue_account_id=(select coa.id from public.chart_of_accounts coa where coa.user_id=cm.user_id and coa.company_id=cm.company_id and coa.code='4210' limit 1),
    cost_account_id=(select coa.id from public.chart_of_accounts coa where coa.user_id=cm.user_id and coa.company_id=cm.company_id and coa.code='6410' limit 1),
    updated_at=now()
where cm.charge_key in ('cutting','cutting_charges');

-- Keep any existing rate-setting key aligned with Charge Master.
update public.charge_rate_settings
set charge_key='cutting', applies_to='both', updated_at=now()
where charge_key='cutting_charges';

-- 2) Purchase posting: respect Charge Master purchase treatment and cost account.
create or replace function public.post_purchase_invoice(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user_id uuid:=public.legacy_data_user_id();
  v_company_id uuid:=public.current_company_id();
  v_order public.purchase_orders%rowtype;
  v_supplier_name text;
  v_supplier_account_id uuid;
  v_inventory_account_id uuid;
  v_ap_account_id uuid;
  v_general_expense_account_id uuid;
  v_input_vat_account_id uuid;
  v_direct_items numeric:=0; v_linked_items numeric:=0; v_items_total numeric:=0;
  v_direct_item_tax numeric:=0; v_linked_item_tax numeric:=0;
  v_landed_charges numeric:=0; v_expense_charges numeric:=0; v_charge_tax numeric:=0;
  v_tax_total numeric:=0; v_grand_total numeric:=0; v_line_count integer:=0;
  v_journal_entry_id uuid; v_journal_entry_no text; v_result jsonb; r record;
begin
  perform public.assert_module_permission('purchase','post');
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  select * into v_order from public.purchase_orders where id=p_order_id and user_id=v_user_id and company_id=v_company_id and business_unit_id=public.current_business_unit_id() for update;
  if not found then raise exception 'Purchase invoice not found.'; end if;
  if v_order.status='posted' then raise exception 'Purchase invoice % is already posted.',v_order.order_no; end if;
  if v_order.supplier_id is null then raise exception 'Supplier is required before posting.'; end if;
  select s.name,s.account_id into v_supplier_name,v_supplier_account_id from public.suppliers s where s.id=v_order.supplier_id and s.user_id=v_user_id and s.company_id=v_company_id;
  if not found then raise exception 'Supplier not found.'; end if;
  select account_id into v_inventory_account_id from public.account_mappings where user_id=v_user_id and company_id=v_company_id and mapping_key='inventory' limit 1;
  select account_id into v_ap_account_id from public.account_mappings where user_id=v_user_id and company_id=v_company_id and mapping_key='accounts_payable' limit 1;
  select account_id into v_general_expense_account_id from public.account_mappings where user_id=v_user_id and company_id=v_company_id and mapping_key='general_expense' limit 1;
  select account_id into v_input_vat_account_id from public.account_mappings where user_id=v_user_id and company_id=v_company_id and mapping_key='input_vat' limit 1;
  if v_inventory_account_id is null then raise exception 'Inventory account mapping is missing.'; end if;
  if v_ap_account_id is null then raise exception 'Accounts Payable account mapping is missing.'; end if;
  if v_general_expense_account_id is null then raise exception 'General Expense account mapping is missing.'; end if;
  if v_supplier_account_id is null or v_supplier_account_id<>v_ap_account_id then raise exception 'Supplier is not linked to configured Accounts Payable account.'; end if;
  select count(*) into v_line_count from public.purchase_order_lines where order_id=p_order_id and user_id=v_user_id and company_id=v_company_id;
  if v_line_count=0 then raise exception 'Cannot post a Purchase Invoice without lines.'; end if;
  if exists(select 1 from public.purchase_order_lines pol left join public.items i on i.id=pol.item_id left join public.godowns g on g.id=pol.godown_id where pol.order_id=p_order_id and pol.user_id=v_user_id and pol.company_id=v_company_id and (i.id is null or g.id is null or g.warehouse_id is null or coalesce(pol.qty,0)<=0 or coalesce(pol.unit_cost,0)<0)) then raise exception 'One or more Purchase Invoice lines are invalid.'; end if;
  select coalesce(sum(line_total),0),coalesce(sum(case when v_order.invoice_type='Tax Invoice' then line_total*tax_percent/100 else 0 end),0) into v_direct_items,v_direct_item_tax from public.purchase_order_lines where order_id=p_order_id and user_id=v_user_id and company_id=v_company_id and source_consolidated_purchase_invoice_id is null;
  select coalesce(sum(h.subtotal),0),coalesce(sum(h.item_tax),0) into v_linked_items,v_linked_item_tax from public.consolidated_purchase_invoices h join public.purchase_order_consolidated_invoices l on l.consolidated_invoice_id=h.id where l.purchase_order_id=p_order_id and l.user_id=v_user_id and l.company_id=v_company_id;

  with direct_charges(charge_key,amount) as (values
    ('loading',coalesce(v_order.loading_charge,0)),('unloading',coalesce(v_order.unloading_charge,0)),('cutting',coalesce(v_order.cutting_charge,0)),('transport',coalesce(v_order.transport_charge,0)),('labour',coalesce(v_order.labour_charge,0)),('handling',coalesce(v_order.handling_charge,0)),('other',coalesce(v_order.other_charge,0))
  ), all_charges as (
    select d.charge_key,d.amount,case when d.charge_key='other' then 'expense' else coalesce(cm.purchase_treatment,'landed_cost') end treatment,coalesce(cm.tax_applicable,false) taxable
    from direct_charges d left join public.charge_master cm on cm.user_id=v_user_id and cm.company_id=v_company_id and cm.charge_key=d.charge_key and cm.applies_to in ('purchase','both') and cm.is_active
    union all
    select c.charge_key,c.amount,case when c.charge_key='other' then 'expense' else coalesce(cm.purchase_treatment,'landed_cost') end,coalesce(cm.tax_applicable,false)
    from public.consolidated_purchase_invoice_charges c join public.purchase_order_consolidated_invoices l on l.consolidated_invoice_id=c.invoice_id
    left join public.charge_master cm on cm.user_id=v_user_id and cm.company_id=v_company_id and cm.charge_key=c.charge_key and cm.applies_to in ('purchase','both') and cm.is_active
    where l.purchase_order_id=p_order_id and l.user_id=v_user_id and l.company_id=v_company_id
  ) select coalesce(sum(case when treatment='landed_cost' then amount else 0 end),0),coalesce(sum(case when treatment='expense' then amount else 0 end),0),coalesce(sum(case when v_order.invoice_type='Tax Invoice' and taxable then amount*coalesce(v_order.tax_percent,0)/100 else 0 end),0) into v_landed_charges,v_expense_charges,v_charge_tax from all_charges;
  v_items_total:=round(v_direct_items+v_linked_items,2); v_tax_total:=round(v_direct_item_tax+v_linked_item_tax+v_charge_tax,2);
  if v_tax_total>0 and v_input_vat_account_id is null then raise exception 'Input VAT account mapping is missing.'; end if;
  v_grand_total:=round(v_items_total+v_landed_charges+v_expense_charges+v_tax_total,2);
  if v_grand_total<=0 then raise exception 'Purchase Invoice total must be greater than zero.'; end if;
  v_journal_entry_no:='PUR-'||v_order.order_no;
  if exists(select 1 from public.journal_entries where user_id=v_user_id and company_id=v_company_id and entry_no=v_journal_entry_no) then raise exception 'Accounting entry already exists for Purchase Invoice %.',v_order.order_no; end if;
  for r in select pol.item_id,pol.godown_id,pol.qty,g.warehouse_id from public.purchase_order_lines pol join public.godowns g on g.id=pol.godown_id where pol.order_id=p_order_id and pol.user_id=v_user_id and pol.company_id=v_company_id and pol.source_consolidated_purchase_invoice_id is null order by pol.id loop perform public.apply_stock_movement(r.item_id,r.warehouse_id,r.godown_id,'in',r.qty,v_order.order_no); end loop;
  insert into public.journal_entries(user_id,company_id,entry_no,entry_date,description,status,party_name,trans_type) values(v_user_id,v_company_id,v_journal_entry_no,v_order.order_date,'Purchase Invoice '||v_order.order_no||' — '||v_supplier_name,'draft',v_supplier_name,'Purchase') returning id into v_journal_entry_id;
  insert into public.journal_lines(user_id,company_id,entry_id,account,account_id,debit,credit) select v_user_id,v_company_id,v_journal_entry_id,coa.name,v_inventory_account_id,round(v_items_total+v_landed_charges,2),0 from public.chart_of_accounts coa where coa.id=v_inventory_account_id and coa.user_id=v_user_id and coa.company_id=v_company_id;

  -- Expense charges post charge-by-charge to their configured cost account.
  for r in
    with direct_charges(charge_key,amount) as (values
      ('loading',coalesce(v_order.loading_charge,0)),('unloading',coalesce(v_order.unloading_charge,0)),('cutting',coalesce(v_order.cutting_charge,0)),('transport',coalesce(v_order.transport_charge,0)),('labour',coalesce(v_order.labour_charge,0)),('handling',coalesce(v_order.handling_charge,0)),('other',coalesce(v_order.other_charge,0))
    ), all_charges as (
      select d.charge_key,d.amount,case when d.charge_key='other' then 'expense' else coalesce(cm.purchase_treatment,'landed_cost') end treatment,cm.cost_account_id
      from direct_charges d left join public.charge_master cm on cm.user_id=v_user_id and cm.company_id=v_company_id and cm.charge_key=d.charge_key and cm.applies_to in ('purchase','both') and cm.is_active
      union all
      select c.charge_key,c.amount,case when c.charge_key='other' then 'expense' else coalesce(cm.purchase_treatment,'landed_cost') end,cm.cost_account_id
      from public.consolidated_purchase_invoice_charges c join public.purchase_order_consolidated_invoices l on l.consolidated_invoice_id=c.invoice_id
      left join public.charge_master cm on cm.user_id=v_user_id and cm.company_id=v_company_id and cm.charge_key=c.charge_key and cm.applies_to in ('purchase','both') and cm.is_active
      where l.purchase_order_id=p_order_id and l.user_id=v_user_id and l.company_id=v_company_id
    ) select coalesce(cost_account_id,v_general_expense_account_id) account_id,sum(amount) amount from all_charges where treatment='expense' and amount>0 group by coalesce(cost_account_id,v_general_expense_account_id)
  loop
    insert into public.journal_lines(user_id,company_id,entry_id,account,account_id,debit,credit)
    select v_user_id,v_company_id,v_journal_entry_id,coa.name,r.account_id,round(r.amount,2),0 from public.chart_of_accounts coa where coa.id=r.account_id and coa.user_id=v_user_id and coa.company_id=v_company_id;
  end loop;
  if v_tax_total>0 then insert into public.journal_lines(user_id,company_id,entry_id,account,account_id,debit,credit) select v_user_id,v_company_id,v_journal_entry_id,coa.name,v_input_vat_account_id,v_tax_total,0 from public.chart_of_accounts coa where coa.id=v_input_vat_account_id and coa.user_id=v_user_id and coa.company_id=v_company_id; end if;
  insert into public.journal_lines(user_id,company_id,entry_id,account,account_id,debit,credit,party_name,party_type,party_id) select v_user_id,v_company_id,v_journal_entry_id,coa.name,v_ap_account_id,0,v_grand_total,v_supplier_name,'supplier',v_order.supplier_id from public.chart_of_accounts coa where coa.id=v_ap_account_id and coa.user_id=v_user_id and coa.company_id=v_company_id;
  select public.post_journal_entry(v_journal_entry_id) into v_result;
  update public.purchase_orders set status='posted',total=v_grand_total,posted_at=now(),posted_by=auth.uid(),updated_at=now() where id=p_order_id and user_id=v_user_id and company_id=v_company_id and status<>'posted';
  if not found then raise exception 'Purchase Invoice could not be marked as posted.'; end if;
  return jsonb_build_object('success',true,'order_id',p_order_id,'order_no',v_order.order_no,'journal_entry_id',v_journal_entry_id,'journal_entry_no',v_journal_entry_no,'inventory_value',round(v_items_total+v_landed_charges,2),'expense_charges',v_expense_charges,'tax_total',v_tax_total,'grand_total',v_grand_total,'status','posted');
end $function$;
