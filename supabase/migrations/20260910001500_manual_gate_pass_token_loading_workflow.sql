alter table public.gate_passes
  add column if not exists customer_id uuid references public.customers(id) on delete restrict,
  add column if not exists customer_name text,
  add column if not exists token_notes text,
  add column if not exists loaded_by_name text,
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid references auth.users(id) on delete set null;

alter table public.gate_passes alter column godown drop not null;
alter table public.gate_passes alter column godown drop default;

create table if not exists public.gate_pass_lines (
  id uuid primary key default gen_random_uuid(),
  gate_pass_id uuid not null references public.gate_passes(id) on delete cascade,
  company_id uuid not null default public.current_company_id(),
  business_unit_id uuid not null default public.current_business_unit_id(),
  item_id uuid references public.items(id) on delete restrict,
  item_description text not null,
  requested_qty numeric not null default 0 check (requested_qty >= 0),
  actual_qty numeric not null default 0 check (actual_qty >= 0),
  uom text not null default 'kg',
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  godown_id uuid references public.godowns(id) on delete restrict,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gate_pass_lines_gate_pass_idx on public.gate_pass_lines(gate_pass_id);
create index if not exists gate_pass_lines_tenant_idx on public.gate_pass_lines(company_id,business_unit_id);
alter table public.gate_pass_lines enable row level security;
drop policy if exists gate_pass_lines_select on public.gate_pass_lines;
create policy gate_pass_lines_select on public.gate_pass_lines for select to authenticated using (company_id=public.current_company_id() and business_unit_id=public.current_business_unit_id());
drop policy if exists gate_pass_lines_insert on public.gate_pass_lines;
create policy gate_pass_lines_insert on public.gate_pass_lines for insert to authenticated with check (company_id=public.current_company_id() and business_unit_id=public.current_business_unit_id());
drop policy if exists gate_pass_lines_update on public.gate_pass_lines;
create policy gate_pass_lines_update on public.gate_pass_lines for update to authenticated using (company_id=public.current_company_id() and business_unit_id=public.current_business_unit_id()) with check (company_id=public.current_company_id() and business_unit_id=public.current_business_unit_id());
drop policy if exists gate_pass_lines_delete on public.gate_pass_lines;
create policy gate_pass_lines_delete on public.gate_pass_lines for delete to authenticated using (company_id=public.current_company_id() and business_unit_id=public.current_business_unit_id());
grant select,insert,update,delete on public.gate_pass_lines to authenticated;
alter table public.gate_passes drop constraint if exists gate_passes_status_check;
alter table public.gate_passes add constraint gate_passes_status_check check (status in ('issued','loading','weighed','finalized','cancelled'));
create or replace function public.enforce_gate_pass_workflow() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if coalesce(new.tare_weight,0)<0 or coalesce(new.gross_weight,0)<0 then raise exception 'Weights cannot be negative'; end if;
 if coalesce(new.gross_weight,0)>0 and new.gross_weight<coalesce(new.tare_weight,0) then raise exception 'Gross weight cannot be less than tare weight'; end if;
 new.net_weight:=greatest(coalesce(new.gross_weight,0)-coalesce(new.tare_weight,0),0);
 new.order_book_header_id:=null; new.sales_order_id:=null;
 if tg_op='UPDATE' and old.status='finalized' and new.status<>'finalized' then raise exception 'Final Gate Pass is locked'; end if;
 if tg_op='UPDATE' and old.status='finalized' and (new.customer_id is distinct from old.customer_id or new.vehicle_no is distinct from old.vehicle_no or new.tare_weight is distinct from old.tare_weight or new.gross_weight is distinct from old.gross_weight) then raise exception 'Final Gate Pass is locked'; end if;
 if new.status='finalized' then
  if coalesce(new.customer_name,'')='' then raise exception 'Customer is required'; end if;
  if coalesce(new.vehicle_no,'')='' then raise exception 'Vehicle number is required'; end if;
  if coalesce(new.tare_weight,0)<=0 or coalesce(new.gross_weight,0)<=0 or new.net_weight<=0 then raise exception 'Final Gate Pass requires valid tare, gross and net weight'; end if;
  if tg_op='INSERT' or old.status is distinct from 'finalized' then new.finalized_at:=now(); new.finalized_by:=auth.uid(); end if;
 end if;
 return new;
end $$;
drop trigger if exists trg_enforce_gate_pass_workflow on public.gate_passes;
create trigger trg_enforce_gate_pass_workflow before insert or update on public.gate_passes for each row execute function public.enforce_gate_pass_workflow();