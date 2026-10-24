-- Restore web_collaborator in admin_set_user_role after 018 dropped it,
-- and keep auth.users app_metadata.role synchronized.

create or replace function public.admin_set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'You cannot change your own administrator role' using errcode = '22023';
  end if;
  if p_role not in ('admin', 'repair_agent', 'client', 'web_collaborator') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;

  update public.profiles
  set role = p_role::public.app_role,
      updated_at = now()
  where id = p_user_id;

  update auth.users
  set raw_app_meta_data =
        coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_role),
      updated_at = now()
  where id = p_user_id;
end;
$$;

revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
