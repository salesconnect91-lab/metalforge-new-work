create or replace function public.receive_customer_payment(
  p_customer_id uuid,
  p_payment_date date,
  p_payment_account_id uuid,
  p_payment_method text,
  p_reference text,
  p_description text,
  p_notes text,
  p_allocations jsonb,
  p_amount numeric default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_uid uuid := public.legacy_data_user_id();
  v_company uuid := public.current_company_id();
  v_bu uuid := public.current_business_unit_id();
  v_customer public.customers%rowtype;
  v_ar uuid; v_cash uuid; v_bank uuid;
  v_payment_text text; v_ar_text text;
  v_amount numeric := round(coalesce(p_amount,0),2);
  v_alloc numeric := 0;
  v_journal uuid; v_ar_line uuid; v_entry_no text; v_next bigint;
  r record; v_invoice public.sales_orders%rowtype; v_existing numeric; v_outstanding numeric;
begin
  perform public.assert_module_permission('accounting','post');
  if v_uid is null or v_company is null or v_bu is null then raise exception 'Authentication and active company/business unit are required.'; end if;
  if p_customer_id is null or p_payment_account_id is null then raise exception 'Customer and payment account are required.'; end if;
  if p_allocations is null then p_allocations := '[]'::jsonb; end if;
  if jsonb_typeof(p_allocations) <> 'array' then raise exception 'Payment allocations must be a JSON array.'; end if;
  select * into v_customer from public.customers where id=p_customer_id and user_id=v_uid and company_id=v_company for update;
  if not found then raise exception 'Customer not found in active company.'; end if;
  select account_id into v_ar from public.account_mappings where user_id=v_uid and company_id=v_company and mapping_key='accounts_receivable' limit 1;
  select account_id into v_cash from public.account_mappings where user_id=v_uid and company_id=v_company and mapping_key='cash' limit 1;
  select account_id into v_bank from public.account_mappings where user_id=v_uid and company_id=v_company and mapping_key='bank' limit 1;
  if v_ar is null then raise exception 'Accounts Receivable mapping is missing.'; end if;
  if v_customer.account_id is distinct from v_ar then raise exception 'Customer is not linked to configured Accounts Receivable account.'; end if;
  if p_payment_account_id is distinct from v_cash and p_payment_account_id is distinct from v_bank then raise exception 'Payment account must be configured Cash or Bank.'; end if;
  select code||' - '||name into v_payment_text from public.chart_of_accounts where id=p_payment_account_id and user_id=v_uid and company_id=v_company and is_active and not is_group;
  select code||' - '||name into v_ar_text from public.chart_of_accounts where id=v_ar and user_id=v_uid and company_id=v_company and is_active and not is_group;
  if v_payment_text is null or v_ar_text is null then raise exception 'Configured Cash/Bank or AR account is invalid or inactive.'; end if;
  for r in
    select (x.value->>'sales_order_id')::uuid sales_order_id, round(sum((x.value->>'amount')::numeric),2) amount
    from jsonb_array_elements(p_allocations) x(value)
    where nullif(x.value->>'sales_order_id','') is not null
    group by (x.value->>'sales_order_id')::uuid order by 1
  loop
    if r.amount<=0 then raise exception 'Allocation amount must be greater than zero.'; end if;
    select * into v_invoice from public.sales_orders where id=r.sales_order_id and user_id=v_uid and company_id=v_company and business_unit_id=v_bu and customer_id=p_customer_id for update;
    if not found then raise exception 'Allocated invoice does not belong to selected customer/active business unit.'; end if;
    if v_invoice.status<>'posted' then raise exception 'Only posted sales invoices can receive payment. Invoice: %',v_invoice.order_no; end if;
    select coalesce(sum(a.amount),0) into v_existing from public.invoice_payment_allocations a where a.user_id=v_uid and a.company_id=v_company and a.business_unit_id=v_bu and a.sales_order_id=v_invoice.id;
    v_outstanding:=greatest(round(coalesce(v_invoice.total,0),2)-round(v_existing,2),0);
    if r.amount>v_outstanding+0.005 then raise exception 'Allocation for invoice % exceeds outstanding balance. Outstanding: %, Allocation: %.',v_invoice.order_no,v_outstanding,r.amount; end if;
    v_alloc:=v_alloc+r.amount;
  end loop;
  v_alloc:=round(v_alloc,2);
  if p_amount is null then v_amount:=v_alloc; end if;
  if v_amount<=0 then raise exception 'Payment amount must be greater than zero.'; end if;
  if v_alloc>v_amount+0.005 then raise exception 'Allocated amount (%) cannot exceed payment amount (%).',v_alloc,v_amount; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_company::text||':'||v_bu::text||':customer_receipt_number',0));
  select coalesce(max(nullif(substring(entry_no from '^CR-([0-9]+)$'),'')::bigint),0)+1 into v_next from public.journal_entries where user_id=v_uid and company_id=v_company and business_unit_id=v_bu and entry_no~'^CR-[0-9]+$';
  v_entry_no:='CR-'||lpad(v_next::text,4,'0');
  insert into public.journal_entries(user_id,company_id,business_unit_id,entry_no,entry_date,description,status,payment_mode,party_name,trans_type,source_module,source_document_type)
  values(v_uid,v_company,v_bu,v_entry_no,coalesce(p_payment_date,current_date),coalesce(nullif(btrim(p_description),''),'Customer Receipt - '||v_customer.name),'draft',coalesce(nullif(btrim(p_payment_method),''),'Receipt'),v_customer.name,'Customer Receipt','accounting','customer_receipt') returning id into v_journal;
  insert into public.journal_lines(user_id,company_id,business_unit_id,entry_id,account_id,account,debit,credit) values(v_uid,v_company,v_bu,v_journal,p_payment_account_id,v_payment_text,v_amount,0);
  insert into public.journal_lines(user_id,company_id,business_unit_id,entry_id,account_id,account,debit,credit,party_type,party_id,party_name)
  values(v_uid,v_company,v_bu,v_journal,v_ar,v_ar_text,0,v_amount,'customer',v_customer.id,v_customer.name) returning id into v_ar_line;
  perform public.post_journal_entry(v_journal);
  for r in
    select (x.value->>'sales_order_id')::uuid sales_order_id, round(sum((x.value->>'amount')::numeric),2) amount
    from jsonb_array_elements(p_allocations) x(value)
    where nullif(x.value->>'sales_order_id','') is not null
    group by (x.value->>'sales_order_id')::uuid order by 1
  loop
    insert into public.invoice_payment_allocations(user_id,company_id,business_unit_id,sales_order_id,journal_entry_id,journal_line_id,customer_id,allocation_date,amount,reference,notes)
    values(v_uid,v_company,v_bu,r.sales_order_id,v_journal,v_ar_line,v_customer.id,coalesce(p_payment_date,current_date),r.amount,nullif(btrim(p_reference),''),nullif(btrim(p_notes),''));
  end loop;
  return jsonb_build_object('success',true,'entry_no',v_entry_no,'journal_entry_id',v_journal,'payment_amount',v_amount,'allocated_amount',v_alloc,'advance_amount',round(v_amount-v_alloc,2),'customer_id',v_customer.id);
