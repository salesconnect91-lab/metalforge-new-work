begin;

create table if not exists public.return_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_no text not null,
  note_type text not null check (note_type in ('sales_credit','purchase_debit')),
  sales_order_id uuid references public.sales_orders(id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders(id) on delete restrict,
  party_type text not null check (party_type in ('customer','supplier')),
  party_id uuid not null,
  party_name text not null,
  note_date date not null,
  reason text not null,
  status text not null default 'posted' check (status in ('posted')),
  subtotal numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  cost_total numeric(14,2) not null default 0,
  journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint return_note_source_check check (
    (note_type = 'sales_credit' and sales_order_id is not null and purchase_order_id is null and party_type = 'customer') or
    (note_type = 'purchase_debit' and purchase_order_id is not null and sales_order_id is null and party_type = 'supplier')
  ),
  unique (user_id, note_no)
);

create table if not exists public.return_note_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_id uuid not null references public.return_notes(id) on delete restrict,
  original_line_id uuid not null,
  item_id uuid not null references public.items(id) on delete restrict,
  godown_id uuid not null references public.godowns(id) on delete restrict,
  qty numeric(14,3) not null check (qty > 0),
  unit_rate numeric(14,2) not null check (unit_rate >= 0),
  tax_percent numeric(8,3) not null default 0,
  line_subtotal numeric(14,2) not null,
  tax_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null,
  cost_rate numeric(14,2) not null default 0,
  cost_total numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (note_id, original_line_id)
);

create index if not exists idx_return_notes_user_date on public.return_notes(user_id, note_date desc);
create index if not exists idx_return_notes_sales on public.return_notes(user_id, sales_order_id) where sales_order_id is not null;
create index if not exists idx_return_notes_purchase on public.return_notes(user_id, purchase_order_id) where purchase_order_id is not null;
create index if not exists idx_return_lines_original on public.return_note_lines(user_id, original_line_id);

alter table public.return_notes enable row level security;
alter table public.return_note_lines enable row level security;
drop policy if exists return_notes_select_own on public.return_notes;
create policy return_notes_select_own on public.return_notes for select to authenticated using (auth.uid() = user_id);
drop policy if exists return_note_lines_select_own on public.return_note_lines;
create policy return_note_lines_select_own on public.return_note_lines for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.return_notes from authenticated, anon;
revoke insert, update, delete on public.return_note_lines from authenticated, anon;
grant select on public.return_notes, public.return_note_lines to authenticated;

