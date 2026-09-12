create or replace function public.company_resource_limits(p_company_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','pg_temp'
as $function$
declare v jsonb;
begin
  if not (auth.role() = 'service_role' or public.is_platform_owner() or public.has_company_access(p_company_id)) then
    raise exception 'Company access denied';
  end if;
  with s as (
    select sp.max_users,sp.max_business_units,sp.max_branches,sp.max_godowns
    from public.company_subscriptions cs
    join public.subscription_plans sp on sp.id=cs.plan_id
    where cs.company_id=p_company_id and cs.status in ('trial','active')
      and (cs.expires_at is null or cs.expires_at>now())
    order by cs.starts_at desc nulls last,cs.created_at desc limit 1
  ), c as (
    select max_users,max_business_units,max_branches,max_godowns from public.companies where id=p_company_id
  )
  select jsonb_build_object(
    'max_users',coalesce(c.max_users,s.max_users),
    'max_business_units',coalesce(c.max_business_units,s.max_business_units),
    'max_branches',coalesce(c.max_branches,s.max_branches),
    'max_godowns',coalesce(c.max_godowns,s.max_godowns)
  ) into v from c left join s on true;
  return coalesce(v,'{}'::jsonb);
end$function$;

comment on function public.company_resource_limits(uuid) is
  'Returns effective company resource limits; callable by service-role edge functions, platform owner, or authorized company users.';
