alter table public.journal_entries
  add column if not exists reversal_of_entry_id uuid
    references public.journal_entries(id) on delete restrict,
  add column if not exists reversal_reason text;

create unique index if not exists uq_journal_single_reversal
  on public.journal_entries (reversal_of_entry_id)
  where reversal_of_entry_id is not null;

create index if not exists idx_journal_reversal_lookup
  on public.journal_entries (user_id, reversal_of_entry_id);

create or replace function public.reverse_manual_journal_entry(
  p_entry_id uuid,
  p_reversal_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_original public.journal_entries%rowtype;
  v_reversal_id uuid;
  v_reversal_no text;
  v_post_result jsonb;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_reversal_date is null then raise exception 'Reversal date is required.'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Reversal reason is required.';
  end if;

  select * into v_original
  from public.journal_entries
  where id = p_entry_id and user_id = v_user_id
  for update;

  if not found then raise exception 'Journal entry was not found.'; end if;
  if v_original.status <> 'posted' then raise exception 'Only a posted journal can be reversed.'; end if;
  if p_reversal_date < v_original.entry_date then
    raise exception 'Reversal date cannot be earlier than the original journal date.';
  end if;
  if v_original.reversal_of_entry_id is not null then raise exception 'A reversal journal cannot be reversed again.'; end if;

  if coalesce(v_original.trans_type, '') not in ('', 'Journal Entry', 'Manual Journal')
     or exists (select 1 from public.sales_orders so where so.user_id = v_user_id and so.order_no = v_original.entry_no)
     or exists (select 1 from public.purchase_orders po where po.user_id = v_user_id and po.order_no = v_original.entry_no) then
    raise exception 'Only manual journal entries can be reversed here. Use the source document correction workflow.';
  end if;

  if exists (
    select 1 from public.journal_entries je
    where je.user_id = v_user_id and je.reversal_of_entry_id = v_original.id
  ) then
    raise exception 'This journal entry has already been reversed.';
  end if;

  if not exists (
    select 1 from public.journal_lines jl
    where jl.entry_id = v_original.id and jl.user_id = v_user_id
  ) then
    raise exception 'Original journal has no lines to reverse.';
  end if;

  v_reversal_no := 'REV-' || v_original.entry_no;

  insert into public.journal_entries (
    user_id, entry_no, entry_date, description, status,
    payment_mode, party_name, trans_type,
    reversal_of_entry_id, reversal_reason
  ) values (
    v_user_id,
    v_reversal_no,
    p_reversal_date,
    'Reversal of ' || v_original.entry_no || ' - ' || btrim(p_reason),
    'draft',
    v_original.payment_mode,
    v_original.party_name,
    'Journal Reversal',
    v_original.id,
    btrim(p_reason)
  ) returning id into v_reversal_id;

  insert into public.journal_lines (
    user_id, entry_id, account_id, account,
    party_type, party_id, party_name, debit, credit
  )
  select
    v_user_id,
    v_reversal_id,
    jl.account_id,
    jl.account,
    jl.party_type,
    jl.party_id,
    jl.party_name,
    round(coalesce(jl.credit, 0), 2),
    round(coalesce(jl.debit, 0), 2)
  from public.journal_lines jl
  where jl.entry_id = v_original.id and jl.user_id = v_user_id;

  v_post_result := public.post_journal_entry(v_reversal_id);

  insert into public.audit_logs (
    user_id, module, action, table_name, record_id, record_name,
    performed_by, old_data, new_data, metadata
  ) values (
    v_user_id, 'accounting', 'REVERSE', 'journal_entries',
    v_original.id, v_original.entry_no, v_user_id,
    pg_catalog.jsonb_build_object('status', v_original.status),
    pg_catalog.jsonb_build_object('reversal_entry_id', v_reversal_id),
    pg_catalog.jsonb_build_object(
      'reversal_entry_no', v_reversal_no,
      'reversal_date', p_reversal_date,
      'reason', btrim(p_reason)
    )
  );

  return pg_catalog.jsonb_build_object(
    'success', true,
    'original_entry_id', v_original.id,
    'reversal_entry_id', v_reversal_id,
    'reversal_entry_no', v_reversal_no,
    'post_result', v_post_result
  );
end;
$$;

revoke all on function public.reverse_manual_journal_entry(uuid, date, text)
from public, anon;
grant execute on function public.reverse_manual_journal_entry(uuid, date, text)
to authenticated;

notify pgrst, 'reload schema';
