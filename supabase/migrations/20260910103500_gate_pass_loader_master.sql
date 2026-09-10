create table if not exists public.gate_pass_loaders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id(),
  business_unit_id uuid not null default public.current_business_unit_id(),
  name_en text not null,
  name_ur text,
  phone text,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists gate_pass_loaders_tenant_name_uidx
  on public.gate_pass_loaders(company_id,business_unit_id,lower(btrim(name_en)));

alter table public.gate_pass_loaders enable row level security;

drop policy if exists gate_pass_loaders_select on public.gate_pass_loaders;
create policy gate_pass_loaders_select on public.gate_pass_loaders
for select to authenticated
using (company_id=public.current_company_id() and business_unit_id=public.current_business_unit_id());

drop policy if exists gate_pass_loaders_insert on public.gate_pass_loaders;
create policy gate_pass_loaders_insert on public.gate_pass_loaders
for insert to authenticated
with check (company_id=public.current_company_id() and business_unit_id=public.current_business_unit_id());

drop policy if exists gate_pass_loaders_update on public.gate_pass_loaders;
create policy gate_pass_loaders_update on public.gate_pass_loaders
for update to authenticated
using (company_id=public.current_company_id() and business_unit_id=public.current_business_unit_id())
with check (company_id=public.current_company_id() and business_unit_id=public.current_business_unit_id());

grant select,insert,update on public.gate_pass_loaders to authenticated;

alter table public.gate_passes add column if not exists loaded_by_loader_id uuid;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname='gate_passes_loaded_by_loader_id_fkey'
  ) then
    alter table public.gate_passes
      add constraint gate_passes_loaded_by_loader_id_fkey
      foreign key (loaded_by_loader_id) references public.gate_pass_loaders(id);
  end if;
end $$;
