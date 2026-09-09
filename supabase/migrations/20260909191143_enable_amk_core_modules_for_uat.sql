-- Enable the licensed core Steel ERP modules for the AMK UAT company.
-- Transport remains disabled because it is a separate optional business-line module.
update public.company_modules cm
set enabled = true,
    updated_at = now()
from public.companies c
where c.id = cm.company_id
  and c.code = 'AMK'
  and cm.module_key in (
    'dashboard',
    'master',
    'sales',
    'purchase',
    'inventory',
    'production',
    'accounting',
    'reports',
    'settings'
  );
