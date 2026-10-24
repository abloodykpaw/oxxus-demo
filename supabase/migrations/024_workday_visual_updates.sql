insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workday-visuals',
  'workday-visuals',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "workday visuals insert own" on storage.objects;
create policy "workday visuals insert own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'workday-visuals'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'web_collaborator', 'repair_agent', 'specialist', 'reviewer')
  )
);

drop policy if exists "workday visuals select team" on storage.objects;
create policy "workday visuals select team"
on storage.objects for select
to authenticated
using (
  bucket_id = 'workday-visuals'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists "workday visuals update own" on storage.objects;
create policy "workday visuals update own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'workday-visuals'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
)
with check (
  bucket_id = 'workday-visuals'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

drop policy if exists "workday visuals delete own" on storage.objects;
create policy "workday visuals delete own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'workday-visuals'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

create or replace function public.record_visual_work_activity(
  p_title text,
  p_detail text,
  p_before_path text,
  p_after_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_session_id uuid;
  activity_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = current_user_id
      and p.role in ('admin', 'web_collaborator', 'repair_agent', 'specialist', 'reviewer')
  ) then
    raise exception 'Team access required';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'A title is required';
  end if;

  if p_before_path not like current_user_id::text || '/%'
     or p_after_path not like current_user_id::text || '/%' then
    raise exception 'Invalid image path';
  end if;

  current_session_id := public.touch_work_session('presence', null, null);

  insert into public.work_activity_entries (
    session_id,
    user_id,
    activity_type,
    title,
    detail,
    metadata
  ) values (
    current_session_id,
    current_user_id,
    'visual_update',
    trim(p_title),
    nullif(trim(coalesce(p_detail, '')), ''),
    jsonb_build_object(
      'before_path', p_before_path,
      'after_path', p_after_path
    )
  )
  returning id into activity_id;

  return activity_id;
end;
$$;

revoke all on function public.record_visual_work_activity(text, text, text, text) from public;
revoke all on function public.record_visual_work_activity(text, text, text, text) from anon;
grant execute on function public.record_visual_work_activity(text, text, text, text) to authenticated;
