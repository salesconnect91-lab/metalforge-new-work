-- Platform Owner legacy Sales/Purchase Order Book migration.
-- Imports commitments only; deliberately bypasses transaction/accounting posting.

create or replace function public.order_book_stamp_context()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare
  v_company uuid:=public.current_company_id();
  v_bu uuid:=public.current_business_unit_id();
  v_user uuid:=public.legacy_data_user_id();
  v_row jsonb;
begin
  if coalesce(current_setting('app.platform_order_import', true),'0')='1' then return new; end if;
  if v_company is null then raise exception 'No active company selected.'; end if;
  if v_bu is null then raise exception 'No active business unit selected.'; end if;
  if v_user is null then raise exception 'Authentication required.'; end if;
  v_row := to_jsonb(new);
  if coalesce(v_row->>'company_id','') = '' then v_row := jsonb_set(v_row,'{company_id}',to_jsonb(v_company),true);
  elsif (v_row->>'company_id')::uuid <> v_company then raise exception 'Cross-company write denied.'; end if;
  if coalesce(v_row->>'business_unit_id','') = '' then v_row := jsonb_set(v_row,'{business_unit_id}',to_jsonb(v_bu),true);
  elsif (v_row->>'business_unit_id')::uuid <> v_bu then raise exception 'Cross-business-unit write denied.'; end if;
  if v_row ? 'user_id' then v_row := jsonb_set(v_row,'{user_id}',to_jsonb(v_user),true); end if;
  new := jsonb_populate_record(new,v_row);
  return new;
end
$$;

