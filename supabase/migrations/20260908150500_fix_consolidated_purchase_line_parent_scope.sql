create or replace function public.validate_consolidated_purchase_line()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  co uuid := public.current_company_id();
  bu uuid := public.current_business_unit_id();
  parent_user uuid;
  st text;
begin
  if auth.uid() is null or co is null or bu is null then
    raise exception 'Authentication, active company and business unit are required.';
  end if;

  select i.user_id, i.status
    into parent_user, st
  from public.consolidated_purchase_invoices i
  where i.id = new.invoice_id
    and i.company_id = co
    and i.business_unit_id = bu;

  if not found then
    raise exception 'Consolidated Purchase Invoice not found in active business unit.';
  end if;
  if st <> 'draft' then
    raise exception 'Posted Consolidated Purchase Invoice is locked.';
  end if;

  new.user_id := parent_user;
  new.company_id := co;
  new.business_unit_id := bu;
  new.line_total := round(coalesce(new.qty,0) * coalesce(new.unit_cost,0),2);
  return new;
end
$function$;
