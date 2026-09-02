begin;

-- Application roles and per-module permissions.
create table if not exists public.user_profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'viewer' check(role in('admin','accountant','sales','purchase','warehouse','viewer')),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
insert into public.user_profiles(id,role,is_active)
select id,'admin',true from auth.users
on conflict(id) do nothing;
alter table public.user_profiles enable row level security;
drop policy if exists user_profiles_select_own on public.user_profiles;
create policy user_profiles_select_own on public.user_profiles for select to authenticated using((select auth.uid())=id);
grant select on public.user_profiles to authenticated;

create table if not exists public.role_permissions(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 role text not null check(role in('admin','accountant','sales','purchase','warehouse','viewer')),
 module_key text not null,
 can_view boolean not null default false,
 can_create boolean not null default false,
 can_edit boolean not null default false,
 can_delete boolean not null default false,
 can_post boolean not null default false,
 can_print boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,role,module_key)
);
alter table public.role_permissions enable row level security;
drop policy if exists role_permissions_select_own on public.role_permissions;
create policy role_permissions_select_own on public.role_permissions for select to authenticated using((select auth.uid())=user_id);
grant select on public.role_permissions to authenticated;

-- Budgets
create table if not exists public.account_budgets(
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 fiscal_year integer not null check(fiscal_year between 2000 and 2200), fiscal_month integer not null check(fiscal_month between 1 and 12),
 account_id uuid not null references public.chart_of_accounts(id) on delete restrict, amount numeric(14,2) not null check(amount>=0),
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,fiscal_year,fiscal_month,account_id)
);
alter table public.account_budgets enable row level security;
drop policy if exists account_budgets_select_own on public.account_budgets;
create policy account_budgets_select_own on public.account_budgets for select to authenticated using((select auth.uid())=user_id);
drop policy if exists account_budgets_insert_own on public.account_budgets;
create policy account_budgets_insert_own on public.account_budgets for insert to authenticated with check((select auth.uid())=user_id and exists(select 1 from public.chart_of_accounts coa where coa.id=account_id and coa.user_id=(select auth.uid()) and coa.type in('revenue','expense') and coa.is_group=false));
drop policy if exists account_budgets_update_own on public.account_budgets;
create policy account_budgets_update_own on public.account_budgets for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id and exists(select 1 from public.chart_of_accounts coa where coa.id=account_id and coa.user_id=(select auth.uid()) and coa.type in('revenue','expense') and coa.is_group=false));
drop policy if exists account_budgets_delete_own on public.account_budgets;
create policy account_budgets_delete_own on public.account_budgets for delete to authenticated using((select auth.uid())=user_id);
grant select,insert,update,delete on public.account_budgets to authenticated;

-- Fixed asset register and depreciation history
create table if not exists public.fixed_assets(
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 asset_code text not null, asset_name text not null, description text, purchase_date date not null, in_service_date date not null,
 cost numeric(14,2) not null check(cost>0), salvage_value numeric(14,2) not null default 0 check(salvage_value>=0), useful_life_months integer not null check(useful_life_months>0),
 asset_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
 accumulated_depreciation_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
 depreciation_expense_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
 status text not null default 'active' check(status in('active','fully_depreciated','disposed')), disposal_date date, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,asset_code),check(salvage_value<=cost),check(disposal_date is null or disposal_date>=in_service_date)
);
create table if not exists public.fixed_asset_depreciation(
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 asset_id uuid not null references public.fixed_assets(id) on delete restrict,period_end date not null,months_posted integer not null check(months_posted>0),amount numeric(14,2) not null check(amount>0),
 journal_entry_id uuid not null references public.journal_entries(id) on delete restrict,created_at timestamptz not null default now(),unique(user_id,asset_id,period_end)
);
alter table public.fixed_assets enable row level security;alter table public.fixed_asset_depreciation enable row level security;
drop policy if exists fixed_assets_select_own on public.fixed_assets;create policy fixed_assets_select_own on public.fixed_assets for select to authenticated using((select auth.uid())=user_id);
drop policy if exists fixed_assets_insert_own on public.fixed_assets;create policy fixed_assets_insert_own on public.fixed_assets for insert to authenticated with check((select auth.uid())=user_id);
drop policy if exists fixed_assets_update_own on public.fixed_assets;create policy fixed_assets_update_own on public.fixed_assets for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
drop policy if exists fixed_asset_depr_select_own on public.fixed_asset_depreciation;create policy fixed_asset_depr_select_own on public.fixed_asset_depreciation for select to authenticated using((select auth.uid())=user_id);
grant select,insert,update on public.fixed_assets to authenticated;revoke delete on public.fixed_assets from authenticated,anon;grant select on public.fixed_asset_depreciation to authenticated;revoke insert,update,delete on public.fixed_asset_depreciation from authenticated,anon;

