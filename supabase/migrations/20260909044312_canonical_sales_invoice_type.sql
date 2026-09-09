create or replace function public.standardize_invoice_classification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_context text;
  v_rate numeric;
begin
  v_context := case when tg_table_name = 'purchase_orders' then 'purchase' else 'sales' end;

  if tg_table_name = 'purchase_orders' then
    if new.invoice_type not in ('Purchase Invoice', 'Tax Invoice') then
      raise exception 'Purchase type must be Without Tax or With Tax.';
    end if;
  else
    -- Compatibility input only. Canonical stored value is Sale Invoice.
    if new.invoice_type = 'Cash Bill' then
      new.invoice_type := 'Sale Invoice';
    end if;
    if new.invoice_type not in ('Sale Invoice', 'Tax Invoice') then
      raise exception 'Invoice type must be Without Tax or With Tax.';
    end if;
  end if;

  if tg_table_name = 'sales_orders' then
    -- Settlement is independent from document classification. Receipts are
    -- posted separately and allocated to the receivable.
    new.payment_mode := 'Credit';
  end if;

  if new.invoice_type = 'Tax Invoice' then
    select tr.rate
      into v_rate
      from public.tax_rates tr
     where tr.company_id = new.company_id
       and tr.is_active
       and tr.is_fixed
       and tr.applies_to in (v_context, 'both')
     order by tr.created_at
     limit 1;

    if v_rate is null then
      raise exception 'Configure one active fixed % tax rate before creating a tax invoice.', v_context;
    end if;

    if round(coalesce(new.tax_percent, 0), 4) <> round(v_rate, 4) then
      raise exception 'The configured fixed tax rate is %%%.', v_rate;
    end if;
  elsif coalesce(new.tax_percent, 0) <> 0 then
    raise exception 'Without Tax documents cannot contain VAT/tax.';
  end if;

  return new;
end;
$function$;

alter table public.sales_orders alter column invoice_type set default 'Sale Invoice';

update public.sales_orders
   set invoice_type = 'Sale Invoice'
 where invoice_type = 'Cash Bill'
   and status in ('draft','confirmed');