end;
$$;

create or replace function public.prevent_posted_sales_order_changes() returns trigger language plpgsql set search_path to 'public','pg_temp' as $$
begin
  if coalesce(current_setting('app.maintenance_reset',true),'0')='1' then if tg_op='DELETE' then return old; end if; return new; end if;
  if old.status='posted' then
    if tg_op='DELETE' then raise exception 'Posted sales invoices cannot be deleted.'; end if;
    if (to_jsonb(new)-'paid_amount'-'outstanding_amount'-'payment_status'-'updated_at'-'updated_by') is distinct from (to_jsonb(old)-'paid_amount'-'outstanding_amount'-'payment_status'-'updated_at'-'updated_by') then
      raise exception 'Posted sales invoices are immutable; only payment status fields may change.';
    end if;
  end if;
  return new;
end$$;

drop trigger if exists trg_lock_posted_sales_orders on public.sales_orders;
create trigger trg_lock_posted_sales_orders before update or delete on public.sales_orders for each row execute function public.prevent_posted_sales_order_changes();

create or replace function public.prevent_posted_sales_order_line_changes() returns trigger language plpgsql set search_path to 'public','pg_temp' as $$
declare v_order_id uuid; v_status text;
begin
  if coalesce(current_setting('app.maintenance_reset',true),'0')='1' then if tg_op='DELETE' then return old; end if; return new; end if;
  v_order_id:=case when tg_op='DELETE' then old.order_id else new.order_id end;
  select status into v_status from public.sales_orders where id=v_order_id;
  if v_status='posted' then raise exception 'Lines of a posted sales invoice cannot be modified.'; end if;
  if tg_op='UPDATE' and old.order_id is distinct from new.order_id then select status into v_status from public.sales_orders where id=old.order_id; if v_status='posted' then raise exception 'Lines of a posted sales invoice cannot be modified.'; end if; end if;
  return case when tg_op='DELETE' then old else new end;
end$$;

drop trigger if exists trg_lock_posted_sales_order_lines on public.sales_order_lines;
create trigger trg_lock_posted_sales_order_lines before insert or update or delete on public.sales_order_lines for each row execute function public.prevent_posted_sales_order_line_changes();

create or replace function public.prevent_posted_return_note_changes() returns trigger language plpgsql set search_path to 'public','pg_temp' as $$
begin
  if coalesce(current_setting('app.maintenance_reset',true),'0')='1' then if tg_op='DELETE' then return old; end if; return new; end if;
  if old.status='posted' then raise exception 'Posted Credit/Debit Notes are immutable. Create a correcting document instead.'; end if;
  return case when tg_op='DELETE' then old else new end;
end$$;

drop trigger if exists trg_lock_posted_return_notes on public.return_notes;
create trigger trg_lock_posted_return_notes before update or delete on public.return_notes for each row execute function public.prevent_posted_return_note_changes();

create or replace function public.prevent_posted_return_note_line_changes() returns trigger language plpgsql set search_path to 'public','pg_temp' as $$
declare v_note uuid; v_status text;
begin
  if coalesce(current_setting('app.maintenance_reset',true),'0')='1' then if tg_op='DELETE' then return old; end if; return new; end if;
  v_note:=case when tg_op='DELETE' then old.note_id else new.note_id end;
  select status into v_status from public.return_notes where id=v_note;
  if v_status='posted' then raise exception 'Lines of a posted Credit/Debit Note are immutable.'; end if;
  return case when tg_op='DELETE' then old else new end;
end$$;

drop trigger if exists trg_lock_posted_return_note_lines on public.return_note_lines;
create trigger trg_lock_posted_return_note_lines before insert or update or delete on public.return_note_lines for each row execute function public.prevent_posted_return_note_line_changes();