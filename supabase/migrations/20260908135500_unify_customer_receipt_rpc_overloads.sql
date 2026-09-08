create or replace function public.receive_customer_payment(
  p_customer_id uuid,
  p_payment_date date,
  p_payment_account_id uuid,
  p_payment_method text,
  p_reference text,
  p_description text,
  p_notes text,
  p_allocations jsonb
) returns jsonb
language sql
security definer
set search_path to 'public','pg_temp'
as $$
  select public.receive_customer_payment(
    p_customer_id,
    p_payment_date,
    p_payment_account_id,
    p_payment_method,
    p_reference,
    p_description,
    p_notes,
    p_allocations,
    null::numeric
  );
$$;