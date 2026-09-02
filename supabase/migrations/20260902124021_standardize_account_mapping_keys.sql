-- Standardize the account mapping keys used by the ERP posting engines.
--
-- This migration is intentionally additive:
--   * canonical mappings are created only when missing;
--   * an existing canonical selection is never overwritten;
--   * legacy aliases remain available for backwards compatibility.

insert into public.account_mappings (user_id, mapping_key, account_id)
select
  legacy.user_id,
  canonical.mapping_key,
  legacy.account_id
from public.account_mappings legacy
cross join lateral (
  values
    (
      case legacy.mapping_key
        when 'sales' then 'sales_revenue'
        when 'cost_of_goods_sold' then 'cogs'
        when 'expense' then 'general_expense'
        when 'transport' then 'transport_expense'
      end
    )
) as canonical(mapping_key)
where legacy.mapping_key in (
  'sales',
  'cost_of_goods_sold',
  'expense',
  'transport'
)
  and canonical.mapping_key is not null
on conflict (user_id, mapping_key) do nothing;

-- The original default COA uses account code 6400 for Transport & Freight.
-- Cover installations where the account exists but its old alias mapping does
-- not, without making assumptions about renamed account labels.
insert into public.account_mappings (user_id, mapping_key, account_id)
select
  coa.user_id,
  'transport_expense',
  coa.id
from public.chart_of_accounts coa
where coa.code = '6400'
  and coa.type = 'expense'
on conflict (user_id, mapping_key) do nothing;

notify pgrst, 'reload schema';
