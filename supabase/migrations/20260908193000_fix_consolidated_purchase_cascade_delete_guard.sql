create or replace function public.guard_consolidated_purchase_child()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_id uuid;
  v_status text;
begin
  if coalesce(current_setting('app.maintenance_reset', true),'0')='1' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  v_id := case when tg_op='DELETE' then old.invoice_id else new.invoice_id end;
  select status into v_status
  from public.consolidated_purchase_invoices
  where id = v_id;

  if not found then
    -- During ON DELETE CASCADE the parent row has already been removed from
    -- the deleting statement's visible set. The parent BEFORE DELETE guard
    -- has already verified that only a draft parent can be deleted.
    if tg_op='DELETE' then return old; end if;
    raise exception 'Consolidated Purchase Invoice not found.';
  end if;

  if v_status is distinct from 'draft' then
    raise exception 'Posted Consolidated Purchase Invoice details are locked.';
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end
$function$;
