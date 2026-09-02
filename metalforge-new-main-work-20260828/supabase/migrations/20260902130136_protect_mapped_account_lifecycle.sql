-- Keep a valid account mapping valid for its entire lifecycle.
--
-- Mapping rows are already validated when written. This complementary trigger
-- prevents a linked COA account from later becoming inactive, becoming a group,
-- changing owner, or changing to an incompatible accounting type.

create or replace function public.protect_mapped_account_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  mapping_row record;
  expected_type text;
begin
  for mapping_row in
    select am.mapping_key
    from public.account_mappings am
    where am.account_id = old.id
  loop
    expected_type := case
      when mapping_row.mapping_key in (
        'cash', 'bank', 'accounts_receivable', 'inventory', 'input_vat'
      ) then 'asset'
      when mapping_row.mapping_key in (
        'accounts_payable', 'output_vat'
      ) then 'liability'
      when mapping_row.mapping_key in (
        'share_capital', 'retained_earnings'
      ) then 'equity'
      when mapping_row.mapping_key in (
        'sales_revenue', 'service_revenue', 'sales'
      ) then 'revenue'
      when mapping_row.mapping_key in (
        'cogs', 'cost_of_goods_sold', 'salaries', 'rent', 'utilities',
        'transport_expense', 'transport', 'general_expense', 'expense'
      ) then 'expense'
      else null
    end;

    if new.user_id is distinct from old.user_id then
      raise exception
        using message = format(
          'Account %s is mapped as %s and cannot change owner.',
          old.code,
          mapping_row.mapping_key
        );
    end if;

    if not new.is_active then
      raise exception
        using
          message = format(
            'Account %s is mapped as %s and cannot be deactivated.',
            old.code,
            mapping_row.mapping_key
          ),
          hint = 'Reassign the account mapping before deactivating this account.';
    end if;

    if new.is_group then
      raise exception
        using
          message = format(
            'Account %s is mapped as %s and must remain a posting account.',
            old.code,
            mapping_row.mapping_key
          ),
          hint = 'Reassign the account mapping before converting this account to a group.';
    end if;

    if expected_type is null or new.type is distinct from expected_type then
      raise exception
        using
          message = format(
            'Account %s is mapped as %s and must remain type %s.',
            old.code,
            mapping_row.mapping_key,
            coalesce(expected_type, 'defined by the accounting mapping')
          ),
          hint = 'Reassign the account mapping before changing this account type.';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_protect_mapped_account_lifecycle
  on public.chart_of_accounts;

create trigger trg_protect_mapped_account_lifecycle
before update of user_id, type, is_group, is_active
on public.chart_of_accounts
for each row
when (
  old.user_id is distinct from new.user_id
  or old.type is distinct from new.type
  or old.is_group is distinct from new.is_group
  or old.is_active is distinct from new.is_active
)
execute function public.protect_mapped_account_lifecycle();

revoke all on function public.protect_mapped_account_lifecycle() from public;
revoke all on function public.protect_mapped_account_lifecycle() from anon;
revoke all on function public.protect_mapped_account_lifecycle() from authenticated;

notify pgrst, 'reload schema';
