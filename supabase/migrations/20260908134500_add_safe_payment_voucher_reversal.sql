create or replace function public.reverse_payment_voucher(
  p_journal_entry_id uuid,
  p_reversal_date date,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_uid uuid := public.legacy_data_user_id();
  v_company uuid := public.current_company_id();
  v_bu uuid := public.current_business_unit_id();
  v_src public.journal_entries%rowtype;
  v_rev uuid;
  v_rev_no text;
  v_next bigint;
  v_total numeric := 0;
begin
  perform public.assert_module_permission('accounting','post');
  if v_uid is null or v_company is null or v_bu is null then raise exception 'Authentication and active company/business unit are required.'; end if;
  if p_journal_entry_id is null or p_reversal_date is null then raise exception 'Voucher and reversal date are required.'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Reversal reason is required.'; end if;
  select * into v_src from public.journal_entries where id=p_journal_entry_id and user_id=v_uid and company_id=v_company and business_unit_id=v_bu and status='posted' for update;
  if not found then raise exception 'Posted payment voucher was not found in the active business unit.'; end if;
  if v_src.trans_type not in ('Customer Receipt','Supplier Payment') then raise exception 'Only Customer Receipt or Supplier Payment vouchers can be reversed here.'; end if;
  if exists(select 1 from public.journal_entries je where je.user_id=v_uid and je.company_id=v_company and je.business_unit_id=v_bu and je.reversal_of_entry_id=v_src.id and je.status='posted') then raise exception 'This payment voucher has already been reversed.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_company::text||':'||v_bu::text||':payment_reversal_number',0));
  select coalesce(max(nullif(substring(entry_no from '^RV-([0-9]+)$'),'')::bigint),0)+1 into v_next from public.journal_entries where user_id=v_uid and company_id=v_company and business_unit_id=v_bu and entry_no~'^RV-[0-9]+$';
  v_rev_no:='RV-'||lpad(v_next::text,4,'0');
  insert into public.journal_entries(user_id,company_id,business_unit_id,entry_no,entry_date,description,status,payment_mode,party_name,trans_type,reversal_of_entry_id,reversal_reason,source_module,source_document_type,source_document_id)
  values(v_uid,v_company,v_bu,v_rev_no,p_reversal_date,'Reversal of '||v_src.entry_no||' - '||btrim(p_reason),'draft',v_src.payment_mode,v_src.party_name,case when v_src.trans_type='Customer Receipt' then 'Customer Receipt Reversal' else 'Supplier Payment Reversal' end,v_src.id,btrim(p_reason),'accounting','payment_reversal',v_src.id) returning id into v_rev;
  insert into public.journal_lines(user_id,company_id,business_unit_id,entry_id,account,account_id,debit,credit,party_name,party_type,party_id,operating_location_id,accounting_dimension_id,base_debit,base_credit)
  select v_uid,v_company,v_bu,v_rev,jl.account,jl.account_id,jl.credit,jl.debit,jl.party_name,jl.party_type,jl.party_id,jl.operating_location_id,jl.accounting_dimension_id,jl.base_credit,jl.base_debit
  from public.journal_lines jl where jl.entry_id=v_src.id and jl.user_id=v_uid and jl.company_id=v_company and jl.business_unit_id=v_bu;
  if not found then raise exception 'Original voucher has no journal lines to reverse.'; end if;
  select round(coalesce(sum(debit),0),2) into v_total from public.journal_lines where entry_id=v_rev;
  perform public.post_journal_entry(v_rev);
  if v_src.trans_type='Customer Receipt' then
    delete from public.invoice_payment_allocations where user_id=v_uid and company_id=v_company and business_unit_id=v_bu and journal_entry_id=v_src.id;
  else
    create temporary table if not exists tmp_navilo_reverse_purchase_orders(id uuid primary key) on commit drop;
    truncate table tmp_navilo_reverse_purchase_orders;
    insert into tmp_navilo_reverse_purchase_orders(id) select distinct purchase_order_id from public.purchase_payment_allocations where user_id=v_uid and company_id=v_company and business_unit_id=v_bu and journal_entry_id=v_src.id;
    delete from public.purchase_payment_allocations where user_id=v_uid and company_id=v_company and business_unit_id=v_bu and journal_entry_id=v_src.id;
    perform set_config('app.supplier_payment_update','1',true);
    update public.purchase_orders po
       set paid_amount=coalesce((select round(sum(a.amount),2) from public.purchase_payment_allocations a where a.user_id=v_uid and a.company_id=v_company and a.business_unit_id=v_bu and a.purchase_order_id=po.id),0),
           outstanding_amount=greatest(round(coalesce(po.total,0),2)-coalesce((select round(sum(a.amount),2) from public.purchase_payment_allocations a where a.user_id=v_uid and a.company_id=v_company and a.business_unit_id=v_bu and a.purchase_order_id=po.id),0),0),
           payment_status=case when greatest(round(coalesce(po.total,0),2)-coalesce((select round(sum(a.amount),2) from public.purchase_payment_allocations a where a.user_id=v_uid and a.company_id=v_company and a.business_unit_id=v_bu and a.purchase_order_id=po.id),0),0)<=0.005 then 'paid' when coalesce((select sum(a.amount) from public.purchase_payment_allocations a where a.user_id=v_uid and a.company_id=v_company and a.business_unit_id=v_bu and a.purchase_order_id=po.id),0)>0 then 'partial' else 'unpaid' end
     where po.id in (select id from tmp_navilo_reverse_purchase_orders) and po.user_id=v_uid and po.company_id=v_company and po.business_unit_id=v_bu and po.status='posted';
  end if;
  return jsonb_build_object('success',true,'reversal_entry_id',v_rev,'reversal_entry_no',v_rev_no,'original_entry_no',v_src.entry_no,'amount',v_total);
end;
$$;