create or replace function public.validate_fixed_asset_accounts() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.chart_of_accounts where id=new.asset_account_id and user_id=new.user_id and type='asset' and is_active=true and is_group=false)
 or not exists(select 1 from public.chart_of_accounts where id=new.accumulated_depreciation_account_id and user_id=new.user_id and type='asset' and is_active=true and is_group=false)
 or not exists(select 1 from public.chart_of_accounts where id=new.depreciation_expense_account_id and user_id=new.user_id and type='expense' and is_active=true and is_group=false) then raise exception 'Fixed asset accounts are invalid or belong to another user.';end if;
 if tg_op='UPDATE' and exists(select 1 from public.fixed_asset_depreciation where user_id=old.user_id and asset_id=old.id)
 and (new.cost is distinct from old.cost or new.salvage_value is distinct from old.salvage_value or new.useful_life_months is distinct from old.useful_life_months or new.in_service_date is distinct from old.in_service_date or new.asset_account_id is distinct from old.asset_account_id or new.accumulated_depreciation_account_id is distinct from old.accumulated_depreciation_account_id or new.depreciation_expense_account_id is distinct from old.depreciation_expense_account_id) then raise exception 'Depreciated asset accounting fields are locked.';end if;
 return new;
end;$$;
drop trigger if exists trg_validate_fixed_asset_accounts on public.fixed_assets;create trigger trg_validate_fixed_asset_accounts before insert or update on public.fixed_assets for each row execute function public.validate_fixed_asset_accounts();

