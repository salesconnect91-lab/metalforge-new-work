-- NAVILO modular business-line foundation.
-- Company-level subscription modules are the commercial entitlement layer;
-- business_unit_modules remains the workspace/service layer.

alter table public.company_modules
  drop constraint if exists company_modules_module_key_check;

alter table public.company_modules
  add constraint company_modules_module_key_check
  check (module_key = any (array[
    'dashboard'::text,
    'master'::text,
    'sales'::text,
    'purchase'::text,
    'inventory'::text,
    'production'::text,
    'transport'::text,
    'accounting'::text,
    'reports'::text,
    'settings'::text
  ]));

-- Preserve legacy behavior while making company entitlements explicit.
insert into public.company_modules(company_id,module_key,enabled,updated_at)
select c.id,m.module_key,true,now()
from public.companies c
cross join (values
  ('dashboard'),('master'),('sales'),('purchase'),('inventory'),
  ('accounting'),('reports'),('settings')
) as m(module_key)
on conflict (company_id,module_key) do nothing;

-- New business lines are opt-in, never silently licensed.
insert into public.company_modules(company_id,module_key,enabled,updated_at)
select c.id,'transport',false,now()
from public.companies c
on conflict (company_id,module_key) do nothing;

insert into public.company_modules(company_id,module_key,enabled,updated_at)
select c.id,'production',true,now()
from public.companies c
on conflict (company_id,module_key) do nothing;
