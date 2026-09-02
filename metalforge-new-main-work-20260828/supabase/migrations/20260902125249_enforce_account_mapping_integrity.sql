-- Enforce ownership and accounting classification for account mappings.
--
-- Existing invalid rows are reported and must be corrected deliberately.
-- This migration never rewrites or deletes an existing mapping.

do $$
declare
  invalid_mappings text;
begin
  select string_agg(
    format(
      'user=%s key=%s account=%s reason=%s',
      am.user_id,
      am.mapping_key,
      am.account_id,
      case
        when coa.id is null then 'account not found'
        when coa.user_id is distinct from am.user_id then 'account belongs to another user'
        when coa.is_group then 'group account'
        when not coa.is_active then 'inactive account'
        when expected.account_type is null then 'unsupported mapping key'
        when coa.type is distinct from expected.account_type then
          format('expected %s, found %s', expected.account_type, coa.type)
        else 'unknown'
      end
    ),
    E'\n'
    order by am.user_id, am.mapping_key
  )
  into invalid_mappings
  from public.account_mappings am
  left join public.chart_of_accounts coa
    on coa.id = am.account_id
  cross join lateral (
    select case
      when am.mapping_key in (
        'cash', 'bank', 'accounts_receivable', 'inventory', 'input_vat'
      ) then 'asset'
      when am.mapping_key in (
        'accounts_payable', 'output_vat'
      ) then 'liability'
      when am.mapping_key in (
        'share_capital', 'retained_earnings'
      ) then 'equity'
      when am.mapping_key in (
        'sales_revenue', 'service_revenue', 'sales'
      ) then 'revenue'
      when am.mapping_key in (
        'cogs', 'cost_of_goods_sold', 'salaries', 'rent', 'utilities',
        'transport_expense', 'transport', 'general_expense', 'expense'
      ) then 'expense'
      else null
    end as account_type
  ) expected
  where coa.id is null
     or coa.user_id is distinct from am.user_id
     or coa.is_group
     or not coa.is_active
     or expected.account_type is null
     or coa.type is distinct from expected.account_type;

  if invalid_mappings is not null then
    raise exception
      using
        message = 'Invalid account mappings must be corrected before integrity rules can be enabled.',
        detail = invalid_mappings,
        hint = 'Map each key to an active, non-group account owned by the same user and having the required account type.';
  end if;
end;
$$;

create or replace function public.validate_account_mapping()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  mapped_account public.chart_of_accounts%rowtype;
  expected_type text;
begin
  new.mapping_key := lower(trim(new.mapping_key));

  expected_type := case
    when new.mapping_key in (
      'cash', 'bank', 'accounts_receivable', 'inventory', 'input_vat'
    ) then 'asset'
    when new.mapping_key in (
      'accounts_payable', 'output_vat'
    ) then 'liability'
    when new.mapping_key in (
      'share_capital', 'retained_earnings'
    ) then 'equity'
    when new.mapping_key in (
      'sales_revenue', 'service_revenue', 'sales'
    ) then 'revenue'
    when new.mapping_key in (
      'cogs', 'cost_of_goods_sold', 'salaries', 'rent', 'utilities',
      'transport_expense', 'transport', 'general_expense', 'expense'
    ) then 'expense'
    else null
  end;

  if expected_type is null then
    raise exception
      using
        message = format('Unsupported accounting mapping key: %s', new.mapping_key),
        hint = 'Use a mapping key defined by the ERP accounting engine.';
  end if;

  select coa.*
  into mapped_account
  from public.chart_of_accounts coa
  where coa.id = new.account_id;

  if not found or mapped_account.user_id is distinct from new.user_id then
    raise exception
      using message = 'Mapped account must belong to the same user/company.';
  end if;

  if mapped_account.is_group then
    raise exception
      using message = 'A group/header account cannot be used as an accounting mapping.';
  end if;

  if not mapped_account.is_active then
    raise exception
      using message = 'An inactive account cannot be used as an accounting mapping.';
  end if;

  if mapped_account.type is distinct from expected_type then
    raise exception
      using message = format(
        'Mapping %s requires an %s account, not %s.',
        new.mapping_key,
        expected_type,
        mapped_account.type
      );
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_account_mapping
  on public.account_mappings;

create trigger trg_validate_account_mapping
before insert or update of user_id, mapping_key, account_id
on public.account_mappings
for each row
execute function public.validate_account_mapping();

revoke all on function public.validate_account_mapping() from public;
revoke all on function public.validate_account_mapping() from anon;
revoke all on function public.validate_account_mapping() from authenticated;

notify pgrst, 'reload schema';
