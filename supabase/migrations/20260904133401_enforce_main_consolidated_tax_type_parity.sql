create or replace function public.enforce_main_consolidated_tax_type_parity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_main_type text;
  v_child_type text;
begin
  if tg_table_name = 'purchase_order_consolidated_invoices' then
    select po.invoice_type, ci.invoice_type
      into v_main_type, v_child_type
    from public.purchase_orders po
    join public.consolidated_purchase_invoices ci
      on ci.id = new.consolidated_invoice_id
    where po.id = new.purchase_order_id;

    if not found then
      raise exception 'Main Purchase Invoice or Consolidated Purchase Invoice was not found.';
    end if;

    if v_main_type is distinct from v_child_type then
      raise exception 'Invoice type mismatch: Main Purchase Invoice (%) can only include Consolidated Purchase Invoices of the same type (%).', v_main_type, v_main_type;
    end if;

  elsif tg_table_name = 'sales_order_hawala_invoices' then
    select so.invoice_type, hi.invoice_type
      into v_main_type, v_child_type
    from public.sales_orders so
    join public.consolidated_sales_invoices hi
      on hi.id = new.hawala_invoice_id
    where so.id = new.sales_order_id;

    if not found then
      raise exception 'Main Sales Invoice or Consolidated/Hawala Invoice was not found.';
    end if;

    if v_main_type is distinct from v_child_type then
      raise exception 'Invoice type mismatch: Main Sales Invoice (%) can only include Consolidated/Hawala Invoices of the same type (%).', v_main_type, v_main_type;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_purchase_consolidated_tax_type_parity on public.purchase_order_consolidated_invoices;
create trigger trg_purchase_consolidated_tax_type_parity
before insert or update of purchase_order_id, consolidated_invoice_id
on public.purchase_order_consolidated_invoices
for each row
execute function public.enforce_main_consolidated_tax_type_parity();

drop trigger if exists trg_sales_hawala_tax_type_parity on public.sales_order_hawala_invoices;
create trigger trg_sales_hawala_tax_type_parity
before insert or update of sales_order_id, hawala_invoice_id
on public.sales_order_hawala_invoices
for each row
execute function public.enforce_main_consolidated_tax_type_parity();
