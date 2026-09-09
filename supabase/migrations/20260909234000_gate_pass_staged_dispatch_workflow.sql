-- Gate Pass is an operational dispatch document, not an accounting posting document.
-- Final sales flow: Order Book -> GP issue -> loading -> weighment -> verification -> invoice.

alter table public.gate_passes drop constraint if exists gate_passes_status_check;
alter table public.gate_passes add constraint gate_passes_status_check
  check (status in ('issued','loading','awaiting_weighment','weighed','verified','partially_invoiced','invoiced','cancelled'));
alter table public.gate_passes alter column status set default 'issued';

alter table public.gate_passes add column if not exists loading_completed_at timestamptz;
alter table public.gate_passes add column if not exists weighed_at timestamptz;
alter table public.gate_passes add column if not exists verified_at timestamptz;
alter table public.gate_passes add column if not exists verified_by uuid references auth.users(id) on delete set null;
alter table public.gate_passes add column if not exists weighbridge_reference text;
alter table public.gate_passes add column if not exists correction_reason text;

update public.gate_passes set status='verified' where status='completed';
update public.gate_passes set status='issued' where status='pending';

create or replace function public.enforce_gate_pass_workflow()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.gross_weight < new.tare_weight then
    raise exception 'Gross weight cannot be less than tare weight';
  end if;
  new.net_weight := greatest(coalesce(new.gross_weight,0)-coalesce(new.tare_weight,0),0);

  if tg_op='UPDATE' and old.status in ('verified','partially_invoiced','invoiced') then
    if (new.order_book_header_id is distinct from old.order_book_header_id
        or new.godown_id is distinct from old.godown_id
        or new.warehouse_id is distinct from old.warehouse_id
        or new.vehicle_no is distinct from old.vehicle_no
        or new.tare_weight is distinct from old.tare_weight
        or new.gross_weight is distinct from old.gross_weight) then
      raise exception 'Verified/invoiced gate pass operational fields are locked';
    end if;
  end if;

  if new.status in ('weighed','verified','partially_invoiced','invoiced')
     and (new.gross_weight <= 0 or new.net_weight <= 0) then
    raise exception 'Valid weighbridge weights are required before this gate pass status';
  end if;

  if new.status in ('verified','partially_invoiced','invoiced')
     and new.order_book_header_id is null and new.type='loading' then
    raise exception 'Sales Order Book linkage is required before verification';
  end if;

  if new.status='verified' and old.status is distinct from 'verified' then
    new.verified_at := coalesce(new.verified_at,now());
    new.verified_by := coalesce(new.verified_by,auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_gate_pass_workflow on public.gate_passes;
create trigger trg_enforce_gate_pass_workflow
before insert or update on public.gate_passes
for each row execute function public.enforce_gate_pass_workflow();

create index if not exists gate_passes_invoice_eligibility_idx
  on public.gate_passes(company_id,business_unit_id,status,order_book_header_id);
