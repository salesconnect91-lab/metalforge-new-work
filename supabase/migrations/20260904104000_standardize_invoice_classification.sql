begin;

-- Invoice type describes tax treatment only. Settlement is a separate event:
-- sales invoices always create receivables and customer receipts clear them.
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
  v_context := case
    when tg_table_name = 'purchase_orders' then 'purchase'
    else 'sales'
  end;

  if tg_table_name = 'purchase_orders' then
    if new.invoice_type not in ('Purchase Invoice', 'Tax Invoice') then
      raise exception 'Purchase type must be Without Tax or With Tax.';
    end if;
  else
    if new.invoice_type not in ('Cash Bill', 'Tax Invoice') then
      raise exception 'Invoice type must be Without Tax or With Tax.';
    end if;
  end if;

  if tg_table_name = 'sales_orders' then
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

drop trigger if exists trg_standardize_sales_invoice_classification
  on public.sales_orders;
create trigger trg_standardize_sales_invoice_classification
before insert or update of invoice_type, payment_mode, tax_percent
on public.sales_orders
for each row execute function public.standardize_invoice_classification();

drop trigger if exists trg_standardize_purchase_invoice_classification
  on public.purchase_orders;
create trigger trg_standardize_purchase_invoice_classification
before insert or update of invoice_type, tax_percent
on public.purchase_orders
for each row execute function public.standardize_invoice_classification();

drop trigger if exists trg_standardize_consolidated_invoice_classification
  on public.consolidated_sales_invoices;
create trigger trg_standardize_consolidated_invoice_classification
before insert or update of invoice_type, tax_percent
on public.consolidated_sales_invoices
for each row execute function public.standardize_invoice_classification();

revoke all on function public.standardize_invoice_classification()
from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
