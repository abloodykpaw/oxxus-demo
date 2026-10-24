-- Allow client intake with 1, 2, or 3 bureau PDFs (not all three required).
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
  has_experian boolean;
  has_equifax boolean;
  has_transunion boolean;
  bureau_count int;
  complete_mode boolean;
  new_report_id uuid;
  report_ids jsonb := '[]'::jsonb;
  analysis_name text;
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

  has_experian := nullif(trim(coalesce(p_experian_path, '')), '') is not null
    and nullif(trim(coalesce(p_experian_file_name, '')), '') is not null;
  has_equifax := nullif(trim(coalesce(p_equifax_path, '')), '') is not null
    and nullif(trim(coalesce(p_equifax_file_name, '')), '') is not null;
  has_transunion := nullif(trim(coalesce(p_transunion_path, '')), '') is not null
    and nullif(trim(coalesce(p_transunion_file_name, '')), '') is not null;

  if (nullif(trim(coalesce(p_experian_path, '')), '') is not null)
    is distinct from (nullif(trim(coalesce(p_experian_file_name, '')), '') is not null) then
    raise exception 'Experian path and file name must be provided together' using errcode = '22023';
  end if;
  if (nullif(trim(coalesce(p_equifax_path, '')), '') is not null)
    is distinct from (nullif(trim(coalesce(p_equifax_file_name, '')), '') is not null) then
    raise exception 'Equifax path and file name must be provided together' using errcode = '22023';
  end if;
  if (nullif(trim(coalesce(p_transunion_path, '')), '') is not null)
    is distinct from (nullif(trim(coalesce(p_transunion_file_name, '')), '') is not null) then
    raise exception 'TransUnion path and file name must be provided together' using errcode = '22023';
  end if;

  bureau_count := (has_experian::int + has_equifax::int + has_transunion::int);
  complete_mode := nullif(trim(coalesce(p_complete_path, '')), '') is not null
    and nullif(trim(coalesce(p_complete_file_name, '')), '') is not null;

  if (nullif(trim(coalesce(p_complete_path, '')), '') is not null)
    is distinct from (nullif(trim(coalesce(p_complete_file_name, '')), '') is not null) then
    raise exception 'Complete report path and file name must be provided together' using errcode = '22023';
  end if;

  if complete_mode and bureau_count > 0 then
    raise exception 'Submit either bureau PDFs or one complete report, not both' using errcode = '22023';
  end if;

  if not complete_mode and bureau_count = 0 then
    raise exception 'Submit at least one bureau PDF or one complete report' using errcode = '22023';
  end if;

  if has_experian and split_part(trim(p_experian_path), '/', 1) is distinct from linked_client::text then
    raise exception 'Invalid storage path' using errcode = '22023';
  end if;
  if has_equifax and split_part(trim(p_equifax_path), '/', 1) is distinct from linked_client::text then
    raise exception 'Invalid storage path' using errcode = '22023';
  end if;
  if has_transunion and split_part(trim(p_transunion_path), '/', 1) is distinct from linked_client::text then
    raise exception 'Invalid storage path' using errcode = '22023';
  end if;
  if complete_mode and split_part(trim(p_complete_path), '/', 1) is distinct from linked_client::text then
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

  if bureau_count > 0 then
    if has_experian then
      insert into public.credit_reports(case_id, provider, storage_path, processing_status, raw_summary)
      values (open_case, 'Experian', trim(p_experian_path), 'analysis_requested', jsonb_build_object('bureau', 'experian', 'intake_type', 'bureau')) returning id into new_report_id;
      report_ids := report_ids || jsonb_build_array(new_report_id);
      insert into public.documents(client_id, case_id, document_type, file_name, storage_path, verification_status)
      values (linked_client, open_case, 'credit_report_experian', trim(p_experian_file_name), trim(p_experian_path), 'pending');
    end if;
    if has_equifax then
      insert into public.credit_reports(case_id, provider, storage_path, processing_status, raw_summary)
      values (open_case, 'Equifax', trim(p_equifax_path), 'analysis_requested', jsonb_build_object('bureau', 'equifax', 'intake_type', 'bureau')) returning id into new_report_id;
      report_ids := report_ids || jsonb_build_array(new_report_id);
      insert into public.documents(client_id, case_id, document_type, file_name, storage_path, verification_status)
      values (linked_client, open_case, 'credit_report_equifax', trim(p_equifax_file_name), trim(p_equifax_path), 'pending');
    end if;
    if has_transunion then
      insert into public.credit_reports(case_id, provider, storage_path, processing_status, raw_summary)
      values (open_case, 'TransUnion', trim(p_transunion_path), 'analysis_requested', jsonb_build_object('bureau', 'transunion', 'intake_type', 'bureau')) returning id into new_report_id;
      report_ids := report_ids || jsonb_build_array(new_report_id);
      insert into public.documents(client_id, case_id, document_type, file_name, storage_path, verification_status)
      values (linked_client, open_case, 'credit_report_transunion', trim(p_transunion_file_name), trim(p_transunion_path), 'pending');
    end if;
    analysis_name := case bureau_count
      when 1 then 'OXXUS Bureau Credit Analysis'
      when 2 then 'OXXUS 2-Bureau Credit Analysis'
      else 'OXXUS 3-Bureau Credit Analysis'
    end;
  else
    insert into public.credit_reports(case_id, provider, storage_path, processing_status, raw_summary)
    values (open_case, 'Client supplied complete report', trim(p_complete_path), 'analysis_requested', jsonb_build_object('intake_type', 'complete_report')) returning id into new_report_id;
    report_ids := jsonb_build_array(new_report_id);
    insert into public.documents(client_id, case_id, document_type, file_name, storage_path, verification_status)
    values (linked_client, open_case, 'credit_report', trim(p_complete_file_name), trim(p_complete_path), 'pending');
    analysis_name := 'OXXUS Credit Analysis';
  end if;

  update public.cases set
    next_action = 'Revisión del Asistente OXXUS',
    registry_source = case when registry_source = 'invite' then 'invite' else 'client_onboarding' end,
    updated_at = now()
  where id = open_case;

  return jsonb_build_object('ok', true, 'client_id', linked_client, 'case_id', open_case, 'case_number', case_number,
    'report_ids', report_ids, 'analysis_name', analysis_name, 'bureau_count', bureau_count);
end;
$$;

revoke all on function public.client_submit_credit_reports(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.client_submit_credit_reports(text, text, text, text, text, text, text, text) to authenticated;
