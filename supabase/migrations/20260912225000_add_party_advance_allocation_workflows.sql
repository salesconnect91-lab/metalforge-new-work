create or replace function public.recalculate_purchase_order_payment_status()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_order uuid:=coalesce(new.purchase_order_id,old.purchase_order_id);
  v_user uuid:=coalesce(new.user_id,old.user_id);
  v_company uuid:=coalesce(new.company_id,old.company_id);
  v_unit uuid:=coalesce(new.business_unit_id,old.business_unit_id);
  v_total numeric:=0;
  v_paid numeric:=0;
  v_out numeric:=0;
  v_status text:='unpaid';
begin
  select coalesce(total,0) into v_total
  from public.purchase_orders
  where id=v_order and user_id=v_user and company_id=v_company and business_unit_id=v_unit;
  if not found then raise exception 'Purchase invoice not found for payment allocation in its business unit.'; end if;

  select coalesce(sum(amount),0) into v_paid
  from public.purchase_payment_allocations
  where purchase_order_id=v_order and user_id=v_user and company_id=v_company and business_unit_id=v_unit;

  v_paid:=round(v_paid,2);
  v_total:=round(v_total,2);
  v_out:=greatest(v_total-v_paid,0);
  v_status:=case when v_paid<=0 then 'unpaid' when v_paid<v_total then 'partial' when v_paid=v_total then 'paid' else 'overpaid' end;

  perform set_config('app.supplier_payment_update','1',true);
  update public.purchase_orders
  set paid_amount=v_paid,outstanding_amount=v_out,payment_status=v_status
  where id=v_order and user_id=v_user and company_id=v_company and business_unit_id=v_unit;

  return coalesce(new,old);
end
$function$;

create or replace function public.validate_purchase_payment_allocation()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_supplier uuid;
  v_total numeric:=0;
  v_unit uuid;
  v_location uuid;
  v_status text;
  v_existing numeric:=0;
begin
  if new.amount is null or new.amount<=0 then raise exception 'Allocation amount must be greater than zero.'; end if;

  select supplier_id,coalesce(total,0),business_unit_id,operating_location_id,status
  into v_supplier,v_total,v_unit,v_location,v_status
  from public.purchase_orders
  where id=new.purchase_order_id and company_id=new.company_id;

  if v_supplier is null then raise exception 'Purchase invoice does not have a supplier assigned.'; end if;
  if v_status<>'posted' then raise exception 'Only posted Purchase Invoices can receive payment allocations.'; end if;
  if new.supplier_id is distinct from v_supplier then raise exception 'Selected payment supplier does not match Purchase Invoice supplier.'; end if;
  if new.business_unit_id is not null and new.business_unit_id is distinct from v_unit then raise exception 'Payment allocation belongs to another business unit.'; end if;
  if new.operating_location_id is not null and v_location is not null and new.operating_location_id is distinct from v_location then raise exception 'Payment allocation belongs to another operating location.'; end if;

  new.business_unit_id:=v_unit;
  if v_location is not null then new.operating_location_id:=v_location; end if;

  select coalesce(sum(amount),0) into v_existing
  from public.purchase_payment_allocations
  where purchase_order_id=new.purchase_order_id
    and business_unit_id=v_unit
    and id<>coalesce(new.id,gen_random_uuid());

  if round(v_existing+new.amount,2)>round(v_total,2)+0.005 then
    raise exception 'Allocation exceeds Purchase Invoice total. Invoice total: %, Already allocated: %, New allocation: %',v_total,v_existing,new.amount;
  end if;

  return new;
end
$function$;

drop trigger if exists trg_validate_purchase_payment_allocation on public.purchase_payment_allocations;
create trigger trg_validate_purchase_payment_allocation
before insert or update on public.purchase_payment_allocations
for each row execute function public.validate_purchase_payment_allocation();

drop trigger if exists trg_recalculate_purchase_order_payment_status on public.purchase_payment_allocations;
create trigger trg_recalculate_purchase_order_payment_status
after insert or update or delete on public.purchase_payment_allocations
for each row execute function public.recalculate_purchase_order_payment_status();

