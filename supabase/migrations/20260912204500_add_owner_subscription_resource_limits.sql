alter table public.subscription_plans
  add column if not exists max_business_units integer,
  add column if not exists max_branches integer,
  add column if not exists max_godowns integer,
  add column if not exists feature_defaults jsonb not null default '{}'::jsonb;

alter table public.companies
  add column if not exists max_business_units integer,
  add column if not exists max_branches integer,
  add column if not exists max_godowns integer;

alter table public.subscription_plans drop constraint if exists subscription_plans_resource_limits_chk;
alter table public.subscription_plans add constraint subscription_plans_resource_limits_chk check (
  (max_users is null or max_users >= 1) and
  (max_business_units is null or max_business_units >= 1) and
  (max_branches is null or max_branches >= 1) and
  (max_godowns is null or max_godowns >= 1)
);

alter table public.companies drop constraint if exists companies_resource_limits_chk;
alter table public.companies add constraint companies_resource_limits_chk check (
  (max_users is null or max_users >= 1) and
  (max_business_units is null or max_business_units >= 1) and
  (max_branches is null or max_branches >= 1) and
  (max_godowns is null or max_godowns >= 1)
);

create or replace function public.company_resource_limits(p_company_id uuid)
returns jsonb
language sql stable security definer set search_path=public
as $$
with s as (
  select sp.max_users,sp.max_business_units,sp.max_branches,sp.max_godowns
  from company_subscriptions cs join subscription_plans sp on sp.id=cs.plan_id
  where cs.company_id=p_company_id and cs.status='active'
    and (cs.expires_at is null or cs.expires_at>now())
  order by cs.starts_at desc limit 1
), c as (
  select max_users,max_business_units,max_branches,max_godowns from companies where id=p_company_id
)
select jsonb_build_object(
  'max_users',coalesce(c.max_users,s.max_users),
  'max_business_units',coalesce(c.max_business_units,s.max_business_units),
  'max_branches',coalesce(c.max_branches,s.max_branches),
  'max_godowns',coalesce(c.max_godowns,s.max_godowns)
) from c left join s on true
$$;
revoke all on function public.company_resource_limits(uuid) from public,anon;
grant execute on function public.company_resource_limits(uuid) to authenticated,service_role;
