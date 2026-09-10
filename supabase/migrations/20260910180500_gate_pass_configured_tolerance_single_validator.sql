-- Gate Pass tolerance must follow the active business-unit setting, not a hard-coded 1 kg rule.
-- Remove the duplicate legacy validator and centralize tolerance calculation.

drop trigger if exists trg_validate_gate_pass_final_weight_reconciliation on public.gate_passes;
drop function if exists public.validate_gate_pass_final_weight_reconciliation();

create or replace function public.gate_pass_allowed_tolerance_kg(p_business_unit_id uuid, p_company_id uuid, p_net_weight numeric)
returns numeric
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_cfg jsonb := '{}'::jsonb;
  v_mode text := 'greater_of_both';
  v_fixed numeric := 1;
  v_pct numeric := 0.5;
begin
  select coalesce(settings->'gate_pass_weighbridge','{}'::jsonb)
    into v_cfg
  from public.business_units
  where id=p_business_unit_id and company_id=p_company_id;

  v_mode := coalesce(nullif(v_cfg->>'tolerance_mode',''),'greater_of_both');
  v_fixed := greatest(coalesce(nullif(v_cfg->>'fixed_tolerance_kg','')::numeric,1),0);
  v_pct := greatest(coalesce(nullif(v_cfg->>'percentage_tolerance','')::numeric,0.5),0);

  return case v_mode
    when 'fixed_only' then v_fixed
    when 'percentage_only' then coalesce(p_net_weight,0)*v_pct/100
    else greatest(v_fixed,coalesce(p_net_weight,0)*v_pct/100)
  end;
end
$function$;

revoke all on function public.gate_pass_allowed_tolerance_kg(uuid,uuid,numeric) from public, anon;
grant execute on function public.gate_pass_allowed_tolerance_kg(uuid,uuid,numeric) to authenticated, service_role;

create or replace function public.enforce_gate_pass_workflow()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_reopen text := current_setting('app.gate_pass_reopen', true);
  v_loaded_kg numeric := 0;
  v_unknown_units integer := 0;
  v_tolerance numeric := 0;
begin
  if coalesce(new.tare_weight,0) < 0 or coalesce(new.gross_weight,0) < 0 then raise exception 'Weights cannot be negative'; end if;
  if tg_op='UPDATE' and new.tare_weight is distinct from old.tare_weight and coalesce(new.gross_weight,0)>0 and new.gross_weight<=coalesce(new.tare_weight,0) then
    new.gross_weight:=0; new.gross_weighbridge_reference:=null; new.weighbridge_reference:=null; new.gross_weighed_at:=null; new.weighed_at:=null;
    if old.status='weighed' then new.status:=case when old.loading_completed_at is not null then 'loading' else 'tare_weighed' end; end if;
  end if;
  if coalesce(new.gross_weight,0)>0 and new.gross_weight<=coalesce(new.tare_weight,0) then raise exception '2nd Kanta gross weight must be greater than 1st Kanta tare weight'; end if;
  new.net_weight:=greatest(coalesce(new.gross_weight,0)-coalesce(new.tare_weight,0),0); new.order_book_header_id:=null; new.sales_order_id:=null;
  if tg_op='UPDATE' and old.status='finalized' then
    if coalesce(v_reopen,'')<>'on' then
      if new.status<>'finalized' or new.customer_id is distinct from old.customer_id or new.customer_name is distinct from old.customer_name or new.vehicle_no is distinct from old.vehicle_no or new.driver_name is distinct from old.driver_name or new.token_notes is distinct from old.token_notes or new.pass_date is distinct from old.pass_date or new.tare_weight is distinct from old.tare_weight or new.gross_weight is distinct from old.gross_weight or new.loaded_by_loader_id is distinct from old.loaded_by_loader_id or new.loaded_by_name is distinct from old.loaded_by_name then raise exception 'Final Gate Pass is locked. Use Reopen for Correction.'; end if;
    else
      if new.status<>'weighed' then raise exception 'Reopened Final Gate Pass must return to 2nd Kanta Done stage'; end if;
      if coalesce(trim(new.correction_reason),'')='' then raise exception 'Correction reason is required'; end if;
    end if;
  end if;
  if new.status in ('weighed','finalized') then
    select coalesce(sum(case lower(trim(coalesce(uom,''))) when 'kg' then actual_qty when 'kgs' then actual_qty when 'kilogram' then actual_qty when 'kilograms' then actual_qty when 'ton' then actual_qty*1000 when 'tons' then actual_qty*1000 when 'tonne' then actual_qty*1000 when 'tonnes' then actual_qty*1000 when 'mt' then actual_qty*1000 when 'g' then actual_qty/1000 when 'gram' then actual_qty/1000 when 'grams' then actual_qty/1000 else 0 end),0), count(*) filter(where lower(trim(coalesce(uom,''))) not in ('kg','kgs','kilogram','kilograms','ton','tons','tonne','tonnes','mt','g','gram','grams')) into v_loaded_kg,v_unknown_units from public.gate_pass_lines where gate_pass_id=new.id and coalesce(actual_qty,0)>0;
    if v_unknown_units>0 then raise exception 'Gate Pass requires weight UOM (kg/ton/g) for every loaded line'; end if;
    if v_loaded_kg<=0 then raise exception 'Gate Pass requires actual loaded material quantity'; end if;
    v_tolerance:=public.gate_pass_allowed_tolerance_kg(new.business_unit_id,new.company_id,new.net_weight);
    if abs(v_loaded_kg-new.net_weight)>v_tolerance then raise exception 'Actual loaded weight (%) does not match Kanta net weight (%) within configured tolerance (%)',round(v_loaded_kg,3),round(new.net_weight,3),round(v_tolerance,3); end if;
  end if;
  if new.status='finalized' then
    if coalesce(new.customer_name,'')='' then raise exception 'Customer is required'; end if;
    if coalesce(new.vehicle_no,'')='' then raise exception 'Vehicle number is required'; end if;
    if coalesce(new.tare_weight,0)<=0 or coalesce(new.gross_weight,0)<=0 or new.net_weight<=0 then raise exception 'Final Gate Pass requires valid tare, gross and net weight'; end if;
    if tg_op='INSERT' or old.status is distinct from 'finalized' then new.finalized_at:=now(); new.finalized_by:=auth.uid(); end if;
  end if;
  return new;
end
$function$;
