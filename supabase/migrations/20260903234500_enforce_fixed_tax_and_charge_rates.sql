begin;

create or replace function public.enforce_document_tax_rate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_context text := case when tg_table_name = 'sales_orders' then 'sales' else 'purchase' end;
  v_rate numeric;
begin
  if new.company_id <> public.current_company_id() then
    raise exception 'Document company does not match the active company.';
  end if;
  if new.invoice_type = 'Tax Invoice' then
    select rate into v_rate from public.tax_rates
    where company_id=new.company_id and is_active and is_fixed
      and applies_to in (v_context,'both')
    order by created_at limit 1;
    if v_rate is not null and round(coalesce(new.tax_percent,0),4) <> round(v_rate,4) then
      raise exception 'The configured fixed tax rate is %%%.',v_rate;
    end if;
  elsif coalesce(new.tax_percent,0) <> 0 then
    raise exception 'Non-tax documents cannot contain VAT/tax.';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_enforce_sales_tax_rate on public.sales_orders;
create trigger trg_enforce_sales_tax_rate before insert or update of company_id,invoice_type,tax_percent
on public.sales_orders for each row execute function public.enforce_document_tax_rate();
drop trigger if exists trg_enforce_purchase_tax_rate on public.purchase_orders;
create trigger trg_enforce_purchase_tax_rate before insert or update of company_id,invoice_type,tax_percent
on public.purchase_orders for each row execute function public.enforce_document_tax_rate();

create or replace function public.enforce_document_line_tax_rate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_context text := case when tg_table_name = 'sales_order_lines' then 'sales' else 'purchase' end;
  v_invoice_type text;
  v_company_id uuid;
  v_rate numeric;
begin
  if v_context='sales' then select invoice_type,company_id into v_invoice_type,v_company_id from public.sales_orders where id=new.order_id;
  else select invoice_type,company_id into v_invoice_type,v_company_id from public.purchase_orders where id=new.order_id; end if;
  if v_company_id is null or v_company_id<>public.current_company_id() or new.company_id<>v_company_id then raise exception 'Document line does not belong to the active company.'; end if;
  if v_invoice_type='Tax Invoice' then
    select rate into v_rate from public.tax_rates where company_id=v_company_id and is_active and is_fixed and applies_to in(v_context,'both') order by created_at limit 1;
    if v_rate is not null and round(coalesce(new.tax_percent,0),4)<>round(v_rate,4) then raise exception 'The configured fixed tax rate is %%%.',v_rate; end if;
  elsif coalesce(new.tax_percent,0)<>0 then raise exception 'Non-tax document lines cannot contain VAT/tax.'; end if;
  return new;
end;
$function$;

drop trigger if exists trg_enforce_sales_line_tax_rate on public.sales_order_lines;
create trigger trg_enforce_sales_line_tax_rate before insert or update of order_id,company_id,tax_percent on public.sales_order_lines for each row execute function public.enforce_document_line_tax_rate();
drop trigger if exists trg_enforce_purchase_line_tax_rate on public.purchase_order_lines;
create trigger trg_enforce_purchase_line_tax_rate before insert or update of order_id,company_id,tax_percent on public.purchase_order_lines for each row execute function public.enforce_document_line_tax_rate();

create or replace function public.enforce_sales_charge_settings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_invoice_type text; v_company_id uuid; v_master public.charge_master%rowtype; v_tax numeric;
begin
  select invoice_type,company_id into v_invoice_type,v_company_id from public.sales_orders where id=new.order_id;
  if v_company_id is null or v_company_id<>public.current_company_id() or new.company_id<>v_company_id then raise exception 'Invoice charge does not belong to the active company.'; end if;
  select * into v_master from public.charge_master where company_id=v_company_id and charge_key=new.charge_key and is_active and applies_to in('sales','both');
  if not found then raise exception 'Charge % is not active for sales.',new.charge_key; end if;
  if v_master.is_fixed and round(coalesce(new.rate,0),4)<>round(v_master.default_rate,4) then raise exception 'The configured fixed rate for % is %.',v_master.charge_name,v_master.default_rate; end if;
  if v_invoice_type='Tax Invoice' and v_master.tax_applicable then
    select rate into v_tax from public.tax_rates where company_id=v_company_id and is_active and is_fixed and applies_to in('sales','both') order by created_at limit 1;
    if v_tax is not null and round(coalesce(new.tax_percent,0),4)<>round(v_tax,4) then raise exception 'The configured fixed tax rate is %%%.',v_tax; end if;
  elsif coalesce(new.tax_percent,0)<>0 then raise exception 'Tax is not allowed for this charge/document.'; end if;
  return new;
end;
$function$;

drop trigger if exists trg_enforce_sales_charge_settings on public.sales_order_charges;
create trigger trg_enforce_sales_charge_settings before insert or update on public.sales_order_charges for each row execute function public.enforce_sales_charge_settings();

revoke all on function public.enforce_document_tax_rate() from public,anon,authenticated;
revoke all on function public.enforce_document_line_tax_rate() from public,anon,authenticated;
revoke all on function public.enforce_sales_charge_settings() from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
