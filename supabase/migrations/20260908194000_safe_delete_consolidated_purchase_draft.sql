create or replace function public.delete_consolidated_purchase_draft(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.consolidated_purchase_invoices%rowtype;
  v_linked_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_invoice
  from public.consolidated_purchase_invoices
  where id = p_invoice_id
    and company_id = public.current_company_id()
    and business_unit_id = public.current_business_unit_id()
  for update;

  if not found then
    raise exception 'Consolidated Purchase Invoice not found in active business unit.';
  end if;

  if v_invoice.status <> 'draft' then
    raise exception 'Only draft Consolidated Purchase Invoices can be deleted.';
  end if;

  if not public.has_module_permission(v_invoice.company_id, 'purchase', 'delete')
     and not public.has_module_permission(v_invoice.company_id, 'purchase', 'edit') then
    raise exception 'Purchase delete/edit permission is required.';
  end if;

  select count(*) into v_linked_count
  from public.purchase_order_consolidated_invoices
  where consolidated_invoice_id = p_invoice_id;

  if v_linked_count > 0 then
    raise exception 'This Consolidated Purchase Invoice is linked to a Main Purchase Invoice. Remove that link first.';
  end if;

  delete from public.consolidated_purchase_invoices where id = p_invoice_id;
end;
$$;

revoke all on function public.delete_consolidated_purchase_draft(uuid) from public;
grant execute on function public.delete_consolidated_purchase_draft(uuid) to authenticated;
