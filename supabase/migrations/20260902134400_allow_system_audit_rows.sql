-- Legacy database triggers also write audit rows during trusted background work.
-- Those sessions do not have an auth.uid(), so retain nullable user_id while RLS
-- keeps such system rows unavailable through the client API.
alter table public.audit_logs alter column user_id drop not null;

notify pgrst, 'reload schema';
