create or replace function public.receive_customer_payment(
  p_customer_id uuid,
  p_payment_date date,
  p_payment_account_id uuid,
  p_payment_method text,
  p_reference text,
  p_description text,
  p_notes text,
  p_allocations jsonb,
  p_amount numeric default null::numeric
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid := public.legacy_data_user_id();
  v_company uuid := public.current_company_id();
  v_bu uuid := public.current_business_unit_id();
  v_customer public.customers%rowtype;
  v_ar uuid;
  v_payment_text text;
  v_payment_detail text;
  v_ar_text text;
  v_method text := lower(coalesce(nullif(btrim(p_payment_method),''),'cash'));
  v_amount numeric := round(coalesce(p_amount,0),2);
  v_alloc numeric := 0;
  v_journal uuid;
  v_ar_line uuid;
  v_entry_no text;
  v_next bigint;
  r record;
  v_invoice public.sales_orders%rowtype;
  v_existing numeric;
  v_outstanding numeric;
begin
  perform public.assert_module_permission('accounting','post');
  if v_uid is null or v_company is null or v_bu is null then
    raise exception 'Authentication and active company/business unit are required.';
  end if;
  if p_customer_id is null or p_payment_account_id is null then
    raise exception 'Customer and payment account are required.';
  end if;
  if v_method not in ('cash','bank','cheque','online','other') then
    raise exception 'Unsupported payment method: %.', p_payment_method;
  end if;
  if p_allocations is null then p_allocations := '[]'::jsonb; end if;
  if jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Payment allocations must be a JSON array.';
  end if;

  select * into v_customer
  from public.customers
  where id=p_customer_id and user_id=v_uid and company_id=v_company
  for update;
  if not found then raise exception 'Customer not found in active company.'; end if;

  select account_id into v_ar
  from public.account_mappings
  where user_id=v_uid and company_id=v_company and mapping_key='accounts_receivable'
  limit 1;
  if v_ar is null then raise exception 'Accounts Receivable mapping is missing.'; end if;
  if v_customer.account_id is distinct from v_ar then
    raise exception 'Customer is not linked to configured Accounts Receivable account.';
  end if;

  select code||' - '||name, detail_type
    into v_payment_text, v_payment_detail
  from public.chart_of_accounts
  where id=p_payment_account_id
    and user_id=v_uid
    and company_id=v_company
    and is_active
    and not is_group
    and allow_manual_entries
    and detail_type in ('Cash on Hand','Bank Account');
  if v_payment_text is null then
    raise exception 'Payment account must be an active posting Cash on Hand or Bank Account.';
  end if;
  if v_method='cash' and v_payment_detail <> 'Cash on Hand' then
    raise exception 'Cash payment method requires a Cash on Hand account.';
  end if;
  if v_method in ('bank','cheque','online') and v_payment_detail <> 'Bank Account' then
    raise exception '% payment method requires a Bank Account.', initcap(v_method);
  end if;

  select code||' - '||name into v_ar_text
  from public.chart_of_accounts
  where id=v_ar and user_id=v_uid and company_id=v_company and is_active and not is_group;
  if v_ar_text is null then raise exception 'Configured AR account is invalid or inactive.'; end if;

  for r in
    select (x.value->>'sales_order_id')::uuid sales_order_id,
           round(sum((x.value->>'amount')::numeric),2) amount
    from jsonb_array_elements(p_allocations) x(value)
    where nullif(x.value->>'sales_order_id','') is not null
    group by (x.value->>'sales_order_id')::uuid
    order by 1
  loop
    if r.amount<=0 then raise exception 'Allocation amount must be greater than zero.'; end if;
    select * into v_invoice
    from public.sales_orders
    where id=r.sales_order_id and user_id=v_uid and company_id=v_company and business_unit_id=v_bu and customer_id=p_customer_id
    for update;
    if not found then raise exception 'Allocated invoice does not belong to selected customer/active business unit.'; end if;
    if v_invoice.status<>'posted' then raise exception 'Only posted sales invoices can receive payment. Invoice: %',v_invoice.order_no; end if;
    select coalesce(sum(a.amount),0) into v_existing
    from public.invoice_payment_allocations a
    where a.user_id=v_uid and a.company_id=v_company and a.business_unit_id=v_bu and a.sales_order_id=v_invoice.id;
    v_outstanding:=greatest(round(coalesce(v_invoice.total,0),2)-round(v_existing,2),0);
    if r.amount>v_outstanding+0.005 then
      raise exception 'Allocation for invoice % exceeds outstanding balance. Outstanding: %, Allocation: %.',v_invoice.order_no,v_outstanding,r.amount;
    end if;
    v_alloc:=v_alloc+r.amount;
  end loop;

  v_alloc:=round(v_alloc,2);
  if p_amount is null then v_amount:=v_alloc; end if;
  if v_amount<=0 then raise exception 'Payment amount must be greater than zero.'; end if;
  if v_alloc>v_amount+0.005 then raise exception 'Allocated amount (%) cannot exceed payment amount (%).',v_alloc,v_amount; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_company::text||':'||v_bu::text||':customer_receipt_number',0));
  select coalesce(max(nullif(substring(entry_no from '^CR-([0-9]+)$'),'')::bigint),0)+1 into v_next
  from public.journal_entries
  where user_id=v_uid and company_id=v_company and business_unit_id=v_bu and entry_no~'^CR-[0-9]+$';
  v_entry_no:='CR-'||lpad(v_next::text,4,'0');

  insert into public.journal_entries(user_id,company_id,business_unit_id,entry_no,entry_date,description,status,payment_mode,party_name,trans_type,source_module,source_document_type)
  values(v_uid,v_company,v_bu,v_entry_no,coalesce(p_payment_date,current_date),coalesce(nullif(btrim(p_description),''),'Customer Receipt - '||v_customer.name),'draft',coalesce(nullif(btrim(p_payment_method),''),'Cash'),v_customer.name,'Customer Receipt','accounting','customer_receipt')
  returning id into v_journal;

  insert into public.journal_lines(user_id,company_id,business_unit_id,entry_id,account_id,account,debit,credit)
  values(v_uid,v_company,v_bu,v_journal,p_payment_account_id,v_payment_text,v_amount,0);

  insert into public.journal_lines(user_id,company_id,business_unit_id,entry_id,account_id,account,debit,credit,party_type,party_id,party_name)
  values(v_uid,v_company,v_bu,v_journal,v_ar,v_ar_text,0,v_amount,'customer',v_customer.id,v_customer.name)
  returning id into v_ar_line;

  perform public.post_journal_entry(v_journal);

  for r in
    select (x.value->>'sales_order_id')::uuid sales_order_id, round(sum((x.value->>'amount')::numeric),2) amount
    from jsonb_array_elements(p_allocations) x(value)
    where nullif(x.value->>'sales_order_id','') is not null
    group by (x.value->>'sales_order_id')::uuid
    order by 1
  loop
    insert into public.invoice_payment_allocations(user_id,company_id,business_unit_id,sales_order_id,journal_entry_id,journal_line_id,customer_id,allocation_date,amount,reference,notes)
    values(v_uid,v_company,v_bu,r.sales_order_id,v_journal,v_ar_line,v_customer.id,coalesce(p_payment_date,current_date),r.amount,nullif(btrim(p_reference),''),nullif(btrim(p_notes),''));
  end loop;

  return jsonb_build_object('success',true,'entry_no',v_entry_no,'journal_entry_id',v_journal,'payment_amount',v_amount,'allocated_amount',v_alloc,'advance_amount',round(v_amount-v_alloc,2),'customer_id',v_customer.id);
