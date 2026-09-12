set local app.maintenance_reset = '1';

-- Normalize canonical account-mapping keys used by the current UI while preserving
-- legacy aliases still referenced by older posting functions.
insert into public.account_mappings (user_id, company_id, mapping_key, account_id)
select am.user_id, am.company_id, 'salaries', am.account_id
from public.account_mappings am
where am.mapping_key = 'salary_expense'
on conflict (company_id, mapping_key) do nothing;

insert into public.account_mappings (user_id, company_id, mapping_key, account_id)
select am.user_id, am.company_id, 'rent', am.account_id
from public.account_mappings am
where am.mapping_key = 'rent_expense'
on conflict (company_id, mapping_key) do nothing;

insert into public.account_mappings (user_id, company_id, mapping_key, account_id)
select am.user_id, am.company_id, 'utilities', am.account_id
from public.account_mappings am
where am.mapping_key = 'utilities_expense'
on conflict (company_id, mapping_key) do nothing;

insert into public.account_mappings (user_id, company_id, mapping_key, account_id)
select coa.user_id, coa.company_id, 'share_capital', coa.id
from public.chart_of_accounts coa
where coa.code = '3100'
  and coa.type = 'equity'
  and coa.is_active = true
  and coa.is_group = false
on conflict (company_id, mapping_key) do nothing;

insert into public.account_mappings (user_id, company_id, mapping_key, account_id)
select coa.user_id, coa.company_id, 'retained_earnings', coa.id
from public.chart_of_accounts coa
where coa.code = '3200'
  and coa.type = 'equity'
  and coa.is_active = true
  and coa.is_group = false
on conflict (company_id, mapping_key) do nothing;
