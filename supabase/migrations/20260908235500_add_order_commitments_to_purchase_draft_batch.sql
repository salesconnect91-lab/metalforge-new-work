create or replace function public.add_order_commitments_to_purchase_draft_batch(
  p_order_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_row jsonb;
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb)) <> 'array' then raise exception 'Lines payload must be an array.'; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb)) = 0 then raise exception 'Select at least one Purchase Order commitment.'; end if;

  for v_row in select value from jsonb_array_elements(p_lines)
  loop
    perform public.add_order_commitment_to_existing_draft(
      p_order_id,
      nullif(v_row->>'commitment_id','')::uuid,
      nullif(v_row->>'qty','')::numeric,
      nullif(v_row->>'godown_id','')::uuid,
      'purchase_main'
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('success',true,'order_id',p_order_id,'lines_added',v_count);
end
$function$;

revoke all on function public.add_order_commitments_to_purchase_draft_batch(uuid,jsonb) from public;
grant execute on function public.add_order_commitments_to_purchase_draft_batch(uuid,jsonb) to authenticated;