create or replace function public.create_and_post_return_note(
  p_note_type text,
  p_order_id uuid,
  p_note_date date,
  p_reason text,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid(); v_note uuid; v_no text; v_seq integer; v_party uuid; v_party_name text;
  v_sub numeric := 0; v_tax numeric := 0; v_total numeric := 0; v_cost numeric := 0;
  v_ar uuid; v_ap uuid; v_sales uuid; v_inventory uuid; v_cogs uuid; v_output_vat uuid; v_input_vat uuid;
  v_journal uuid; v_post jsonb; v_order_tax numeric := 0; x jsonb; l record; v_qty numeric; v_prior numeric; v_wh uuid;
begin
  if v_user is null then raise exception 'Authentication is required.'; end if;
  if p_note_type not in ('sales_credit','purchase_debit') then raise exception 'Invalid return note type.'; end if;
  if p_order_id is null or p_note_date is null then raise exception 'Original invoice and note date are required.'; end if;
  if nullif(btrim(coalesce(p_reason,'')), '') is null then raise exception 'Return reason is required.'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'At least one return line is required.'; end if;

  if p_note_type = 'sales_credit' then
    select so.customer_id, c.name, so.tax_percent into v_party, v_party_name, v_order_tax
    from public.sales_orders so join public.customers c on c.id=so.customer_id and c.user_id=v_user
    where so.id=p_order_id and so.user_id=v_user and so.status='posted' for update of so;
  else
    select po.supplier_id, s.name, po.tax_percent into v_party, v_party_name, v_order_tax
    from public.purchase_orders po join public.suppliers s on s.id=po.supplier_id and s.user_id=v_user
    where po.id=p_order_id and po.user_id=v_user and po.status='posted' for update of po;
  end if;
  if v_party is null then raise exception 'Posted original invoice was not found.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_note_type || ':' || extract(year from p_note_date)::text,0));
  select coalesce(max(nullif(regexp_replace(note_no,'^.*-',''),'')::integer),0)+1 into v_seq
  from public.return_notes where user_id=v_user and note_type=p_note_type and extract(year from note_date)=extract(year from p_note_date);
  v_no := (case when p_note_type='sales_credit' then 'CN-' else 'DN-' end) || to_char(p_note_date,'YYYY') || '-' || lpad(v_seq::text,4,'0');
  insert into public.return_notes(user_id,note_no,note_type,sales_order_id,purchase_order_id,party_type,party_id,party_name,note_date,reason)
  values(v_user,v_no,p_note_type,case when p_note_type='sales_credit' then p_order_id end,case when p_note_type='purchase_debit' then p_order_id end,
    case when p_note_type='sales_credit' then 'customer' else 'supplier' end,v_party,v_party_name,p_note_date,btrim(p_reason)) returning id into v_note;

  for x in select value from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((x->>'qty')::numeric,0);
    if v_qty <= 0 then raise exception 'Every return quantity must be greater than zero.'; end if;
    if p_note_type='sales_credit' then
      select sol.id,sol.item_id,sol.godown_id,sol.qty,sol.unit_price as rate,sol.tax_percent,
             coalesce(nullif(sol.cost_price,0),i.cost,0) as cost_rate
      into l from public.sales_order_lines sol join public.items i on i.id=sol.item_id
      where sol.id=(x->>'line_id')::uuid and sol.order_id=p_order_id and sol.user_id=v_user;
    else
      select pol.id,pol.item_id,pol.godown_id,pol.qty,pol.unit_cost as rate,v_order_tax as tax_percent,pol.unit_cost as cost_rate
      into l from public.purchase_order_lines pol join public.items i on i.id=pol.item_id
      where pol.id=(x->>'line_id')::uuid and pol.order_id=p_order_id and pol.user_id=v_user;
    end if;
    if l.id is null or l.item_id is null or l.godown_id is null then raise exception 'Original invoice line, item or godown is missing.'; end if;
    select coalesce(sum(rnl.qty),0) into v_prior from public.return_note_lines rnl join public.return_notes rn on rn.id=rnl.note_id
    where rnl.user_id=v_user and rnl.original_line_id=l.id and rn.note_type=p_note_type and rn.status='posted';
    if v_prior + v_qty > l.qty then raise exception 'Return quantity exceeds remaining quantity for an invoice line.'; end if;
    select warehouse_id into v_wh from public.godowns where id=l.godown_id;
    if v_wh is null then raise exception 'Invoice line godown has no warehouse.'; end if;
    insert into public.return_note_lines(user_id,note_id,original_line_id,item_id,godown_id,qty,unit_rate,tax_percent,line_subtotal,tax_amount,line_total,cost_rate,cost_total)
    values(v_user,v_note,l.id,l.item_id,l.godown_id,v_qty,l.rate,coalesce(l.tax_percent,0),round(v_qty*l.rate,2),round(v_qty*l.rate*coalesce(l.tax_percent,0)/100,2),round(v_qty*l.rate*(1+coalesce(l.tax_percent,0)/100),2),l.cost_rate,round(v_qty*l.cost_rate,2));
    v_sub:=v_sub+round(v_qty*l.rate,2); v_tax:=v_tax+round(v_qty*l.rate*coalesce(l.tax_percent,0)/100,2); v_cost:=v_cost+round(v_qty*l.cost_rate,2);
    perform public.apply_stock_movement(l.item_id,v_wh,l.godown_id,case when p_note_type='sales_credit' then 'sale_return' else 'purchase_return' end,v_qty,v_no);
  end loop;
  v_total:=round(v_sub+v_tax,2);

  select account_id into v_ar from public.account_mappings where user_id=v_user and mapping_key='accounts_receivable';
  select account_id into v_ap from public.account_mappings where user_id=v_user and mapping_key='accounts_payable';
  select account_id into v_sales from public.account_mappings where user_id=v_user and mapping_key='sales_revenue';
  select account_id into v_inventory from public.account_mappings where user_id=v_user and mapping_key='inventory';
  select account_id into v_cogs from public.account_mappings where user_id=v_user and mapping_key='cogs';
  select account_id into v_output_vat from public.account_mappings where user_id=v_user and mapping_key='output_vat';
  select account_id into v_input_vat from public.account_mappings where user_id=v_user and mapping_key='input_vat';
  if (p_note_type='sales_credit' and (v_ar is null or v_sales is null or v_inventory is null or v_cogs is null or (v_tax>0 and v_output_vat is null)))
     or (p_note_type='purchase_debit' and (v_ap is null or v_inventory is null or (v_tax>0 and v_input_vat is null))) then
    raise exception 'Required account mappings are incomplete.';
  end if;

  insert into public.journal_entries(user_id,entry_no,entry_date,description,status,party_name,trans_type)
  values(v_user,v_no,p_note_date,(case when p_note_type='sales_credit' then 'Sales Credit Note - ' else 'Purchase Debit Note - ' end)||v_party_name,'draft',v_party_name,
    case when p_note_type='sales_credit' then 'Sales Credit Note' else 'Purchase Debit Note' end) returning id into v_journal;

  if p_note_type='sales_credit' then
    insert into public.journal_lines(user_id,entry_id,account_id,account,debit,credit,party_type,party_id,party_name)
    select v_user,v_journal,coa.id,coa.code||' - '||coa.name,
      case when coa.id=v_sales then v_sub when coa.id=v_output_vat then v_tax when coa.id=v_inventory then v_cost else 0 end,
      case when coa.id=v_ar then v_total when coa.id=v_cogs then v_cost else 0 end,
      case when coa.id=v_ar then 'customer' end,case when coa.id=v_ar then v_party end,v_party_name
    from public.chart_of_accounts coa where coa.id in (v_sales,v_ar,v_inventory,v_cogs,v_output_vat)
      and not (coa.id=v_output_vat and v_tax=0) and not (coa.id in (v_inventory,v_cogs) and v_cost=0);
  else
    insert into public.journal_lines(user_id,entry_id,account_id,account,debit,credit,party_type,party_id,party_name)
    select v_user,v_journal,coa.id,coa.code||' - '||coa.name,
      case when coa.id=v_ap then v_total else 0 end,
      case when coa.id=v_inventory then v_sub when coa.id=v_input_vat then v_tax else 0 end,
      case when coa.id=v_ap then 'supplier' end,case when coa.id=v_ap then v_party end,v_party_name
    from public.chart_of_accounts coa where coa.id in (v_ap,v_inventory,v_input_vat) and not (coa.id=v_input_vat and v_tax=0);
  end if;
  v_post:=public.post_journal_entry(v_journal);
  update public.return_notes set subtotal=round(v_sub,2),tax_total=round(v_tax,2),total=v_total,cost_total=round(v_cost,2),journal_entry_id=v_journal where id=v_note;
  if p_note_type='sales_credit' then
    update public.sales_orders set outstanding_amount=greatest(coalesce(outstanding_amount,0)-v_total,0),payment_status=case when greatest(coalesce(outstanding_amount,0)-v_total,0)=0 then 'paid' when coalesce(paid_amount,0)=0 then 'unpaid' else 'partial' end where id=p_order_id and user_id=v_user;
  else
    update public.purchase_orders set outstanding_amount=greatest(coalesce(outstanding_amount,0)-v_total,0),payment_status=case when greatest(coalesce(outstanding_amount,0)-v_total,0)=0 then 'paid' when coalesce(paid_amount,0)=0 then 'unpaid' else 'partial' end where id=p_order_id and user_id=v_user;
  end if;
  return jsonb_build_object('success',true,'note_id',v_note,'note_no',v_no,'journal_entry_id',v_journal,'total',v_total);
end;
$$;

revoke all on function public.create_and_post_return_note(text,uuid,date,text,jsonb) from public, anon;
grant execute on function public.create_and_post_return_note(text,uuid,date,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
