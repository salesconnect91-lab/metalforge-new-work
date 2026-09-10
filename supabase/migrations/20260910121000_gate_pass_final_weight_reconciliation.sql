create or replace function public.validate_gate_pass_final_weight_reconciliation()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_weight_kg numeric := 0;
  v_weight_lines integer := 0;
  v_non_weight_lines integer := 0;
  v_diff numeric := 0;
begin
  if new.status = 'finalized' and (tg_op = 'INSERT' or old.status is distinct from 'finalized') then
    select
      coalesce(sum(case
        when lower(trim(coalesce(uom,''))) in ('kg','kgs','kilogram','kilograms') then actual_qty
        when lower(trim(coalesce(uom,''))) in ('ton','tons','tonne','tonnes','mt') then actual_qty * 1000
        when lower(trim(coalesce(uom,''))) in ('g','gram','grams') then actual_qty / 1000
        else 0 end),0),
      count(*) filter (where lower(trim(coalesce(uom,''))) in ('kg','kgs','kilogram','kilograms','ton','tons','tonne','tonnes','mt','g','gram','grams')),
      count(*) filter (where lower(trim(coalesce(uom,''))) not in ('kg','kgs','kilogram','kilograms','ton','tons','tonne','tonnes','mt','g','gram','grams'))
    into v_weight_kg, v_weight_lines, v_non_weight_lines
    from public.gate_pass_lines
    where gate_pass_id = new.id and coalesce(actual_qty,0) > 0;

    if v_weight_lines = 0 then
      raise exception 'Final Gate Pass requires at least one loaded line in a weight UOM (kg/ton/g)';
    end if;

    if v_non_weight_lines = 0 then
      v_diff := abs(v_weight_kg - coalesce(new.net_weight,0));
      if v_diff > greatest(0.5, coalesce(new.net_weight,0) * 0.001) then
        raise exception 'Loaded weight % kg does not reconcile with Kanta net weight % kg. Correct Loading or Kanta before Final GP.', round(v_weight_kg,3), round(coalesce(new.net_weight,0),3);
      end if;
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_validate_gate_pass_final_weight_reconciliation on public.gate_passes;
create trigger trg_validate_gate_pass_final_weight_reconciliation
before insert or update of status on public.gate_passes
for each row execute function public.validate_gate_pass_final_weight_reconciliation();
