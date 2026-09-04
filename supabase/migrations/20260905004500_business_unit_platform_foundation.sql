create table if not exists public.business_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  unit_type text not null default 'custom' check (unit_type in ('steel','transport','retail','fuel','construction','custom')),
  is_active boolean not null default true,
  is_default boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, code)
);

create unique index if not exists business_units_one_default_per_company
  on public.business_units(company_id) where is_default;
create index if not exists business_units_company_idx on public.business_units(company_id, is_active);

create table if not exists public.business_unit_memberships (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  is_active boolean not null default true,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_unit_id, user_id)
);
create index if not exists business_unit_memberships_company_user_idx on public.business_unit_memberships(company_id, user_id, is_active);
create index if not exists business_unit_memberships_unit_idx on public.business_unit_memberships(business_unit_id, is_active);

create table if not exists public.business_unit_modules (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_unit_id, module_key)
);
create index if not exists business_unit_modules_unit_idx on public.business_unit_modules(business_unit_id, enabled);

alter table public.user_profiles add column if not exists last_business_unit_id uuid null references public.business_units(id) on delete set null;
create index if not exists user_profiles_last_business_unit_idx on public.user_profiles(last_business_unit_id);

insert into public.business_units(company_id, code, name, unit_type, is_active, is_default)
select c.id, 'STEEL', 'Steel Mill', 'steel', true, true
from public.companies c
where not exists (select 1 from public.business_units b where b.company_id=c.id);

insert into public.business_unit_memberships(business_unit_id, company_id, user_id, role, is_active, permissions)
select b.id, m.company_id, m.user_id, m.role, m.is_active, coalesce(m.permissions,'{}'::jsonb)
from public.company_memberships m
join public.business_units b on b.company_id=m.company_id and b.is_default
on conflict (business_unit_id,user_id) do update set
  role=excluded.role,
  is_active=excluded.is_active,
  permissions=excluded.permissions,
  updated_at=now();

insert into public.business_unit_modules(business_unit_id, company_id, module_key, enabled)
select b.id, b.company_id, cm.module_key, cm.enabled
from public.business_units b
join public.company_modules cm on cm.company_id=b.company_id
where b.is_default
on conflict (business_unit_id,module_key) do update set enabled=excluded.enabled, updated_at=now();

create or replace function public.current_business_unit_id()
returns uuid
language sql
stable security definer
set search_path to 'public','pg_temp'
as $function$
  with ctx as (
    select auth.uid() uid, public.current_company_id() company_id
  )
  select coalesce(
    (
      select b.id
      from public.user_profiles p
      join public.business_units b on b.id=p.last_business_unit_id
      cross join ctx
      where p.id=ctx.uid
        and b.company_id=ctx.company_id
        and b.is_active
        and (
          public.is_platform_owner()
          or exists (
            select 1 from public.business_unit_memberships bm
            where bm.business_unit_id=b.id and bm.user_id=ctx.uid and bm.is_active
          )
        )
      limit 1
    ),
    (
      select b.id
      from public.business_units b
      cross join ctx
      where b.company_id=ctx.company_id
        and b.is_active
        and (
          public.is_platform_owner()
          or exists (
            select 1 from public.business_unit_memberships bm
            where bm.business_unit_id=b.id and bm.user_id=ctx.uid and bm.is_active
          )
        )
      order by b.is_default desc, b.created_at asc
      limit 1
    )
  );
$function$;

create or replace function public.set_current_business_unit(p_business_unit_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if v_company_id is null then raise exception 'No active company selected.'; end if;

  if not exists (
    select 1 from public.business_units b
    where b.id=p_business_unit_id and b.company_id=v_company_id and b.is_active
      and (
        public.is_platform_owner()
        or exists (
          select 1 from public.business_unit_memberships bm
          where bm.business_unit_id=b.id and bm.user_id=v_uid and bm.is_active
        )
      )
  ) then
    raise exception 'You do not have access to this business unit.';
  end if;

  update public.user_profiles
  set last_business_unit_id=p_business_unit_id, updated_at=now()
  where id=v_uid;
  return p_business_unit_id;
end;
$function$;

create or replace function public.get_my_access_context()
returns jsonb
language sql
stable security definer
set search_path to 'public','pg_temp'
as $function$
select jsonb_build_object(
  'user_id',auth.uid(),
  'profile_active',coalesce(p.is_active,false),
  'platform_role',coalesce(p.platform_role,'user'),
  'is_platform_owner',coalesce(p.platform_role='super_admin' and p.is_active,false),
  'current_company_id',public.current_company_id(),
  'current_business_unit_id',public.current_business_unit_id(),
  'companies',coalesce((
    select jsonb_agg(x.obj order by x.company_name)
    from (
      select c.name company_name,
        jsonb_build_object(
          'company_id',c.id,
          'company_name',c.name,
          'company_code',c.code,
          'company_status',c.status,
          'subscription_expires_at',c.subscription_expires_at,
          'membership_role',coalesce(m.role,case when p.platform_role='super_admin' then 'company_owner' end),
          'membership_active',coalesce(m.is_active,p.platform_role='super_admin'),
          'permissions',coalesce(m.permissions,'{}'::jsonb),
          'enabled_modules',coalesce((select jsonb_agg(cm.module_key order by cm.module_key) from public.company_modules cm where cm.company_id=c.id and cm.enabled),'[]'::jsonb),
          'business_units',coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'business_unit_id',b.id,
                'business_unit_code',b.code,
                'business_unit_name',b.name,
                'business_unit_type',b.unit_type,
                'is_default',b.is_default,
                'membership_role',coalesce(bm.role,case when p.platform_role='super_admin' then coalesce(m.role,'company_owner') end),
                'membership_active',coalesce(bm.is_active,p.platform_role='super_admin'),
                'permissions',coalesce(bm.permissions,'{}'::jsonb),
                'enabled_modules',coalesce((select jsonb_agg(bmod.module_key order by bmod.module_key) from public.business_unit_modules bmod where bmod.business_unit_id=b.id and bmod.enabled),'[]'::jsonb),
                'access_allowed',(b.is_active and (p.platform_role='super_admin' or coalesce(bm.is_active,false)))
              ) order by b.is_default desc,b.name
            )
            from public.business_units b
            left join public.business_unit_memberships bm on bm.business_unit_id=b.id and bm.user_id=auth.uid()
            where b.company_id=c.id and (p.platform_role='super_admin' or bm.user_id is not null)
          ),'[]'::jsonb),
          'access_allowed',(p.is_active and c.status in('trial','active') and(c.subscription_expires_at is null or c.subscription_expires_at>now())and(p.platform_role='super_admin' or coalesce(m.is_active,false)))
        ) obj
      from public.companies c
      left join public.company_memberships m on m.company_id=c.id and m.user_id=auth.uid()
      where p.platform_role='super_admin' or m.user_id is not null
    ) x
  ),'[]'::jsonb)
)
from public.user_profiles p where p.id=auth.uid()
$function$;

