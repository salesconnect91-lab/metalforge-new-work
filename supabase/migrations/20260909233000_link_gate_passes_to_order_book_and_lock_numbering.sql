alter table public.gate_passes
  add column if not exists order_book_header_id uuid null
  references public.order_book_headers(id) on delete set null;

create unique index if not exists gate_passes_company_bu_pass_no_uidx
  on public.gate_passes(company_id, business_unit_id, pass_no);

create or replace function public.assign_gate_pass_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next bigint;
begin
  perform pg_advisory_xact_lock(
    hashtext(coalesce(new.company_id::text, '') || ':' || coalesce(new.business_unit_id::text, '') || ':gate_pass')
  );

  select coalesce(max((regexp_match(pass_no, '^GP-([0-9]+)$'))[1]::bigint), 0) + 1
    into v_next
  from public.gate_passes
  where company_id = new.company_id
    and business_unit_id = new.business_unit_id
    and pass_no ~ '^GP-[0-9]+$';

  new.pass_no := 'GP-' || lpad(v_next::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_assign_gate_pass_number on public.gate_passes;
create trigger trg_assign_gate_pass_number
before insert on public.gate_passes
for each row execute function public.assign_gate_pass_number();
