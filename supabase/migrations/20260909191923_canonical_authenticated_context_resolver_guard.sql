-- Canonicalize the legacy tenant-row owner resolver so authenticated ERP RPCs can use it
-- without exposing the lower-level company owner lookup helper.

REVOKE ALL ON FUNCTION public.legacy_data_user_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legacy_data_user_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.company_legacy_owner_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_legacy_owner_id(uuid) TO service_role;
