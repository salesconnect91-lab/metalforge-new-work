-- assert_module_permission is a read-only authorization gate used by both SECURITY DEFINER
-- and SECURITY INVOKER public RPCs. Revoking it from authenticated breaks valid
-- invoker RPCs such as create_customer_with_ar/create_supplier_with_ap.
-- Direct execution only performs the same permission check and mutates no data.
REVOKE ALL ON FUNCTION public.assert_module_permission(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_module_permission(text,text) TO authenticated, service_role;
