-- Edge Functions (invite-user) use the service_role key via PostgREST.
-- Without these grants, invite-user cannot read clients/profiles and fails with
-- "No puedes invitar a ese cliente." before any email is sent.
-- Intentionally omit DELETE: invite rollback soft-deactivates clients instead.

grant select, insert, update on public.clients to service_role;
grant select, insert, update on public.profiles to service_role;
grant select, insert, update on public.invitations to service_role;
grant select, insert, update on public.cases to service_role;

