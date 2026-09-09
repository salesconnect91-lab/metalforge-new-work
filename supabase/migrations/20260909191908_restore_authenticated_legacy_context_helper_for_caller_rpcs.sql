-- Restore authenticated use of the legacy tenant-row owner resolver used by existing ERP RPCs.
-- The function resolves the current authorized company context; callers cannot supply a company id.
-- Keep the lower-level company owner lookup helper internal-only.

REVOKE ALL ON FUNCTION public.legacy_data_user_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.legacy_data_user_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.company_legacy_owner_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_legacy_owner_id(uuid) TO service_role;