create or replace function public.post_fixed_asset_depreciation(p_asset_id uuid,p_period_end date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();a public.fixed_assets%rowtype;v_last date;v_months int;v_monthly numeric;v_posted numeric;v_amount numeric;v_journal uuid;v_result jsonb;
begin
 if v_user is null then raise exception 'Authentication is required.';end if;if p_period_end is null then raise exception 'Period end is required.';end if;
 select * into a from public.fixed_assets where id=p_asset_id and user_id=v_user for update;if not found then raise exception 'Fixed asset not found.';end if;if a.status<>'active' then raise exception 'Only an active asset can be depreciated.';end if;if p_period_end<a.in_service_date then raise exception 'Period is before in-service date.';end if;
 select max(period_end) into v_last from public.fixed_asset_depreciation where user_id=v_user and asset_id=a.id;
 v_months:=(extract(year from age(date_trunc('month',p_period_end)+interval '1 month',date_trunc('month',coalesce(v_last+1,a.in_service_date))))*12+extract(month from age(date_trunc('month',p_period_end)+interval '1 month',date_trunc('month',coalesce(v_last+1,a.in_service_date)))))::int;
 if v_months<=0 then raise exception 'No unposted depreciation months through this date.';end if;
 v_monthly:=round((a.cost-a.salvage_value)/a.useful_life_months,2);select coalesce(sum(amount),0) into v_posted from public.fixed_asset_depreciation where user_id=v_user and asset_id=a.id;
 v_amount:=least(round(v_monthly*v_months,2),round(a.cost-a.salvage_value-v_posted,2));if v_amount<=0 then raise exception 'Asset is already fully depreciated.';end if;
 insert into public.journal_entries(user_id,entry_no,entry_date,description,status,trans_type) values(v_user,'DEP-'||a.asset_code||'-'||to_char(p_period_end,'YYYYMM'),p_period_end,'Depreciation - '||a.asset_name,'draft','Depreciation') returning id into v_journal;
 insert into public.journal_lines(user_id,entry_id,account_id,account,debit,credit)
 select v_user,v_journal,coa.id,coa.code||' - '||coa.name,case when coa.id=a.depreciation_expense_account_id then v_amount else 0 end,case when coa.id=a.accumulated_depreciation_account_id then v_amount else 0 end from public.chart_of_accounts coa where coa.user_id=v_user and coa.id in(a.depreciation_expense_account_id,a.accumulated_depreciation_account_id);
 if(select count(*) from public.journal_lines where entry_id=v_journal)<>2 then raise exception 'Depreciation account setup is invalid.';end if;
 insert into public.ledgers(user_id,journal_entry_id,journal_line_id,account_id,entry_date,description,debit,credit)
 select v_user,v_journal,jl.id,jl.account_id,p_period_end,'DEP-'||a.asset_code||' - Depreciation - '||a.asset_name,jl.debit,jl.credit from public.journal_lines jl where jl.entry_id=v_journal and jl.user_id=v_user;
 update public.journal_entries set status='posted' where id=v_journal and user_id=v_user and status='draft';
 v_result:=jsonb_build_object('success',true,'status','posted');insert into public.fixed_asset_depreciation(user_id,asset_id,period_end,months_posted,amount,journal_entry_id) values(v_user,a.id,p_period_end,v_months,v_amount,v_journal);
 update public.fixed_assets set status=case when v_posted+v_amount>=a.cost-a.salvage_value-.009 then 'fully_depreciated' else status end,updated_at=now() where id=a.id;
 return jsonb_build_object('success',true,'amount',v_amount,'months_posted',v_months,'journal_entry_id',v_journal,'post_result',v_result);
end;$$;

-- One controlled opening-balance journal per calendar year
create table if not exists public.opening_balance_batches(
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 opening_year integer not null check(opening_year between 2000 and 2200),opening_date date not null,journal_entry_id uuid not null references public.journal_entries(id) on delete restrict,total_debit numeric(14,2) not null,total_credit numeric(14,2) not null,created_at timestamptz not null default now(),unique(user_id,opening_year)
);
alter table public.opening_balance_batches enable row level security;drop policy if exists opening_batches_select_own on public.opening_balance_batches;create policy opening_batches_select_own on public.opening_balance_batches for select to authenticated using((select auth.uid())=user_id);grant select on public.opening_balance_batches to authenticated;revoke insert,update,delete on public.opening_balance_batches from authenticated,anon;
create or replace function public.post_opening_balances(p_opening_date date,p_lines jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_year int;v_debit numeric;v_credit numeric;v_journal uuid;v_result jsonb;x jsonb;v_account uuid;v_party_type text;v_party uuid;coa public.chart_of_accounts%rowtype;v_ar uuid;v_ap uuid;
begin
 if v_user is null then raise exception 'Authentication is required.';end if;if p_opening_date is null or extract(month from p_opening_date)<>1 or extract(day from p_opening_date)<>1 then raise exception 'Opening balance date must be January 1.';end if;
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<2 then raise exception 'At least two opening lines are required.';end if;v_year:=extract(year from p_opening_date);
 if exists(select 1 from public.opening_balance_batches where user_id=v_user and opening_year=v_year) then raise exception 'Opening balances are already posted for this year.';end if;
 if exists(select 1 from public.ledgers where user_id=v_user and entry_date<p_opening_date) and not exists(select 1 from public.fiscal_year_closures where user_id=v_user and fiscal_year=v_year-1 and status='closed') then raise exception 'Prior activity exists. Close the previous financial year instead of importing new opening balances.';end if;
 select account_id into v_ar from public.account_mappings where user_id=v_user and mapping_key='accounts_receivable';select account_id into v_ap from public.account_mappings where user_id=v_user and mapping_key='accounts_payable';
 select round(sum(coalesce((value->>'debit')::numeric,0)),2),round(sum(coalesce((value->>'credit')::numeric,0)),2) into v_debit,v_credit from jsonb_array_elements(p_lines);
 if v_debit<=0 or abs(v_debit-v_credit)>=.01 then raise exception 'Opening balances must have equal positive debit and credit totals.';end if;
 insert into public.journal_entries(user_id,entry_no,entry_date,description,status,trans_type) values(v_user,'OB-'||v_year,p_opening_date,'Opening balances '||v_year,'draft','Opening Balance') returning id into v_journal;
 for x in select value from jsonb_array_elements(p_lines) loop
  v_account:=(x->>'account_id')::uuid;v_party_type:=nullif(x->>'party_type','');v_party:=nullif(x->>'party_id','')::uuid;select * into coa from public.chart_of_accounts where id=v_account and user_id=v_user and is_active=true and is_group=false;
  if not found then raise exception 'Invalid opening balance account.';end if;if coalesce((x->>'debit')::numeric,0)<0 or coalesce((x->>'credit')::numeric,0)<0 or (coalesce((x->>'debit')::numeric,0)>0 and coalesce((x->>'credit')::numeric,0)>0) then raise exception 'Each opening line must be one-sided.';end if;
  if v_account in(v_ar,v_ap) and (v_party is null or v_party_type is null) then raise exception 'AR/AP opening balances require a customer or supplier.';end if;
  insert into public.journal_lines(user_id,entry_id,account_id,account,debit,credit,party_type,party_id,party_name)
  values(v_user,v_journal,coa.id,coa.code||' - '||coa.name,round(coalesce((x->>'debit')::numeric,0),2),round(coalesce((x->>'credit')::numeric,0),2),v_party_type,v_party,nullif(x->>'party_name',''));
 end loop;
 v_result:=public.post_journal_entry(v_journal);insert into public.opening_balance_batches(user_id,opening_year,opening_date,journal_entry_id,total_debit,total_credit) values(v_user,v_year,p_opening_date,v_journal,v_debit,v_credit);
 return jsonb_build_object('success',true,'journal_entry_id',v_journal,'total_debit',v_debit,'total_credit',v_credit,'post_result',v_result);
end;$$;

-- Authorization hardening: browser users cannot grant themselves roles/permissions.
revoke insert,update,delete on public.role_permissions from authenticated,anon;
revoke insert,update,delete on public.user_profiles from authenticated,anon;
create or replace function public.current_erp_role() returns text language sql stable security invoker set search_path='' as $$
 select coalesce(nullif(auth.jwt()->'app_metadata'->>'erp_role',''),(select up.role from public.user_profiles up where up.id=auth.uid() and up.is_active=true),'viewer')
$$;
create or replace function public.set_role_permission(p_role text,p_module_key text,p_view boolean,p_create boolean,p_edit boolean,p_delete boolean,p_post boolean,p_print boolean)
returns jsonb language plpgsql security definer set search_path='' as $$declare v_user uuid:=auth.uid();begin
 if v_user is null then raise exception 'Authentication is required.';end if;if public.current_erp_role()<>'admin' then raise exception 'Administrator permission is required.';end if;
 if nullif(btrim(p_role),'') is null or nullif(btrim(p_module_key),'') is null then raise exception 'Role and module are required.';end if;
 insert into public.role_permissions(user_id,role,module_key,can_view,can_create,can_edit,can_delete,can_post,can_print) values(v_user,lower(btrim(p_role)),lower(btrim(p_module_key)),p_view,p_create,p_edit,p_delete,p_post,p_print)
 on conflict(user_id,role,module_key) do update set can_view=excluded.can_view,can_create=excluded.can_create,can_edit=excluded.can_edit,can_delete=excluded.can_delete,can_post=excluded.can_post,can_print=excluded.can_print;
 return jsonb_build_object('success',true);end;$$;

revoke all on function public.post_fixed_asset_depreciation(uuid,date) from public,anon;grant execute on function public.post_fixed_asset_depreciation(uuid,date) to authenticated;
revoke all on function public.validate_fixed_asset_accounts() from public,anon,authenticated;
revoke all on function public.post_opening_balances(date,jsonb) from public,anon;grant execute on function public.post_opening_balances(date,jsonb) to authenticated;
revoke all on function public.current_erp_role() from public,anon;grant execute on function public.current_erp_role() to authenticated;
revoke all on function public.set_role_permission(text,text,boolean,boolean,boolean,boolean,boolean,boolean) from public,anon;grant execute on function public.set_role_permission(text,text,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
notify pgrst,'reload schema';commit;