create or replace function public.allocate_customer_advance(
  p_receipt_journal_entry_id uuid,
  p_sales_order_id uuid,
  p_amount numeric,
  p_allocation_date date default current_date,
  p_reference text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid:=public.legacy_data_user_id();
  v_company uuid:=public.current_company_id();
  v_bu uuid:=public.current_business_unit_id();
  v_loc uuid:=public.current_operating_location_id();
  v_receipt public.journal_entries%rowtype;
  v_invoice public.sales_orders%rowtype;
  v_customer uuid;
  v_ar_line uuid;
  v_receipt_amount numeric:=0;
  v_used numeric:=0;
  v_available numeric:=0;
  v_invoice_paid numeric:=0;
  v_invoice_outstanding numeric:=0;
  v_amount numeric:=round(coalesce(p_amount,0),2);
begin
  perform public.assert_module_permission('accounting','post');
  if v_uid is null or v_company is null or v_bu is null or v_loc is null then
    raise exception 'Authentication and active company, business unit and branch are required.';
  end if;
  if p_receipt_journal_entry_id is null or p_sales_order_id is null then raise exception 'Receipt and Sales Invoice are required.'; end if;
  if v_amount<=0 then raise exception 'Allocation amount must be greater than zero.'; end if;

  select * into v_receipt
  from public.journal_entries
  where id=p_receipt_journal_entry_id and user_id=v_uid and company_id=v_company and business_unit_id=v_bu
    and operating_location_id=v_loc and status='posted' and trans_type='Customer Receipt'
  for update;
  if not found then raise exception 'Posted Customer Receipt was not found in the active branch.'; end if;
  if exists(select 1 from public.journal_entries r where r.reversal_of_entry_id=v_receipt.id and r.status='posted') then
    raise exception 'Reversed Customer Receipt cannot be allocated.';
  end if;

  select jl.id,jl.party_id,round(coalesce(jl.credit,0)-coalesce(jl.debit,0),2)
  into v_ar_line,v_customer,v_receipt_amount
  from public.journal_lines jl
  where jl.entry_id=v_receipt.id and jl.company_id=v_company and jl.business_unit_id=v_bu and jl.operating_location_id=v_loc
    and jl.party_type='customer' and jl.party_id is not null
  order by jl.credit desc
  limit 1;
  if v_ar_line is null or v_customer is null or v_receipt_amount<=0 then raise exception 'Customer Receipt does not contain a valid customer credit line.'; end if;

  select round(coalesce(sum(a.amount),0),2) into v_used
  from public.invoice_payment_allocations a
  where a.journal_entry_id=v_receipt.id and a.user_id=v_uid and a.company_id=v_company and a.business_unit_id=v_bu;
  v_available:=greatest(round(v_receipt_amount-v_used,2),0);
  if v_amount>v_available+0.005 then raise exception 'Allocation exceeds available customer advance. Available: %, Allocation: %',v_available,v_amount; end if;

  select * into v_invoice
  from public.sales_orders
  where id=p_sales_order_id and user_id=v_uid and company_id=v_company and business_unit_id=v_bu
    and operating_location_id=v_loc and customer_id=v_customer and status='posted'
  for update;
  if not found then raise exception 'Posted Sales Invoice for this customer was not found in the active branch.'; end if;

  select round(coalesce(sum(a.amount),0),2) into v_invoice_paid
  from public.invoice_payment_allocations a
  where a.sales_order_id=v_invoice.id and a.user_id=v_uid and a.company_id=v_company and a.business_unit_id=v_bu;
  v_invoice_outstanding:=greatest(round(coalesce(v_invoice.total,0),2)-v_invoice_paid,0);
  if v_amount>v_invoice_outstanding+0.005 then raise exception 'Allocation exceeds Sales Invoice outstanding balance. Outstanding: %, Allocation: %',v_invoice_outstanding,v_amount; end if;

  insert into public.invoice_payment_allocations(
    user_id,company_id,business_unit_id,operating_location_id,sales_order_id,journal_entry_id,journal_line_id,customer_id,
    allocation_date,amount,reference,notes
  ) values(
    v_uid,v_company,v_bu,v_loc,v_invoice.id,v_receipt.id,v_ar_line,v_customer,
    coalesce(p_allocation_date,current_date),v_amount,nullif(btrim(p_reference),''),nullif(btrim(p_notes),'')
  );

  return jsonb_build_object(
    'success',true,'receipt_journal_entry_id',v_receipt.id,'sales_order_id',v_invoice.id,'customer_id',v_customer,
    'allocated_amount',v_amount,'advance_remaining',round(v_available-v_amount,2),
    'invoice_outstanding_after',round(v_invoice_outstanding-v_amount,2)
  );
end
$function$;

create or replace function public.pay_supplier_advance(
  p_supplier_id uuid,
  p_payment_date date,
  p_payment_account_id uuid,
  p_payment_method text,
  p_reference text,
  p_description text,
  p_notes text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid:=public.legacy_data_user_id();
  v_company uuid:=public.current_company_id();
  v_bu uuid:=public.current_business_unit_id();
  v_loc uuid:=public.current_operating_location_id();
  v_supplier public.suppliers%rowtype;
  v_ap uuid;
  v_amount numeric:=round(coalesce(p_amount,0),2);
  v_date date:=coalesce(p_payment_date,current_date);
  v_method text:=lower(coalesce(nullif(btrim(p_payment_method),''),'cash'));
  v_payment_text text;
  v_payment_detail text;
  v_ap_text text;
  v_journal uuid;
  v_ap_line uuid;
  v_entry_no text;
  v_next bigint;
begin
  perform public.assert_module_permission('accounting','post');
  if v_uid is null or v_company is null or v_bu is null or v_loc is null then raise exception 'Authentication and active company, business unit and branch are required.'; end if;
  if p_supplier_id is null or p_payment_account_id is null then raise exception 'Supplier and Payment Account are required.'; end if;
  if v_amount<=0 then raise exception 'Payment amount must be greater than zero.'; end if;
  if v_method not in ('cash','bank','cheque','online','other') then raise exception 'Unsupported payment method: %.',p_payment_method; end if;

  select * into v_supplier from public.suppliers where id=p_supplier_id and user_id=v_uid and company_id=v_company for update;
  if not found then raise exception 'Supplier not found in active company.'; end if;

  select account_id into v_ap from public.account_mappings where user_id=v_uid and company_id=v_company and mapping_key='accounts_payable' limit 1;
  if v_ap is null then raise exception 'Accounts Payable mapping is missing.'; end if;
  if v_supplier.account_id is distinct from v_ap then raise exception 'Supplier is not linked to configured Accounts Payable account.'; end if;

  select code||' - '||name,detail_type into v_payment_text,v_payment_detail
  from public.chart_of_accounts
  where id=p_payment_account_id and user_id=v_uid and company_id=v_company and is_active and not is_group and allow_manual_entries
    and detail_type in ('Cash on Hand','Bank Account');
  if v_payment_text is null then raise exception 'Payment account must be an active posting Cash on Hand or Bank Account.'; end if;
  if v_method='cash' and v_payment_detail<>'Cash on Hand' then raise exception 'Cash payment method requires a Cash on Hand account.'; end if;
  if v_method in ('bank','cheque','online') and v_payment_detail<>'Bank Account' then raise exception '% payment method requires a Bank Account.',initcap(v_method); end if;

  select code||' - '||name into v_ap_text from public.chart_of_accounts where id=v_ap and user_id=v_uid and company_id=v_company and is_active and not is_group;
  if v_ap_text is null then raise exception 'Configured AP account is invalid or inactive.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_company::text||':'||v_bu::text||':supplier_payment_number',0));
  select coalesce(max(nullif(substring(entry_no from '^SP-([0-9]+)$'),'')::bigint),0)+1 into v_next
  from public.journal_entries
  where user_id=v_uid and company_id=v_company and business_unit_id=v_bu and entry_no~'^SP-[0-9]+$';
  v_entry_no:='SP-'||lpad(v_next::text,4,'0');

  insert into public.journal_entries(
    user_id,company_id,business_unit_id,operating_location_id,entry_no,entry_date,description,status,payment_mode,party_name,trans_type,
    source_module,source_document_type,payment_amount
  ) values(
    v_uid,v_company,v_bu,v_loc,v_entry_no,v_date,
    coalesce(nullif(btrim(p_description),''),'Supplier Advance - '||v_supplier.name),
    'draft',coalesce(nullif(btrim(p_payment_method),''),'Cash'),v_supplier.name,'Supplier Payment','accounting','supplier_advance',v_amount
  ) returning id into v_journal;

  insert into public.journal_lines(
    user_id,company_id,business_unit_id,operating_location_id,entry_id,account,debit,credit,account_id,party_name,party_type,party_id
  ) values(
    v_uid,v_company,v_bu,v_loc,v_journal,v_ap_text,v_amount,0,v_ap,v_supplier.name,'supplier',v_supplier.id
  ) returning id into v_ap_line;

  insert into public.journal_lines(user_id,company_id,business_unit_id,operating_location_id,entry_id,account,debit,credit,account_id)
  values(v_uid,v_company,v_bu,v_loc,v_journal,v_payment_text,0,v_amount,p_payment_account_id);

  perform public.post_journal_entry(v_journal);

  return jsonb_build_object('success',true,'entry_no',v_entry_no,'journal_entry_id',v_journal,'journal_line_id',v_ap_line,
    'supplier_id',v_supplier.id,'payment_amount',v_amount,'advance_amount',v_amount);
end
$function$;

create or replace function public.allocate_supplier_advance(
  p_payment_journal_entry_id uuid,
  p_purchase_order_id uuid,
  p_amount numeric,
  p_allocation_date date default current_date,
  p_reference text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid:=public.legacy_data_user_id();
  v_company uuid:=public.current_company_id();
  v_bu uuid:=public.current_business_unit_id();
  v_loc uuid:=public.current_operating_location_id();
  v_payment public.journal_entries%rowtype;
  v_order public.purchase_orders%rowtype;
  v_supplier uuid;
  v_ap_line uuid;
  v_payment_amount numeric:=0;
  v_used numeric:=0;
  v_available numeric:=0;
  v_paid numeric:=0;
  v_outstanding numeric:=0;
  v_amount numeric:=round(coalesce(p_amount,0),2);
begin
  perform public.assert_module_permission('accounting','post');
  if v_uid is null or v_company is null or v_bu is null or v_loc is null then raise exception 'Authentication and active company, business unit and branch are required.'; end if;
  if p_payment_journal_entry_id is null or p_purchase_order_id is null then raise exception 'Supplier Payment and Purchase Invoice are required.'; end if;
  if v_amount<=0 then raise exception 'Allocation amount must be greater than zero.'; end if;

  select * into v_payment
  from public.journal_entries
  where id=p_payment_journal_entry_id and user_id=v_uid and company_id=v_company and business_unit_id=v_bu
    and operating_location_id=v_loc and status='posted' and trans_type='Supplier Payment'
  for update;
  if not found then raise exception 'Posted Supplier Payment was not found in the active branch.'; end if;
  if exists(select 1 from public.journal_entries r where r.reversal_of_entry_id=v_payment.id and r.status='posted') then raise exception 'Reversed Supplier Payment cannot be allocated.'; end if;

  select jl.id,jl.party_id,round(coalesce(jl.debit,0)-coalesce(jl.credit,0),2)
  into v_ap_line,v_supplier,v_payment_amount
  from public.journal_lines jl
  where jl.entry_id=v_payment.id and jl.company_id=v_company and jl.business_unit_id=v_bu and jl.operating_location_id=v_loc
    and jl.party_type='supplier' and jl.party_id is not null
  order by jl.debit desc
  limit 1;
  if v_ap_line is null or v_supplier is null or v_payment_amount<=0 then raise exception 'Supplier Payment does not contain a valid supplier debit line.'; end if;

  select round(coalesce(sum(a.amount),0),2) into v_used
  from public.purchase_payment_allocations a
  where a.journal_entry_id=v_payment.id and a.user_id=v_uid and a.company_id=v_company and a.business_unit_id=v_bu;
  v_available:=greatest(round(v_payment_amount-v_used,2),0);
  if v_amount>v_available+0.005 then raise exception 'Allocation exceeds available supplier advance. Available: %, Allocation: %',v_available,v_amount; end if;

  select * into v_order
  from public.purchase_orders
  where id=p_purchase_order_id and user_id=v_uid and company_id=v_company and business_unit_id=v_bu
    and operating_location_id=v_loc and supplier_id=v_supplier and status='posted'
  for update;
  if not found then raise exception 'Posted Purchase Invoice for this supplier was not found in the active branch.'; end if;

  select round(coalesce(sum(a.amount),0),2) into v_paid
  from public.purchase_payment_allocations a
  where a.purchase_order_id=v_order.id and a.user_id=v_uid and a.company_id=v_company and a.business_unit_id=v_bu;
  v_outstanding:=greatest(round(coalesce(v_order.total,0),2)-v_paid,0);
  if v_amount>v_outstanding+0.005 then raise exception 'Allocation exceeds Purchase Invoice outstanding balance. Outstanding: %, Allocation: %',v_outstanding,v_amount; end if;

  insert into public.purchase_payment_allocations(
    user_id,company_id,business_unit_id,operating_location_id,purchase_order_id,order_no,journal_entry_id,journal_line_id,
    supplier_id,supplier_name,amount,allocation_date,reference,notes
  ) values(
    v_uid,v_company,v_bu,v_loc,v_order.id,v_order.order_no,v_payment.id,v_ap_line,
    v_supplier,v_payment.party_name,v_amount,coalesce(p_allocation_date,current_date),nullif(btrim(p_reference),''),nullif(btrim(p_notes),'')
  );

  return jsonb_build_object('success',true,'payment_journal_entry_id',v_payment.id,'purchase_order_id',v_order.id,'supplier_id',v_supplier,
    'allocated_amount',v_amount,'advance_remaining',round(v_available-v_amount,2),'invoice_outstanding_after',round(v_outstanding-v_amount,2));
end
$function$;

revoke all on function public.allocate_customer_advance(uuid,uuid,numeric,date,text,text) from public,anon;
grant execute on function public.allocate_customer_advance(uuid,uuid,numeric,date,text,text) to authenticated;
revoke all on function public.pay_supplier_advance(uuid,date,uuid,text,text,text,text,numeric) from public,anon;
grant execute on function public.pay_supplier_advance(uuid,date,uuid,text,text,text,text,numeric) to authenticated;
revoke all on function public.allocate_supplier_advance(uuid,uuid,numeric,date,text,text) from public,anon;
grant execute on function public.allocate_supplier_advance(uuid,uuid,numeric,date,text,text) to authenticated;
