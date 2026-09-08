create or replace function public.get_available_consolidated_purchase_invoices_v2(p_supplier_id uuid default null, p_order_id uuid default null)
returns table(id uuid, invoice_no text, invoice_date date, supplier_id uuid, supplier_name text, reference_name text, reference_no text, reference_notes text, subtotal numeric, item_tax numeric, charges_total numeric, charge_tax numeric, total numeric, linked_purchase_order_id uuid, invoice_type text)
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare co uuid:=public.current_company_id(); bu uuid:=public.current_business_unit_id();
begin
  if auth.uid() is null or co is null or bu is null then raise exception 'Authentication, active company and business unit are required.'; end if;
  if not public.has_module_permission(co,'purchase','view') then raise exception 'Purchase view permission required.'; end if;
  return query
  select h.id,h.invoice_no,h.invoice_date,h.supplier_id,s.name,h.reference_name,h.reference_no,h.reference_notes,
         h.subtotal,h.item_tax,h.charges_total,h.charge_tax,h.total,l.purchase_order_id,h.invoice_type
  from public.consolidated_purchase_invoices h
  join public.suppliers s on s.id=h.supplier_id and s.company_id=co
  left join public.purchase_order_consolidated_invoices l
    on l.consolidated_invoice_id=h.id and l.company_id=co and l.business_unit_id=bu
  where h.company_id=co and h.business_unit_id=bu and h.status='posted'
    and (p_supplier_id is null or h.supplier_id=p_supplier_id)
    and (l.id is null or (p_order_id is not null and l.purchase_order_id=p_order_id))
  order by h.invoice_date desc,h.invoice_no desc;
end
$function$;
