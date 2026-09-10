create or replace function public.save_gate_pass_weighbridge_settings(
  p_mode text,
  p_fixed_tolerance_kg numeric,
  p_percentage_tolerance numeric
) returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_unit uuid := public.current_business_unit_id();
  v_settings jsonb;
begin
  perform public.assert_module_permission('settings','edit');
  if v_unit is null then raise exception 'No active business unit selected.'; end if;
  if p_mode not in ('fixed_only','percentage_only','greater_of_both') then raise exception 'Invalid tolerance mode.'; end if;
  if coalesce(p_fixed_tolerance_kg,0) < 0 or coalesce(p_fixed_tolerance_kg,0) > 1000 then raise exception 'Fixed tolerance must be between 0 and 1000 kg.'; end if;
  if coalesce(p_percentage_tolerance,0) < 0 or coalesce(p_percentage_tolerance,0) > 10 then raise exception 'Percentage tolerance must be between 0 and 10 percent.'; end if;

  update public.business_units
  set settings = jsonb_set(
    coalesce(settings,'{}'::jsonb),
    '{gate_pass_weighbridge}',
    jsonb_build_object(
      'tolerance_mode', p_mode,
      'fixed_tolerance_kg', coalesce(p_fixed_tolerance_kg,0),
      'percentage_tolerance', coalesce(p_percentage_tolerance,0)
    ),
    true
  ), updated_at=now()
  where id=v_unit and company_id=public.current_company_id()
  returning settings->'gate_pass_weighbridge' into v_settings;

  if v_settings is null then raise exception 'Active business unit not found.'; end if;
  return v_settings;
end $$;

grant execute on function public.save_gate_pass_weighbridge_settings(text,numeric,numeric) to authenticated;

create or replace function public.get_gate_pass_weighbridge_settings()
returns jsonb
language sql
stable
security definer
set search_path='public'
as $$
  select coalesce(
    (select settings->'gate_pass_weighbridge'
     from public.business_units
     where id=public.current_business_unit_id()
       and company_id=public.current_company_id()),
    jsonb_build_object('tolerance_mode','greater_of_both','fixed_tolerance_kg',1,'percentage_tolerance',0.5)
  );
$$;
grant execute on function public.get_gate_pass_weighbridge_settings() to authenticated;

create or replace function public.validate_gate_pass_final_weight_reconciliation()
returns trigger
language plpgsql
set search_path='public'
as $$
declare
  v_weight_kg numeric := 0;
  v_weight_lines integer := 0;
  v_non_weight_lines integer := 0;
  v_diff numeric := 0;
  v_mode text := 'greater_of_both';
  v_fixed numeric := 1;
  v_pct numeric := 0.5;
  v_allowed numeric := 1;
  v_cfg jsonb;
begin
  if new.status in ('weighed','finalized') and (tg_op='INSERT' or old.status is distinct from new.status or new.gross_weight is distinct from old.gross_weight or new.tare_weight is distinct from old.tare_weight) then
    select settings->'gate_pass_weighbridge' into v_cfg
    from public.business_units where id=new.business_unit_id;
    if v_cfg is not null then
      v_mode := coalesce(v_cfg->>'tolerance_mode','greater_of_both');
      v_fixed := greatest(coalesce((v_cfg->>'fixed_tolerance_kg')::numeric,1),0);
      v_pct := greatest(coalesce((v_cfg->>'percentage_tolerance')::numeric,0.5),0);
    end if;

    select
      coalesce(sum(case
        when lower(trim(coalesce(uom,''))) in ('kg','kgs','kilogram','kilograms') then actual_qty
        when lower(trim(coalesce(uom,''))) in ('ton','tons','tonne','tonnes','mt') then actual_qty*1000
        when lower(trim(coalesce(uom,''))) in ('g','gram','grams') then actual_qty/1000
        else 0 end),0),
      count(*) filter (where lower(trim(coalesce(uom,''))) in ('kg','kgs','kilogram','kilograms','ton','tons','tonne','tonnes','mt','g','gram','grams')),
      count(*) filter (where lower(trim(coalesce(uom,''))) not in ('kg','kgs','kilogram','kilograms','ton','tons','tonne','tonnes','mt','g','gram','grams'))
    into v_weight_kg,v_weight_lines,v_non_weight_lines
    from public.gate_pass_lines
    where gate_pass_id=new.id and coalesce(actual_qty,0)>0;

    if v_weight_lines=0 then
      raise exception 'Gate Pass requires at least one loaded line in a weight UOM (kg/ton/g).';
    end if;

    if v_non_weight_lines=0 then
      v_diff := abs(v_weight_kg-coalesce(new.net_weight,0));
      v_allowed := case v_mode
        when 'fixed_only' then v_fixed
        when 'percentage_only' then coalesce(new.net_weight,0)*v_pct/100
        else greatest(v_fixed,coalesce(new.net_weight,0)*v_pct/100)
      end;
      if v_diff > v_allowed then
        raise exception 'Loaded weight % kg does not reconcile with Kanta net % kg. Allowed tolerance is % kg (%).', round(v_weight_kg,3), round(coalesce(new.net_weight,0),3), round(v_allowed,3), v_mode;
      end if;
    end if;
  end if;
  return new;
end $$;