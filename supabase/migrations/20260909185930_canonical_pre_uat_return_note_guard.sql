-- Canonical, replay-safe security guard for Return Note posting.
-- Keep the implementation internal; expose only a permission-gated wrapper.
DO $$
BEGIN
  IF to_regprocedure('public.create_and_post_return_note_internal(text,uuid,date,text,jsonb)') IS NULL THEN
    ALTER FUNCTION public.create_and_post_return_note(text,uuid,date,text,jsonb)
      RENAME TO create_and_post_return_note_internal;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_and_post_return_note_internal(text,uuid,date,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_and_post_return_note_internal(text,uuid,date,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.create_and_post_return_note(
  p_note_type text,
  p_order_id uuid,
  p_note_date date,
  p_reason text,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.current_company_id() IS NULL OR public.current_business_unit_id() IS NULL THEN
    RAISE EXCEPTION 'Authentication, active company and business unit are required.';
  END IF;
  IF p_note_type = 'sales_credit' THEN
    PERFORM public.assert_module_permission('sales','post');
  ELSIF p_note_type = 'purchase_debit' THEN
    PERFORM public.assert_module_permission('purchase','post');
  ELSE
    RAISE EXCEPTION 'Invalid return note type.';
  END IF;
  PERFORM public.assert_module_permission('inventory','post');
  PERFORM public.assert_module_permission('accounting','post');
  RETURN public.create_and_post_return_note_internal(p_note_type,p_order_id,p_note_date,p_reason,p_lines);
END;
$$;

REVOKE ALL ON FUNCTION public.create_and_post_return_note(text,uuid,date,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_and_post_return_note(text,uuid,date,text,jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.company_legacy_owner_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.company_module_enabled(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.legacy_data_user_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_legacy_owner_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.company_module_enabled(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.legacy_data_user_id() TO service_role;
