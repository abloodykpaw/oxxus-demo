-- Client self-onboarding: invited users complete their own profile + credit report.
-- Team invite creates auth user + clients row; case/report can wait until the client finishes.

create or replace function public.client_onboarding_status()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  viewer_role public.app_role;
  linked_client uuid;
  client_row public.clients;
  open_case public.cases;
  has_report boolean := false;
  incomplete boolean := true;
begin
  viewer_role := public.current_role();
  if viewer_role is distinct from 'client' then
    return jsonb_build_object('role', viewer_role, 'needs_onboarding', false);
  end if;

  select p.client_id into linked_client from public.profiles p where p.id = (select auth.uid());
  if linked_client is null then
    select c.id into linked_client
    from public.clients c
    where c.owner_user_id = (select auth.uid())
    order by c.created_at desc
    limit 1;
  end if;

  if linked_client is null then
    return jsonb_build_object(
      'role', 'client',
      'needs_onboarding', true,
      'client_id', null,
      'case_id', null,
      'has_report', false,
      'profile_incomplete', true
    );
  end if;

  select * into client_row from public.clients where id = linked_client;
  incomplete :=
    nullif(trim(client_row.first_name), '') is null
    or nullif(trim(client_row.last_name), '') is null
    or nullif(trim(coalesce(client_row.phone, '')), '') is null
    or nullif(trim(coalesce(client_row.address_line1, '')), '') is null
    or nullif(trim(coalesce(client_row.city, '')), '') is null
    or nullif(trim(coalesce(client_row.state, '')), '') is null
    or nullif(trim(coalesce(client_row.postal_code, '')), '') is null;

  select * into open_case
  from public.cases ca
  where ca.client_id = linked_client
  order by ca.created_at desc
  limit 1;

  if open_case.id is not null then
    select exists(
      select 1 from public.credit_reports cr where cr.case_id = open_case.id
    ) into has_report;
  end if;

  return jsonb_build_object(
    'role', 'client',
    'needs_onboarding', incomplete or open_case.id is null or not has_report,
    'client_id', linked_client,
    'case_id', open_case.id,
    'case_number', open_case.case_number,
    'has_report', has_report,
    'profile_incomplete', incomplete,
    'client', to_jsonb(client_row)
  );
end;
$$;

revoke all on function public.client_onboarding_status() from public, anon;
grant execute on function public.client_onboarding_status() to authenticated;

create or replace function public.client_complete_onboarding(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_storage_path text,
  p_file_name text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_role public.app_role;
  linked_client uuid;
  open_case uuid;
  case_number text;
  next_number integer;
  report_id uuid;
begin
  viewer_role := public.current_role();
  if viewer_role is distinct from 'client' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if nullif(trim(p_first_name), '') is null
     or nullif(trim(p_last_name), '') is null
     or nullif(trim(p_phone), '') is null
     or nullif(trim(p_address_line1), '') is null
     or nullif(trim(p_city), '') is null
     or nullif(trim(p_state), '') is null
     or nullif(trim(p_postal_code), '') is null
     or nullif(trim(p_storage_path), '') is null
     or nullif(trim(p_file_name), '') is null then
    raise exception 'All profile fields and the credit report are required' using errcode = '22023';
  end if;

  select p.client_id into linked_client from public.profiles p where p.id = (select auth.uid());
  if linked_client is null then
    select c.id into linked_client
    from public.clients c
    where c.owner_user_id = (select auth.uid())
    order by c.created_at desc
    limit 1;
  end if;
  if linked_client is null then
    raise exception 'No client record is linked to this account' using errcode = 'P0002';
  end if;

  if split_part(trim(p_storage_path), '/', 1) is distinct from linked_client::text then
    raise exception 'Invalid storage path' using errcode = '22023';
  end if;

  update public.clients
  set first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      phone = trim(p_phone),
      address_line1 = trim(p_address_line1),
      address_line2 = nullif(trim(p_address_line2), ''),
      city = trim(p_city),
      state = upper(trim(p_state)),
      postal_code = trim(p_postal_code),
      owner_user_id = coalesce(owner_user_id, (select auth.uid())),
      updated_at = now()
  where id = linked_client;

  update public.profiles
  set full_name = trim(p_first_name) || ' ' || trim(p_last_name),
      client_id = linked_client,
      updated_at = now()
  where id = (select auth.uid());

  select ca.id, ca.case_number into open_case, case_number
  from public.cases ca
  where ca.client_id = linked_client
  order by ca.created_at desc
  limit 1;

  if open_case is null then
    select coalesce(max((substring(c.case_number from '[0-9]+$'))::integer), 0) + 1
    into next_number
    from public.cases c;
    case_number := 'OXX-' || lpad(next_number::text, 3, '0');
    insert into public.cases(
      case_number, client_id, assigned_to, level, suggested_level,
      duration_weeks, current_week, status, next_action
    )
    values (
      case_number, linked_client,
      (select agent_id from public.clients where id = linked_client),
      null, null, null, 1, 'draft',
      'Analizar el reporte de crédito cargado'
    )
    returning id into open_case;
  end if;

  if exists(select 1 from public.credit_reports cr where cr.case_id = open_case) then
    raise exception 'A credit report is already registered for this case' using errcode = '23505';
  end if;

  insert into public.credit_reports(case_id, provider, storage_path, processing_status)
  values (open_case, 'Client uploaded credit report', trim(p_storage_path), 'uploaded')
  returning id into report_id;

  insert into public.documents(client_id, case_id, document_type, file_name, storage_path, verification_status)
  values (linked_client, open_case, 'credit_report', trim(p_file_name), trim(p_storage_path), 'pending');

  update public.cases
  set next_action = 'Analizar el reporte de crédito cargado',
      updated_at = now()
  where id = open_case;

  return jsonb_build_object(
    'ok', true,
    'client_id', linked_client,
    'case_id', open_case,
    'case_number', case_number,
    'report_id', report_id
  );
end;
$$;

revoke all on function public.client_complete_onboarding(text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.client_complete_onboarding(text, text, text, text, text, text, text, text, text, text) to authenticated;

drop policy if exists "clients upload own stored files" on storage.objects;
create policy "clients upload own stored files" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'client-documents'
  and exists (
    select 1
    from public.clients c
    where c.id::text = (storage.foldername(name))[1]
      and c.owner_user_id = (select auth.uid())
  )
);

