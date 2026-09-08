alter table public.customers add column if not exists ntn text, add column if not exists strn text, add column if not exists cnic text, add column if not exists tax_registration_status text not null default 'unregistered';
alter table public.suppliers add column if not exists ntn text, add column if not exists strn text, add column if not exists cnic text, add column if not exists tax_registration_status text not null default 'unregistered';
alter table public.items add column if not exists hs_code text;
alter table public.purchase_orders add column if not exists supplier_invoice_no text, add column if not exists supplier_invoice_date date, add column if not exists reference_no text, add column if not exists reference_notes text;
alter table public.sales_orders add column if not exists settlement_method text not null default 'Credit', add column if not exists fbr_invoice_no text, add column if not exists fbr_uuid text, add column if not exists fbr_verification_url text, add column if not exists fbr_qr_payload text;

alter table public.customers drop constraint if exists customers_tax_registration_status_check;
alter table public.customers add constraint customers_tax_registration_status_check check (tax_registration_status in ('registered','unregistered'));
alter table public.suppliers drop constraint if exists suppliers_tax_registration_status_check;
alter table public.suppliers add constraint suppliers_tax_registration_status_check check (tax_registration_status in ('registered','unregistered'));
alter table public.sales_orders drop constraint if exists sales_orders_settlement_method_check;
alter table public.sales_orders add constraint sales_orders_settlement_method_check check (settlement_method in ('Credit','Cash','Bank'));

create or replace function public.validate_tax_invoice_posting_fields()
returns trigger
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_company_strn text;
  v_party_status text;
  v_party_strn text;
  v_party_ntn text;
begin
  if new.status = 'posted' and old.status is distinct from 'posted' and new.invoice_type = 'Tax Invoice' then
    select nullif(btrim(cs.strn), '') into v_company_strn
    from public.company_settings cs
    where cs.company_id = new.company_id
    limit 1;
    if v_company_strn is null then
      raise exception 'Company STRN is required before posting a Tax Invoice.';
    end if;

    if tg_table_name = 'purchase_orders' then
      if new.supplier_id is null then raise exception 'Supplier is required for a Purchase Tax Invoice.'; end if;
      select s.tax_registration_status, nullif(btrim(s.strn), ''), nullif(btrim(s.ntn), '')
      into v_party_status, v_party_strn, v_party_ntn
      from public.suppliers s where s.id = new.supplier_id and s.company_id = new.company_id;
      if v_party_status = 'registered' and coalesce(v_party_strn, v_party_ntn) is null then
        raise exception 'Registered supplier STRN/NTN is required for a Purchase Tax Invoice.';
      end if;
      if nullif(btrim(new.supplier_invoice_no), '') is null or new.supplier_invoice_date is null then
        raise exception 'Supplier original invoice number and date are required for a Purchase Tax Invoice.';
      end if;
    elsif tg_table_name = 'sales_orders' then
      if new.customer_id is null then raise exception 'Customer is required for a Sales Tax Invoice.'; end if;
      select c.tax_registration_status, nullif(btrim(c.strn), ''), nullif(btrim(c.ntn), '')
      into v_party_status, v_party_strn, v_party_ntn
      from public.customers c where c.id = new.customer_id and c.company_id = new.company_id;
      if v_party_status = 'registered' and coalesce(v_party_strn, v_party_ntn) is null then
        raise exception 'Registered customer STRN/NTN is required for a Sales Tax Invoice.';
      end if;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_validate_purchase_tax_invoice_post on public.purchase_orders;
create trigger trg_validate_purchase_tax_invoice_post before update of status on public.purchase_orders for each row execute function public.validate_tax_invoice_posting_fields();
drop trigger if exists trg_validate_sales_tax_invoice_post on public.sales_orders;
create trigger trg_validate_sales_tax_invoice_post before update of status on public.sales_orders for each row execute function public.validate_tax_invoice_posting_fields();

create or replace function public.post_sales_invoice(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_company uuid := public.current_company_id();
  v_bu uuid := public.current_business_unit_id();
  v_uid uuid := public.legacy_data_user_id();
  v_mode text;
  v_customer uuid;
  v_result jsonb;
begin
  perform public.assert_module_permission('sales','post');
  if auth.uid() is null or v_company is null or v_bu is null then
    raise exception 'Authentication, active company and business unit are required.';
  end if;
  select customer_id, coalesce(payment_mode,'Credit')
  into v_customer, v_mode
  from public.sales_orders
  where id=p_order_id and user_id=v_uid and company_id=v_company and business_unit_id=v_bu
  for update;
  if not found then raise exception 'Sales invoice not found in active business unit.'; end if;
  if v_customer is null then raise exception 'Customer is required for every Main Sales Invoice, including cash/bank sales.'; end if;

  update public.sales_orders
  set settlement_method = case when v_mode in ('Cash','Bank','Credit') then v_mode else 'Credit' end,
      payment_mode = 'Credit',
      payment_account_id = null,
      updated_at = now()
  where id=p_order_id and status <> 'posted';

  v_result := public.post_sales_invoice_core(p_order_id);
  return v_result || jsonb_build_object('settlement_method', case when v_mode in ('Cash','Bank','Credit') then v_mode else 'Credit' end, 'receipt_posted_separately', true);
end;
$function$;

revoke all on function public.post_sales_invoice(uuid) from public, anon;
grant execute on function public.post_sales_invoice(uuid) to authenticated;
