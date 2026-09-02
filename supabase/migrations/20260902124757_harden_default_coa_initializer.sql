-- Restrict the authenticated COA bootstrap RPC.
--
-- initialize_default_coa() verifies auth.uid() and creates records only for
-- that user. Explicit grants prevent the SECURITY DEFINER routine from being
-- exposed through PostgreSQL's default PUBLIC function privilege.

revoke all on function public.initialize_default_coa() from public;
revoke all on function public.initialize_default_coa() from anon;
grant execute on function public.initialize_default_coa() to authenticated;

notify pgrst, 'reload schema';
