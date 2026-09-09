alter table public.gate_pass_loading_instructions
  add column if not exists name_en text,
  add column if not exists name_ur text,
  add column if not exists updated_at timestamptz not null default now();

update public.gate_pass_loading_instructions
set name_en = instruction
where name_en is null;

alter table public.gate_pass_loading_instructions
  alter column name_en set not null;

create unique index if not exists gate_pass_loading_instructions_tenant_name_uidx
  on public.gate_pass_loading_instructions(company_id,business_unit_id,lower(btrim(name_en)));

alter table public.gate_pass_loading_instructions enable row level security;
drop policy if exists gate_pass_loading_instructions_select on public.gate_pass_loading_instructions;
create policy gate_pass_loading_instructions_select on public.gate_pass_loading_instructions for select to authenticated
using (company_id=public.current_company_id() and business_unit_id=public.current_business_unit_id());
drop policy if exists gate_pass_loading_instructions_insert on public.gate_pass_loading_instructions;
create policy gate_pass_loading_instructions_insert on public.gate_pass_loading_instructions for insert to authenticated
with check (company_id=public.current_company_id() and business_unit_id=public.current_business_unit_id());
drop policy if exists gate_pass_loading_instructions_update on public.gate_pass_loading_instructions;
create policy gate_pass_loading_instructions_update on public.gate_pass_loading_instructions for update to authenticated
using (company_id=public.current_company_id() and business_unit_id=public.current_business_unit_id())
with check (company_id=public.current_company_id() and business_unit_id=public.current_business_unit_id());
grant select,insert,update on public.gate_pass_loading_instructions to authenticated;

revoke execute on function public.assign_gate_pass_number() from public, anon, authenticated;
grant execute on function public.assign_gate_pass_number() to service_role;