create or replace function public.enforce_gate_pass_workflow()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if coalesce(new.tare_weight,0) < 0 or coalesce(new.gross_weight,0) < 0 then raise exception 'Weights cannot be negative'; end if;
  if coalesce(new.gross_weight,0) > 0 and new.gross_weight < coalesce(new.tare_weight,0) then raise exception 'Gross weight cannot be less than tare weight'; end if;
  new.net_weight := greatest(coalesce(new.gross_weight,0)-coalesce(new.tare_weight,0),0);
  new.order_book_header_id := null;
  new.sales_order_id := null;

  if tg_op='UPDATE' and old.status <> 'issued' and (
    new.customer_id is distinct from old.customer_id or
    new.customer_name is distinct from old.customer_name or
    new.vehicle_no is distinct from old.vehicle_no or
    new.driver_name is distinct from old.driver_name or
    new.token_notes is distinct from old.token_notes or
    new.pass_date is distinct from old.pass_date
  ) then
    raise exception 'Loading Token is locked after loading starts';
  end if;

  if tg_op='UPDATE' and old.status='finalized' and new.status <> 'finalized' then raise exception 'Final Gate Pass is locked'; end if;
  if tg_op='UPDATE' and old.status='finalized' and (new.customer_id is distinct from old.customer_id or new.vehicle_no is distinct from old.vehicle_no or new.tare_weight is distinct from old.tare_weight or new.gross_weight is distinct from old.gross_weight) then raise exception 'Final Gate Pass is locked'; end if;
  if new.status='finalized' then
    if coalesce(new.customer_name,'')='' then raise exception 'Customer is required'; end if;
    if coalesce(new.vehicle_no,'')='' then raise exception 'Vehicle number is required'; end if;
    if coalesce(new.tare_weight,0)<=0 or coalesce(new.gross_weight,0)<=0 or new.net_weight<=0 then raise exception 'Final Gate Pass requires valid tare, gross and net weight'; end if;
    if tg_op='INSERT' or old.status is distinct from 'finalized' then new.finalized_at:=now(); new.finalized_by:=auth.uid(); end if;
  end if;
  return new;
end $function$;

create or replace function public.guard_gate_pass_line_token_fields()
returns trigger
language plpgsql
security definer
set search_path='public'
as $function$
declare v_status text; v_gate_pass_id uuid;
begin
  v_gate_pass_id := case when tg_op='DELETE' then old.gate_pass_id else new.gate_pass_id end;
  select status into v_status from public.gate_passes where id=v_gate_pass_id;
  if v_status is null then raise exception 'Gate Pass not found'; end if;

  if tg_op='INSERT' and v_status <> 'issued' then
    if not (v_status='loading' and coalesce(new.requested_qty,0)=0 and coalesce(new.actual_qty,0)>0) then
      raise exception 'Token material cannot be added after loading starts';
    end if;
  elsif tg_op='DELETE' and v_status <> 'issued' then
    raise exception 'Token material cannot be deleted after loading starts';
  elsif tg_op='UPDATE' and v_status <> 'issued' and (
    new.item_id is distinct from old.item_id or
    new.item_description is distinct from old.item_description or
    new.requested_qty is distinct from old.requested_qty or
    new.uom is distinct from old.uom
  ) then
    raise exception 'Original token material is locked after loading starts';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $function$;

drop trigger if exists trg_guard_gate_pass_line_token_fields on public.gate_pass_lines;
create trigger trg_guard_gate_pass_line_token_fields
before insert or update or delete on public.gate_pass_lines
for each row execute function public.guard_gate_pass_line_token_fields();

revoke execute on function public.guard_gate_pass_line_token_fields() from public, anon, authenticated;
grant execute on function public.guard_gate_pass_line_token_fields() to service_role;