end;
$function$;

create or replace function public.pay_supplier(
  p_supplier_id uuid,
  p_payment_date date,
  p_payment_account_id uuid,
  p_payment_method text,
  p_reference text,
  p_description text,
  p_notes text,
  p_purchase_order_id uuid,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid := public.legacy_data_user_id();
  v_company uuid := public.current_company_id();
  v_bu uuid := public.current_business_unit_id();
  v_supplier public.suppliers%rowtype;
  v_order public.purchase_orders%rowtype;
  v_ap uuid;
  v_amount numeric := round(coalesce(p_amount,0),2);
  v_paid numeric := 0;
  v_outstanding numeric := 0;
  v_date date := coalesce(p_payment_date,current_date);
  v_journal uuid;
  v_ap_line uuid;
  v_entry_no text;
  v_next bigint;
  v_payment_text text;
  v_payment_detail text;
  v_ap_text text;
  v_method text := lower(coalesce(nullif(btrim(p_payment_method),''),'cash'));
begin
  perform public.assert_module_permission('accounting','post');
  if v_uid is null or v_company is null or v_bu is null then
    raise exception 'Authentication and active company/business unit are required.';
  end if;
  if p_supplier_id is null or p_purchase_order_id is null or p_payment_account_id is null then
    raise exception 'Supplier, Purchase Invoice and Payment Account are required.';
  end if;
  if v_amount <= 0 then raise exception 'Payment amount must be greater than zero.'; end if;
  if v_method not in ('cash','bank','cheque','online','other') then
    raise exception 'Unsupported payment method: %.', p_payment_method;
  end if;

  select * into v_supplier
  from public.suppliers
  where id=p_supplier_id and user_id=v_uid and company_id=v_company
  for update;
  if not found then raise exception 'Supplier not found in active company.'; end if;

  select * into v_order
  from public.purchase_orders
  where id=p_purchase_order_id and user_id=v_uid and company_id=v_company and business_unit_id=v_bu and supplier_id=p_supplier_id
  for update;
  if not found then raise exception 'Purchase Invoice does not belong to selected supplier/active business unit.'; end if;
  if v_order.status <> 'posted' then raise exception 'Only posted Purchase Invoices can be paid.'; end if;

  select account_id into v_ap
  from public.account_mappings
  where user_id=v_uid and company_id=v_company and mapping_key='accounts_payable'
  limit 1;
  if v_ap is null then raise exception 'Accounts Payable mapping is missing.'; end if;
  if v_supplier.account_id is distinct from v_ap then raise exception 'Supplier is not linked to configured Accounts Payable account.'; end if;

  select coa.code||' - '||coa.name, coa.detail_type
    into v_payment_text, v_payment_detail
  from public.chart_of_accounts coa
  where coa.id=p_payment_account_id and coa.user_id=v_uid and coa.company_id=v_company and coa.is_active and not coa.is_group and coa.allow_manual_entries and coa.detail_type in ('Cash on Hand','Bank Account');
  if v_payment_text is null then raise exception 'Payment account must be an active posting Cash on Hand or Bank Account.'; end if;
  if v_method='cash' and v_payment_detail <> 'Cash on Hand' then raise exception 'Cash payment method requires a Cash on Hand account.'; end if;
  if v_method in ('bank','cheque','online') and v_payment_detail <> 'Bank Account' then raise exception '% payment method requires a Bank Account.', initcap(v_method); end if;

  select coa.code||' - '||coa.name into v_ap_text
  from public.chart_of_accounts coa
  where coa.id=v_ap and coa.user_id=v_uid and coa.company_id=v_company and coa.is_active and not coa.is_group;
  if v_ap_text is null then raise exception 'Configured AP account is invalid or inactive.'; end if;

  select round(coalesce(sum(a.amount),0),2) into v_paid
  from public.purchase_payment_allocations a
  where a.user_id=v_uid and a.company_id=v_company and a.business_unit_id=v_bu and a.purchase_order_id=v_order.id;
  v_outstanding := greatest(round(coalesce(v_order.total,0),2)-v_paid,0);
  if v_amount > v_outstanding + 0.005 then raise exception 'Payment exceeds Purchase Invoice outstanding balance. Outstanding: %, Payment: %.',v_outstanding,v_amount; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_company::text||':'||v_bu::text||':supplier_payment_number',0));
  select coalesce(max(nullif(substring(entry_no from '^SP-([0-9]+)$'),'')::bigint),0)+1 into v_next
  from public.journal_entries
  where user_id=v_uid and company_id=v_company and business_unit_id=v_bu and entry_no ~ '^SP-[0-9]+$';
  v_entry_no := 'SP-'||lpad(v_next::text,4,'0');

  insert into public.journal_entries(user_id,company_id,business_unit_id,entry_no,entry_date,description,status,payment_mode,party_name,trans_type,source_module,source_document_type)
  values(v_uid,v_company,v_bu,v_entry_no,v_date,coalesce(nullif(btrim(p_description),''),'Supplier Payment - '||v_supplier.name),'draft',coalesce(nullif(btrim(p_payment_method),''),'Cash'),v_supplier.name,'Supplier Payment','accounting','supplier_payment')
  returning id into v_journal;

  insert into public.journal_lines(user_id,company_id,business_unit_id,entry_id,account,debit,credit,account_id,party_name,party_type,party_id)
  values(v_uid,v_company,v_bu,v_journal,v_ap_text,v_amount,0,v_ap,v_supplier.name,'supplier',v_supplier.id)
  returning id into v_ap_line;

  insert into public.journal_lines(user_id,company_id,business_unit_id,entry_id,account,debit,credit,account_id)
  values(v_uid,v_company,v_bu,v_journal,v_payment_text,0,v_amount,p_payment_account_id);

  perform public.post_journal_entry(v_journal);

  insert into public.purchase_payment_allocations(user_id,company_id,business_unit_id,purchase_order_id,order_no,journal_entry_id,journal_line_id,supplier_id,supplier_name,amount,allocation_date,reference,notes)
  values(v_uid,v_company,v_bu,v_order.id,v_order.order_no,v_journal,v_ap_line,v_supplier.id,v_supplier.name,v_amount,v_date,nullif(btrim(p_reference),''),nullif(btrim(p_notes),''));

  v_paid := round(v_paid+v_amount,2);
  v_outstanding := greatest(round(coalesce(v_order.total,0),2)-v_paid,0);
  perform set_config('app.supplier_payment_update','1',true);
  update public.purchase_orders
  set paid_amount=v_paid,
      outstanding_amount=v_outstanding,
      payment_status=case when v_outstanding<=0.005 then 'paid' when v_paid>0 then 'partial' else 'unpaid' end
  where id=v_order.id and user_id=v_uid and company_id=v_company and business_unit_id=v_bu;
  if not found then raise exception 'Purchase Invoice payment status could not be updated.'; end if;

  return jsonb_build_object('success',true,'entry_no',v_entry_no,'journal_entry_id',v_journal,'payment_amount',v_amount,'paid_amount',v_paid,'outstanding_amount',v_outstanding,'purchase_order_id',v_order.id,'supplier_id',v_supplier.id);
end;
$function$;
