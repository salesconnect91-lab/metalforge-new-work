create or replace function public.enforce_gate_pass_workflow()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if coalesce(new.tare_weight,0) < 0 or coalesce(new.gross_weight,0) < 0 then
    raise exception 'Weights cannot be negative';
  end if;

  if coalesce(new.gross_weight,0) > 0 and new.gross_weight < coalesce(new.tare_weight,0) then
    raise exception 'Gross weight cannot be less than tare weight';
  end if;

  new.net_weight := greatest(coalesce(new.gross_weight,0)-coalesce(new.tare_weight,0),0);
  new.order_book_header_id := null;
  new.sales_order_id := null;

  if tg_op='UPDATE' and old.status='finalized' then
    if new.status <> 'finalized'
       or new.customer_id is distinct from old.customer_id
       or new.customer_name is distinct from old.customer_name
       or new.vehicle_no is distinct from old.vehicle_no
       or new.driver_name is distinct from old.driver_name
       or new.token_notes is distinct from old.token_notes
       or new.pass_date is distinct from old.pass_date
       or new.tare_weight is distinct from old.tare_weight
       or new.gross_weight is distinct from old.gross_weight
       or new.loaded_by_loader_id is distinct from old.loaded_by_loader_id
       or new.loaded_by_name is distinct from old.loaded_by_name then
      raise exception 'Final Gate Pass is locked';
    end if;
  end if;

  if new.status='finalized' then
    if coalesce(new.customer_name,'')='' then raise exception 'Customer is required'; end if;
    if coalesce(new.vehicle_no,'')='' then raise exception 'Vehicle number is required'; end if;
    if coalesce(new.tare_weight,0)<=0 or coalesce(new.gross_weight,0)<=0 or new.net_weight<=0 then
      raise exception 'Final Gate Pass requires valid tare, gross and net weight';
    end if;
    if tg_op='INSERT' or old.status is distinct from 'finalized' then
      new.finalized_at:=now();
      new.finalized_by:=auth.uid();
    end if;
  end if;

  return new;
end
$function$;
