alter table public.gate_passes add column if not exists tare_weighed_at timestamptz, add column if not exists tare_weighbridge_reference text, add column if not exists gross_weighed_at timestamptz, add column if not exists gross_weighbridge_reference text;

alter table public.gate_passes drop constraint if exists gate_passes_status_check;
alter table public.gate_passes add constraint gate_passes_status_check check (status = any(array['issued'::text,'tare_weighed'::text,'loading'::text,'weighed'::text,'finalized'::text,'cancelled'::text]));

create or replace function public.enforce_gate_pass_workflow() returns trigger language plpgsql set search_path='public' as $$
begin
  if coalesce(new.tare_weight,0) < 0 or coalesce(new.gross_weight,0) < 0 then raise exception 'Weights cannot be negative'; end if;
  if coalesce(new.gross_weight,0) > 0 and new.gross_weight < coalesce(new.tare_weight,0) then raise exception 'Gross weight cannot be less than tare weight'; end if;
  new.net_weight := greatest(coalesce(new.gross_weight,0)-coalesce(new.tare_weight,0),0);
  new.order_book_header_id := null; new.sales_order_id := null;
  if tg_op='UPDATE' and old.status not in ('issued','tare_weighed') and (new.customer_id is distinct from old.customer_id or new.customer_name is distinct from old.customer_name or new.vehicle_no is distinct from old.vehicle_no or new.driver_name is distinct from old.driver_name or new.token_notes is distinct from old.token_notes or new.pass_date is distinct from old.pass_date) then raise exception 'Loading Token is locked after loading starts'; end if;
  if tg_op='UPDATE' and old.status='finalized' and new.status <> 'finalized' then raise exception 'Final Gate Pass is locked'; end if;
  if new.status='tare_weighed' then if coalesce(new.tare_weight,0)<=0 then raise exception 'First weighbridge requires valid tare weight'; end if; if tg_op='INSERT' or old.status is distinct from 'tare_weighed' then new.tare_weighed_at:=coalesce(new.tare_weighed_at,now()); end if; end if;
  if new.status='weighed' then if coalesce(new.tare_weight,0)<=0 or coalesce(new.gross_weight,0)<=new.tare_weight then raise exception 'Second weighbridge requires valid tare and gross weight'; end if; if tg_op='INSERT' or old.status is distinct from 'weighed' then new.gross_weighed_at:=coalesce(new.gross_weighed_at,now()); end if; end if;
  if new.status='finalized' then if coalesce(new.customer_name,'')='' then raise exception 'Customer is required'; end if; if coalesce(new.vehicle_no,'')='' then raise exception 'Vehicle number is required'; end if; if coalesce(new.tare_weight,0)<=0 or coalesce(new.gross_weight,0)<=0 or new.net_weight<=0 then raise exception 'Final Gate Pass requires valid tare, gross and net weight'; end if; if tg_op='INSERT' or old.status is distinct from 'finalized' then new.finalized_at:=now(); new.finalized_by:=auth.uid(); end if; end if;
  return new;
end $$;
