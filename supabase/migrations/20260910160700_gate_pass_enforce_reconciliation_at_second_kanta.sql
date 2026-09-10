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
  v_tolerance numeric := 0;
begin
  -- Reconcile as soon as the 2nd Kanta is saved, and again before Final GP.
  if new.status in ('weighed','finalized') then
    select
      coalesce(sum(case
        when lower(trim(coalesce(uom,''))) in ('kg','kgs','kilogram','kilograms') then actual_qty
        when lower(trim(coalesce(uom,''))) in ('ton','tons','tonne','tonnes','mt') then actual_qty * 1000
        when lower(trim(coalesce(uom,''))) in ('g','gram','grams') then actual_qty / 1000
        else 0 end),0),
      count(*) filter (where coalesce(actual_qty,0)>0 and lower(trim(coalesce(uom,''))) in ('kg','kgs','kilogram','kilograms','ton','tons','tonne','tonnes','mt','g','gram','grams')),
      count(*) filter (where coalesce(actual_qty,0)>0 and lower(trim(coalesce(uom,''))) not in ('kg','kgs','kilogram','kilograms','ton','tons','tonne','tonnes','mt','g','gram','grams'))
    into v_weight_kg, v_weight_lines, v_non_weight_lines
    from public.gate_pass_lines
    where gate_pass_id = new.id;

    if v_weight_lines = 0 then
      raise exception '2nd Kanta / Final GP requires at least one loaded line in a weight UOM (kg/ton/g)';
    end if;

    if v_non_weight_lines > 0 then
      raise exception 'Loaded material contains non-weight UOM lines. Use kg/ton/g before 2nd Kanta / Final GP.';
    end if;

    v_tolerance := greatest(1.0, coalesce(new.net_weight,0) * 0.005);
    v_diff := abs(v_weight_kg - coalesce(new.net_weight,0));

    if v_diff > v_tolerance then
      raise exception 'Actual Loaded % kg does not match Kanta Net % kg (difference % kg; allowed % kg). Correct Loading or Kanta before continuing.',
        round(v_weight_kg,3), round(coalesce(new.net_weight,0),3), round(v_diff,3), round(v_tolerance,3);
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_validate_gate_pass_final_weight_reconciliation on public.gate_passes;
create trigger trg_validate_gate_pass_final_weight_reconciliation
before insert or update of status, tare_weight, gross_weight on public.gate_passes
for each row execute function public.validate_gate_pass_final_weight_reconciliation();