create or replace function public.bootstrap_default_business_unit()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if not exists(select 1 from public.business_units b where b.company_id=new.id) then
    insert into public.business_units(company_id,code,name,unit_type,is_active,is_default)
    values(new.id,'STEEL','Steel Mill','steel',true,true);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_bootstrap_default_business_unit on public.companies;
create trigger trg_bootstrap_default_business_unit
after insert on public.companies
for each row execute function public.bootstrap_default_business_unit();

create or replace function public.sync_default_business_unit_membership()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_unit uuid;
begin
  select id into v_unit from public.business_units where company_id=new.company_id and is_default order by created_at limit 1;
  if v_unit is not null then
    insert into public.business_unit_memberships(business_unit_id,company_id,user_id,role,is_active,permissions)
    values(v_unit,new.company_id,new.user_id,new.role,new.is_active,coalesce(new.permissions,'{}'::jsonb))
    on conflict (business_unit_id,user_id) do update set role=excluded.role,is_active=excluded.is_active,permissions=excluded.permissions,updated_at=now();
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_sync_default_business_unit_membership on public.company_memberships;
create trigger trg_sync_default_business_unit_membership
after insert or update of role,is_active,permissions on public.company_memberships
for each row execute function public.sync_default_business_unit_membership();

alter table public.business_units enable row level security;
alter table public.business_unit_memberships enable row level security;
alter table public.business_unit_modules enable row level security;

drop policy if exists business_units_select_access on public.business_units;
create policy business_units_select_access on public.business_units for select to authenticated
using (
  public.is_platform_owner()
  or exists(select 1 from public.business_unit_memberships bm where bm.business_unit_id=id and bm.user_id=auth.uid() and bm.is_active)
);
drop policy if exists business_units_owner_write on public.business_units;
create policy business_units_owner_write on public.business_units for all to authenticated
using (public.is_platform_owner()) with check (public.is_platform_owner());

drop policy if exists business_unit_memberships_select_access on public.business_unit_memberships;
create policy business_unit_memberships_select_access on public.business_unit_memberships for select to authenticated
using (public.is_platform_owner() or user_id=auth.uid());
drop policy if exists business_unit_memberships_owner_write on public.business_unit_memberships;
create policy business_unit_memberships_owner_write on public.business_unit_memberships for all to authenticated
using (public.is_platform_owner()) with check (public.is_platform_owner());

drop policy if exists business_unit_modules_select_access on public.business_unit_modules;
create policy business_unit_modules_select_access on public.business_unit_modules for select to authenticated
using (
  public.is_platform_owner()
  or exists(select 1 from public.business_unit_memberships bm where bm.business_unit_id=business_unit_id and bm.user_id=auth.uid() and bm.is_active)
);
drop policy if exists business_unit_modules_owner_write on public.business_unit_modules;
create policy business_unit_modules_owner_write on public.business_unit_modules for all to authenticated
using (public.is_platform_owner()) with check (public.is_platform_owner());

grant select on public.business_units, public.business_unit_memberships, public.business_unit_modules to authenticated;
grant insert,update,delete on public.business_units, public.business_unit_memberships, public.business_unit_modules to authenticated;
revoke all on function public.current_business_unit_id() from public,anon;
revoke all on function public.set_current_business_unit(uuid) from public,anon;
grant execute on function public.current_business_unit_id() to authenticated;
grant execute on function public.set_current_business_unit(uuid) to authenticated;
grant execute on function public.get_my_access_context() to authenticated;
