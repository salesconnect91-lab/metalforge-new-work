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