create or replace function public.platform_import_order_book(
  p_company_id uuid,
  p_business_unit_id uuid,
  p_operating_location_id uuid,
  p_order_type text,
  p_rows jsonb,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $fn$
declare
  v_data_user uuid; v_order_no text; v_first jsonb; v_row jsonb; v_order_id uuid; v_party_id uuid; v_party_name text;
  v_salesperson_id uuid; v_salesperson_name text; v_item_id uuid; v_item_name text; v_order_date date; v_qty numeric;
  v_fulfilled numeric; v_cancelled numeric; v_rate numeric; v_rate_status text; v_commit_status text; v_header_status text;
  v_line_count int; v_imported_orders int:=0; v_imported_lines int:=0; v_has_pending boolean; v_has_partial boolean; v_all_closed boolean;
begin
  if coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' and not public.is_platform_owner() then raise exception 'Platform Owner access required.'; end if;
  if p_actor_id is distinct from auth.uid() and coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role' then raise exception 'Actor mismatch.'; end if;
  if p_order_type not in ('sales','purchase') then raise exception 'Order type must be sales or purchase.'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'Order Book rows are required.'; end if;
  if not exists(select 1 from public.companies where id=p_company_id) then raise exception 'Company not found.'; end if;
  if not exists(select 1 from public.business_units where id=p_business_unit_id and company_id=p_company_id and is_active) then raise exception 'Active business unit not found for company.'; end if;
  if p_operating_location_id is not null and not exists(select 1 from public.operating_locations where id=p_operating_location_id and company_id=p_company_id and business_unit_id=p_business_unit_id and is_active) then raise exception 'Invalid or inactive operating location.'; end if;
  v_data_user:=coalesce(public.company_legacy_owner_id(p_company_id),p_actor_id);
  if v_data_user is null then raise exception 'No data owner available for company.'; end if;
  perform set_config('app.platform_order_import','1',true);
  perform set_config('app.maintenance_reset','1',true);

  for v_order_no in select distinct trim(value->>'order_no') from jsonb_array_elements(p_rows) loop
    if coalesce(v_order_no,'')='' then raise exception 'Order No is required on every row.'; end if;
    if exists(select 1 from public.order_book_headers where company_id=p_company_id and business_unit_id=p_business_unit_id and order_type=p_order_type and lower(order_no)=lower(v_order_no)) then raise exception 'Order % already exists in this business unit.',v_order_no; end if;
    select value into v_first from jsonb_array_elements(p_rows) where trim(value->>'order_no')=v_order_no limit 1;
    begin v_order_date:=coalesce(nullif(v_first->>'order_date','')::date,current_date); exception when others then raise exception 'Invalid Order Date for %.',v_order_no; end;
    v_party_name:=trim(coalesce(v_first->>'party_name',''));
    if v_party_name='' then raise exception 'Party Name is required for order %.',v_order_no; end if;

    if p_order_type='sales' then
      select id,name into v_party_id,v_party_name from public.customers where company_id=p_company_id and is_active and lower(trim(name))=lower(v_party_name) order by created_at limit 1;
      if v_party_id is null then raise exception 'Customer "%" not found for order %.',trim(v_first->>'party_name'),v_order_no; end if;
      v_salesperson_name:=trim(coalesce(v_first->>'salesperson_name',''));
      if v_salesperson_name='' then raise exception 'Salesperson is required for sales order %.',v_order_no; end if;
      select id,name into v_salesperson_id,v_salesperson_name from public.employees where company_id=p_company_id and is_active and lower(trim(name))=lower(v_salesperson_name) order by created_at limit 1;
      if v_salesperson_id is null then raise exception 'Salesperson "%" not found for order %.',trim(v_first->>'salesperson_name'),v_order_no; end if;
    else
      select id,name into v_party_id,v_party_name from public.suppliers where company_id=p_company_id and is_active and lower(trim(name))=lower(v_party_name) order by created_at limit 1;
      if v_party_id is null then raise exception 'Supplier "%" not found for order %.',trim(v_first->>'party_name'),v_order_no; end if;
      v_salesperson_id:=null; v_salesperson_name:=null;
    end if;

    if exists(select 1 from jsonb_array_elements(p_rows) x where trim(x->>'order_no')=v_order_no and (
      lower(trim(coalesce(x->>'party_name','')))<>lower(trim(v_first->>'party_name')) or
      coalesce(x->>'order_date','')<>coalesce(v_first->>'order_date','') or
      (p_order_type='sales' and lower(trim(coalesce(x->>'salesperson_name','')))<>lower(trim(coalesce(v_first->>'salesperson_name','')))))) then
      raise exception 'Header values are inconsistent across lines of order %.',v_order_no;
    end if;

    v_has_pending:=false; v_has_partial:=false; v_all_closed:=true; v_line_count:=0;
    for v_row in select value from jsonb_array_elements(p_rows) where trim(value->>'order_no')=v_order_no loop
      v_item_name:=trim(coalesce(v_row->>'item_name',''));
      if v_item_name='' then raise exception 'Item Name is required for order %.',v_order_no; end if;
      select id,name into v_item_id,v_item_name from public.items where company_id=p_company_id and lower(trim(name))=lower(v_item_name) order by created_at limit 1;
      if v_item_id is null then raise exception 'Item "%" not found for order %.',trim(v_row->>'item_name'),v_order_no; end if;
      begin
        v_qty:=(v_row->>'ordered_qty')::numeric;
        v_fulfilled:=coalesce(nullif(v_row->>'fulfilled_qty','')::numeric,0);
        v_cancelled:=coalesce(nullif(v_row->>'cancelled_qty','')::numeric,0);
      exception when others then raise exception 'Invalid quantity on order %, item %.',v_order_no,v_item_name; end;
      if v_qty<=0 or v_fulfilled<0 or v_cancelled<0 or v_fulfilled+v_cancelled>v_qty then raise exception 'Quantities are invalid on order %, item %.',v_order_no,v_item_name; end if;
      v_rate_status:=lower(trim(coalesce(v_row->>'rate_status','pending')));
      if v_rate_status not in ('pending','agreed') then raise exception 'Rate Status must be pending or agreed on order %.',v_order_no; end if;
      if v_rate_status='agreed' then
        begin v_rate:=(v_row->>'agreed_rate')::numeric; exception when others then raise exception 'Invalid agreed rate on order %, item %.',v_order_no,v_item_name; end;
        if v_rate is null or v_rate<=0 then raise exception 'Positive agreed rate required on order %, item %.',v_order_no,v_item_name; end if;
      else v_rate:=null; v_has_pending:=true; end if;
      if v_cancelled=v_qty then v_commit_status:='cancelled';
      elsif v_fulfilled+v_cancelled=v_qty then v_commit_status:='completed';
      elsif v_fulfilled>0 then v_commit_status:='partially_fulfilled'; v_has_partial:=true; v_all_closed:=false;
      else v_commit_status:='open'; v_all_closed:=false; end if;
      v_line_count:=v_line_count+1;
    end loop;

    if v_line_count=0 then raise exception 'Order % has no lines.',v_order_no; end if;
    v_header_status:=case when v_all_closed then 'completed' when v_has_partial then 'partially_fulfilled' when v_has_pending then 'rate_pending' else 'confirmed' end;
    insert into public.order_book_headers(company_id,business_unit_id,operating_location_id,user_id,order_type,order_no,order_date,party_id,party_name,salesperson_id,salesperson_name,status,remarks,created_by,updated_by)
    values(p_company_id,p_business_unit_id,p_operating_location_id,v_data_user,p_order_type,v_order_no,v_order_date,v_party_id,v_party_name,v_salesperson_id,v_salesperson_name,v_header_status,nullif(trim(coalesce(v_first->>'order_remarks','')),''),p_actor_id,p_actor_id)
    returning id into v_order_id;

    for v_row in select value from jsonb_array_elements(p_rows) where trim(value->>'order_no')=v_order_no loop
      v_item_name:=trim(v_row->>'item_name');
      select id,name into v_item_id,v_item_name from public.items where company_id=p_company_id and lower(trim(name))=lower(v_item_name) order by created_at limit 1;
      v_qty:=(v_row->>'ordered_qty')::numeric;
      v_fulfilled:=coalesce(nullif(v_row->>'fulfilled_qty','')::numeric,0);
      v_cancelled:=coalesce(nullif(v_row->>'cancelled_qty','')::numeric,0);
      v_rate_status:=lower(trim(coalesce(v_row->>'rate_status','pending')));
      v_rate:=case when v_rate_status='agreed' then (v_row->>'agreed_rate')::numeric else null end;
      if v_cancelled=v_qty then v_commit_status:='cancelled'; elsif v_fulfilled+v_cancelled=v_qty then v_commit_status:='completed'; elsif v_fulfilled>0 then v_commit_status:='partially_fulfilled'; else v_commit_status:='open'; end if;
      insert into public.order_book_commitments(order_id,company_id,business_unit_id,operating_location_id,item_id,item_name,ordered_qty,fulfilled_qty,cancelled_qty,uom,rate_status,agreed_rate,effective_at,source,status,remarks,created_by,updated_by)
      values(v_order_id,p_company_id,p_business_unit_id,p_operating_location_id,v_item_id,v_item_name,v_qty,v_fulfilled,v_cancelled,nullif(trim(coalesce(v_row->>'uom','')),''),v_rate_status,v_rate,case when v_rate_status='agreed' then coalesce(nullif(v_row->>'effective_date','')::date,v_order_date)::timestamptz else null end,'order',v_commit_status,nullif(trim(coalesce(v_row->>'line_remarks','')),''),p_actor_id,p_actor_id);
      v_imported_lines:=v_imported_lines+1;
    end loop;
    v_imported_orders:=v_imported_orders+1;
  end loop;

  insert into public.platform_audit_logs(actor_user_id,company_id,action,target_type,target_id,details)
  values(p_actor_id,p_company_id,'order_book_migration','company',p_company_id,jsonb_build_object('order_type',p_order_type,'business_unit_id',p_business_unit_id,'operating_location_id',p_operating_location_id,'orders',v_imported_orders,'lines',v_imported_lines));
  return jsonb_build_object('success',true,'order_type',p_order_type,'orders_imported',v_imported_orders,'lines_imported',v_imported_lines);
end
$fn$;

revoke all on function public.platform_import_order_book(uuid,uuid,uuid,text,jsonb,uuid) from public, anon;
grant execute on function public.platform_import_order_book(uuid,uuid,uuid,text,jsonb,uuid) to authenticated, service_role;
