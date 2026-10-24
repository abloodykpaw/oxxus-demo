-- Step 1 intake: mark client-submitted reports as analysis_requested for Agent Assist queue.
create or replace function public.client_submit_credit_reports(
  p_experian_path text default null,
  p_experian_file_name text default null,
  p_equifax_path text default null,
  p_equifax_file_name text default null,
  p_transunion_path text default null,
  p_transunion_file_name text default null,
  p_complete_path text default null,
  p_complete_file_name text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_client uuid;
  ensured jsonb;
  open_case uuid;
  case_number text;
  three_mode boolean;
  complete_mode boolean;
  new_report_id uuid;
  report_ids jsonb := '[]'::jsonb;
begin
  if public.current_role() is distinct from 'client' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select p.client_id into linked_client from public.profiles p where p.id = (select auth.uid());
  if linked_client is null then
    select c.id into linked_client from public.clients c
    where c.owner_user_id = (select auth.uid()) order by c.created_at desc limit 1;
  end if;
  if linked_client is null then
    raise exception 'No client record is linked to this account' using errcode = 'P0002';
  end if;

  three_mode := nullif(trim(coalesce(p_experian_path, '')), '') is not null
    and nullif(trim(coalesce(p_equifax_path, '')), '') is not null
    and nullif(trim(coalesce(p_transunion_path, '')), '') is not null
    and nullif(trim(coalesce(p_experian_file_name, '')), '') is not null
    and nullif(trim(coalesce(p_equifax_file_name, '')), '') is not null
    and nullif(trim(coalesce(p_transunion_file_name, '')), '') is not null;
  complete_mode := nullif(trim(coalesce(p_complete_path, '')), '') is not null
    and nullif(trim(coalesce(p_complete_file_name, '')), '') is not null;

  if three_mode = complete_mode then
    raise exception 'Submit either all three bureau reports or one complete report' using errcode = '22023';
  end if;

  if (three_mode and (
      split_part(trim(p_experian_path), '/', 1) is distinct from linked_client::text
      or split_part(trim(p_equifax_path), '/', 1) is distinct from linked_client::text
      or split_part(trim(p_transunion_path), '/', 1) is distinct from linked_client::text
    )) or (complete_mode and split_part(trim(p_complete_path), '/', 1) is distinct from linked_client::text) then
    raise exception 'Invalid storage path' using errcode = '22023';
  end if;

  update public.clients set owner_user_id = coalesce(owner_user_id, (select auth.uid())), updated_at = now() where id = linked_client;
  update public.profiles set client_id = linked_client, updated_at = now() where id = (select auth.uid());
  ensured := public.ensure_client_case(linked_client, 'client_onboarding', null, (select auth.uid()));
  open_case := (ensured ->> 'case_id')::uuid;
  case_number := ensured ->> 'case_number';

  if exists(select 1 from public.credit_reports cr where cr.case_id = open_case) then
    raise exception 'Credit reports are already registered for this case' using errcode = '23505';
  end if;

  if three_mode then
    insert into public.credit_reports(case_id, provider, storage_path, processing_status, raw_summary)
    values (open_case, 'Experian', trim(p_experian_path), 'analysis_requested', jsonb_build_object('bureau', 'experian', 'intake_type', 'three_bureau')) returning id into new_report_id;
    report_ids := report_ids || jsonb_build_array(new_report_id);
    insert into public.credit_reports(case_id, provider, storage_path, processing_status, raw_summary)
    values (open_case, 'Equifax', trim(p_equifax_path), 'analysis_requested', jsonb_build_object('bureau', 'equifax', 'intake_type', 'three_bureau')) returning id into new_report_id;
    report_ids := report_ids || jsonb_build_array(new_report_id);
    insert into public.credit_reports(case_id, provider, storage_path, processing_status, raw_summary)
    values (open_case, 'TransUnion', trim(p_transunion_path), 'analysis_requested', jsonb_build_object('bureau', 'transunion', 'intake_type', 'three_bureau')) returning id into new_report_id;
    report_ids := report_ids || jsonb_build_array(new_report_id);
    insert into public.documents(client_id, case_id, document_type, file_name, storage_path, verification_status) values
      (linked_client, open_case, 'credit_report_experian', trim(p_experian_file_name), trim(p_experian_path), 'pending'),
      (linked_client, open_case, 'credit_report_equifax', trim(p_equifax_file_name), trim(p_equifax_path), 'pending'),
      (linked_client, open_case, 'credit_report_transunion', trim(p_transunion_file_name), trim(p_transunion_path), 'pending');
  else
    insert into public.credit_reports(case_id, provider, storage_path, processing_status, raw_summary)
    values (open_case, 'Client supplied complete report', trim(p_complete_path), 'analysis_requested', jsonb_build_object('intake_type', 'complete_report')) returning id into new_report_id;
    report_ids := jsonb_build_array(new_report_id);
    insert into public.documents(client_id, case_id, document_type, file_name, storage_path, verification_status)
    values (linked_client, open_case, 'credit_report', trim(p_complete_file_name), trim(p_complete_path), 'pending');
  end if;

  update public.cases set
    next_action = 'Revisión del Asistente OXXUS',
    registry_source = case when registry_source = 'invite' then 'invite' else 'client_onboarding' end,
    updated_at = now()
  where id = open_case;

  return jsonb_build_object('ok', true, 'client_id', linked_client, 'case_id', open_case, 'case_number', case_number,
    'report_ids', report_ids, 'analysis_name', case when three_mode then 'OXXUS 3-Bureau Credit Analysis' else 'OXXUS Credit Analysis' end);
end;
$$;

revoke all on function public.client_submit_credit_reports(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.client_submit_credit_reports(text, text, text, text, text, text, text, text) to authenticated;
