create or replace function public.recalculate_sales_order_payment_status()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_order uuid:=coalesce(new.sales_order_id,old.sales_order_id);
  v_user uuid:=coalesce(new.user_id,old.user_id);
  v_company uuid:=coalesce(new.company_id,old.company_id);
  v_unit uuid:=coalesce(new.business_unit_id,old.business_unit_id);
  v_total numeric:=0;
  v_returns numeric:=0;
  v_net_total numeric:=0;
  v_paid numeric:=0;
  v_out numeric:=0;
  v_status text:='unpaid';
begin
  select coalesce(total,0) into v_total
  from public.sales_orders
  where id=v_order and user_id=v_user and company_id=v_company and business_unit_id=v_unit;
  if not found then raise exception 'Sales invoice not found for payment allocation in its business unit.'; end if;

  select round(coalesce(sum(total),0),2) into v_returns
  from public.return_notes
  where sales_order_id=v_order and user_id=v_user and company_id=v_company and business_unit_id=v_unit
    and note_type='sales_credit' and status='posted';

  select round(coalesce(sum(amount),0),2) into v_paid
  from public.invoice_payment_allocations
  where sales_order_id=v_order and user_id=v_user and company_id=v_company and business_unit_id=v_unit;

  v_total:=round(v_total,2);
  v_net_total:=greatest(round(v_total-v_returns,2),0);
  v_out:=greatest(round(v_net_total-v_paid,2),0);
  v_status:=case
    when v_net_total<=0.005 then case when v_paid>0.005 then 'overpaid' else 'paid' end
    when v_paid<=0.005 then 'unpaid'
    when v_paid<v_net_total-0.005 then 'partial'
    when v_paid>v_net_total+0.005 then 'overpaid'
    else 'paid' end;

  perform set_config('app.customer_payment_update','1',true);
  update public.sales_orders
  set paid_amount=v_paid,outstanding_amount=v_out,payment_status=v_status
  where id=v_order and user_id=v_user and company_id=v_company and business_unit_id=v_unit;

  return coalesce(new,old);
end
$function$;

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
  v_returns numeric:=0;
  v_net_total numeric:=0;
  v_paid numeric:=0;
  v_out numeric:=0;
  v_status text:='unpaid';
begin
  select coalesce(total,0) into v_total
  from public.purchase_orders
  where id=v_order and user_id=v_user and company_id=v_company and business_unit_id=v_unit;
  if not found then raise exception 'Purchase invoice not found for payment allocation in its business unit.'; end if;

  select round(coalesce(sum(total),0),2) into v_returns
  from public.return_notes
  where purchase_order_id=v_order and user_id=v_user and company_id=v_company and business_unit_id=v_unit
    and note_type='purchase_debit' and status='posted';

  select round(coalesce(sum(amount),0),2) into v_paid
  from public.purchase_payment_allocations
  where purchase_order_id=v_order and user_id=v_user and company_id=v_company and business_unit_id=v_unit;

  v_total:=round(v_total,2);
  v_net_total:=greatest(round(v_total-v_returns,2),0);
  v_out:=greatest(round(v_net_total-v_paid,2),0);
  v_status:=case
    when v_net_total<=0.005 then case when v_paid>0.005 then 'overpaid' else 'paid' end
    when v_paid<=0.005 then 'unpaid'
    when v_paid<v_net_total-0.005 then 'partial'
    when v_paid>v_net_total+0.005 then 'overpaid'
    else 'paid' end;

  perform set_config('app.supplier_payment_update','1',true);
  update public.purchase_orders
  set paid_amount=v_paid,outstanding_amount=v_out,payment_status=v_status
  where id=v_order and user_id=v_user and company_id=v_company and business_unit_id=v_unit;

  return coalesce(new,old);
end
$function$;

create or replace function public.recalculate_invoice_status_after_return_note()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_note_type text:=coalesce(new.note_type,old.note_type);
  v_sales uuid:=coalesce(new.sales_order_id,old.sales_order_id);
  v_purchase uuid:=coalesce(new.purchase_order_id,old.purchase_order_id);
  v_user uuid:=coalesce(new.user_id,old.user_id);
  v_company uuid:=coalesce(new.company_id,old.company_id);
  v_unit uuid:=coalesce(new.business_unit_id,old.business_unit_id);
  v_total numeric:=0;
  v_returns numeric:=0;
  v_net_total numeric:=0;
  v_paid numeric:=0;
  v_out numeric:=0;
  v_status text;
begin
  if v_note_type='sales_credit' and v_sales is not null then
    select coalesce(total,0) into v_total from public.sales_orders
    where id=v_sales and user_id=v_user and company_id=v_company and business_unit_id=v_unit;
    if found then
      select round(coalesce(sum(total),0),2) into v_returns from public.return_notes
      where sales_order_id=v_sales and user_id=v_user and company_id=v_company and business_unit_id=v_unit
        and note_type='sales_credit' and status='posted';
      select round(coalesce(sum(amount),0),2) into v_paid from public.invoice_payment_allocations
      where sales_order_id=v_sales and user_id=v_user and company_id=v_company and business_unit_id=v_unit;
      v_net_total:=greatest(round(v_total-v_returns,2),0);
      v_out:=greatest(round(v_net_total-v_paid,2),0);
      v_status:=case when v_net_total<=0.005 then case when v_paid>0.005 then 'overpaid' else 'paid' end
        when v_paid<=0.005 then 'unpaid' when v_paid<v_net_total-0.005 then 'partial'
        when v_paid>v_net_total+0.005 then 'overpaid' else 'paid' end;
      perform set_config('app.customer_payment_update','1',true);
      update public.sales_orders set paid_amount=v_paid,outstanding_amount=v_out,payment_status=v_status
      where id=v_sales and user_id=v_user and company_id=v_company and business_unit_id=v_unit;
    end if;
  elsif v_note_type='purchase_debit' and v_purchase is not null then
    select coalesce(total,0) into v_total from public.purchase_orders
    where id=v_purchase and user_id=v_user and company_id=v_company and business_unit_id=v_unit;
    if found then
      select round(coalesce(sum(total),0),2) into v_returns from public.return_notes
      where purchase_order_id=v_purchase and user_id=v_user and company_id=v_company and business_unit_id=v_unit
        and note_type='purchase_debit' and status='posted';
      select round(coalesce(sum(amount),0),2) into v_paid from public.purchase_payment_allocations
      where purchase_order_id=v_purchase and user_id=v_user and company_id=v_company and business_unit_id=v_unit;
      v_net_total:=greatest(round(v_total-v_returns,2),0);
      v_out:=greatest(round(v_net_total-v_paid,2),0);
      v_status:=case when v_net_total<=0.005 then case when v_paid>0.005 then 'overpaid' else 'paid' end
        when v_paid<=0.005 then 'unpaid' when v_paid<v_net_total-0.005 then 'partial'
        when v_paid>v_net_total+0.005 then 'overpaid' else 'paid' end;
      perform set_config('app.supplier_payment_update','1',true);
      update public.purchase_orders set paid_amount=v_paid,outstanding_amount=v_out,payment_status=v_status
      where id=v_purchase and user_id=v_user and company_id=v_company and business_unit_id=v_unit;
    end if;
  end if;
  return coalesce(new,old);
end
$function$;

drop trigger if exists trg_recalculate_invoice_status_after_return_note on public.return_notes;
create trigger trg_recalculate_invoice_status_after_return_note
after insert or update or delete on public.return_notes
for each row execute function public.recalculate_invoice_status_after_return_note();
