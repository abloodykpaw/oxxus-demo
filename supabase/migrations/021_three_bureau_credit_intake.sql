create or replace function public.client_complete_three_bureau_onboarding(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_experian_path text,
  p_experian_file_name text,
  p_equifax_path text,
  p_equifax_file_name text,
  p_transunion_path text,
  p_transunion_file_name text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_role public.app_role;
  linked_client uuid;
  ensured jsonb;
  open_case uuid;
  case_number text;
  report_ids jsonb := '[]'::jsonb;
  new_report_id uuid;
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
     or nullif(trim(p_experian_path), '') is null
     or nullif(trim(p_experian_file_name), '') is null
     or nullif(trim(p_equifax_path), '') is null
     or nullif(trim(p_equifax_file_name), '') is null
     or nullif(trim(p_transunion_path), '') is null
     or nullif(trim(p_transunion_file_name), '') is null then
    raise exception 'All profile fields and all three credit reports are required' using errcode = '22023';
  end if;

  select p.client_id into linked_client
  from public.profiles p
  where p.id = (select auth.uid());

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

  if split_part(trim(p_experian_path), '/', 1) is distinct from linked_client::text
     or split_part(trim(p_equifax_path), '/', 1) is distinct from linked_client::text
     or split_part(trim(p_transunion_path), '/', 1) is distinct from linked_client::text then
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

  ensured := public.ensure_client_case(
    linked_client,
    'client_onboarding',
    null,
    (select auth.uid())
  );
  open_case := (ensured ->> 'case_id')::uuid;
  case_number := ensured ->> 'case_number';

  if exists(select 1 from public.credit_reports cr where cr.case_id = open_case) then
    raise exception 'Credit reports are already registered for this case' using errcode = '23505';
  end if;

  insert into public.credit_reports(case_id, provider, storage_path, processing_status, raw_summary)
  values (
    open_case,
    'Experian',
    trim(p_experian_path),
    'uploaded',
    jsonb_build_object('bureau', 'experian', 'intake_type', 'three_bureau')
  ) returning id into new_report_id;
  report_ids := report_ids || jsonb_build_array(new_report_id);

  insert into public.credit_reports(case_id, provider, storage_path, processing_status, raw_summary)
  values (
    open_case,
    'Equifax',
    trim(p_equifax_path),
    'uploaded',
    jsonb_build_object('bureau', 'equifax', 'intake_type', 'three_bureau')
  ) returning id into new_report_id;
  report_ids := report_ids || jsonb_build_array(new_report_id);

  insert into public.credit_reports(case_id, provider, storage_path, processing_status, raw_summary)
  values (
    open_case,
    'TransUnion',
    trim(p_transunion_path),
    'uploaded',
    jsonb_build_object('bureau', 'transunion', 'intake_type', 'three_bureau')
  ) returning id into new_report_id;
  report_ids := report_ids || jsonb_build_array(new_report_id);

  insert into public.documents(
    client_id,
    case_id,
    document_type,
    file_name,
    storage_path,
    verification_status
  ) values
    (linked_client, open_case, 'credit_report_experian', trim(p_experian_file_name), trim(p_experian_path), 'pending'),
    (linked_client, open_case, 'credit_report_equifax', trim(p_equifax_file_name), trim(p_equifax_path), 'pending'),
    (linked_client, open_case, 'credit_report_transunion', trim(p_transunion_file_name), trim(p_transunion_path), 'pending');

  update public.cases
  set next_action = 'Preparar análisis comparativo de los tres burós',
      registry_source = case
        when registry_source = 'invite' then 'invite'
        else 'client_onboarding'
      end,
      updated_at = now()
  where id = open_case;

  return jsonb_build_object(
    'ok', true,
    'client_id', linked_client,
    'case_id', open_case,
    'case_number', case_number,
    'report_ids', report_ids,
    'analysis_name', 'OXXUS 3-Bureau Credit Analysis'
  );
end;
$$;

revoke all on function public.client_complete_three_bureau_onboarding(
  text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) from public, anon;

grant execute on function public.client_complete_three_bureau_onboarding(
  text, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) to authenticated;
