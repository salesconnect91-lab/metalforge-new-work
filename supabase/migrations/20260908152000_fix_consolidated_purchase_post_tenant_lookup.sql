create or replace function public.post_consolidated_purchase_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid:=public.legacy_data_user_id();
  v_company uuid:=public.current_company_id();
  v_bu uuid:=public.current_business_unit_id();
  v_inv public.consolidated_purchase_invoices%rowtype;
  v_subtotal numeric:=0; v_item_tax numeric:=0; v_charges numeric:=0; v_charge_tax numeric:=0; v_count int:=0; r record;
begin
  perform public.assert_module_permission('purchase','post');
  if auth.uid() is null or v_company is null or v_bu is null then raise exception 'Authentication, active company and business unit are required.'; end if;

  select * into v_inv
  from public.consolidated_purchase_invoices
  where id=p_invoice_id and company_id=v_company and business_unit_id=v_bu
  for update;
  if not found then raise exception 'Consolidated Purchase Invoice not found in active business unit.'; end if;
  if v_inv.status <> 'draft' then raise exception 'Only draft Consolidated Purchase Invoices can be posted.'; end if;
  if v_inv.supplier_id is null then raise exception 'Supplier is required.'; end if;
  if exists(select 1 from public.purchase_order_consolidated_invoices where consolidated_invoice_id=p_invoice_id and company_id=v_company and business_unit_id=v_bu) then raise exception 'This Consolidated Purchase Invoice is already attached to a Main Purchase Invoice.'; end if;

  for r in
    select l.*,g.warehouse_id
    from public.consolidated_purchase_invoice_lines l
    join public.godowns g on g.id=l.godown_id
    where l.invoice_id=p_invoice_id and l.company_id=v_company and l.business_unit_id=v_bu
    order by l.id
  loop
    v_count:=v_count+1;
    if r.warehouse_id is null then raise exception 'Selected Godown is not linked to a warehouse.'; end if;
    perform public.apply_stock_movement(r.item_id,r.warehouse_id,r.godown_id,'in',r.qty,v_inv.invoice_no);
    v_subtotal:=v_subtotal+round(r.qty*r.unit_cost,2);
    if v_inv.invoice_type='Tax Invoice' then v_item_tax:=v_item_tax+round(r.qty*r.unit_cost*coalesce(r.tax_percent,0)/100,2); end if;
  end loop;
  if v_count=0 then raise exception 'Add at least one item before posting.'; end if;

  select coalesce(sum(amount),0), coalesce(sum(case when v_inv.invoice_type='Tax Invoice' then amount*tax_percent/100 else 0 end),0)
  into v_charges,v_charge_tax
  from public.consolidated_purchase_invoice_charges
  where invoice_id=p_invoice_id and company_id=v_company and business_unit_id=v_bu;

  update public.consolidated_purchase_invoices
  set subtotal=round(v_subtotal,2), item_tax=round(v_item_tax,2), charges_total=round(v_charges,2), charge_tax=round(v_charge_tax,2),
      total=round(v_subtotal+v_item_tax+v_charges+v_charge_tax,2), status='posted', posted_at=now(), updated_at=now()
  where id=p_invoice_id and company_id=v_company and business_unit_id=v_bu;

  return jsonb_build_object('success',true,'invoice_id',p_invoice_id,'status','posted','stock_posted',true,'accounting_posted',false,'total',round(v_subtotal+v_item_tax+v_charges+v_charge_tax,2));
end
$function$;
