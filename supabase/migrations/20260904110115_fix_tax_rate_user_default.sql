begin;

-- New tenant records must be attributed to the signed-in actor. The legacy
-- fallback is intentionally unavailable to authenticated Data API clients.
alter table public.tax_rates
  alter column user_id set default auth.uid();

notify pgrst, 'reload schema';
commit;
