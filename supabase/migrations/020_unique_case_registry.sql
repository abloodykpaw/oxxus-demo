-- Unique case registry: sequential OXX numbers + ensure case exists for admins from invite day.

create sequence if not exists public.case_number_seq;

do $$
declare
  max_n integer;
begin
  select coalesce(max((substring(case_number from '[0-9]+$'))::integer), 0)
  into max_n
  from public.cases;
  perform setval('public.case_number_seq', greatest(max_n, 1), max_n > 0);
end $$;

alter table public.cases
  add column if not exists registry_source text not null default 'team'
    check (registry_source in ('team', 'invite', 'client_onboarding')),
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create or replace function public.allocate_case_number()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_n bigint;
begin
  next_n := nextval('public.case_number_seq');
  return 'OXX-' || lpad(next_n::text, 4, '0');
end;
$$;

revoke all on function public.allocate_case_number() from public, anon;
grant execute on function public.allocate_case_number() to authenticated, service_role;

create or replace function public.ensure_client_case(
  p_client_id uuid,
  p_source text default 'invite',
  p_assigned_to uuid default null,
  p_created_by uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_role public.app_role;
  existing public.cases;
  new_case uuid;
  new_number text;
  assigned uuid;
  jwt_role text;
begin
  viewer_role := public.current_role();
  jwt_role := coalesce(auth.jwt() ->> 'role', '');

  if jwt_role is distinct from 'service_role'
     and viewer_role is distinct from 'admin'
     and viewer_role is distinct from 'repair_agent'
     and viewer_role is distinct from 'client' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if viewer_role = 'client'
     and not exists(
       select 1 from public.clients c
       where c.id = p_client_id and c.owner_user_id = (select auth.uid())
     ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if viewer_role = 'repair_agent'
     and not public.can_manage_client(p_client_id)
     and jwt_role is distinct from 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_source not in ('team', 'invite', 'client_onboarding') then
    raise exception 'Invalid registry source' using errcode = '22023';
  end if;

  if not exists(select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'Client not found' using errcode = 'P0002';
  end if;

  select * into existing
  from public.cases ca
  where ca.client_id = p_client_id
  order by ca.created_at desc
  limit 1;

  if existing.id is not null then
    if p_assigned_to is not null and existing.assigned_to is null then
      update public.cases
      set assigned_to = p_assigned_to, updated_at = now()
      where id = existing.id;
    end if;
    return jsonb_build_object(
      'case_id', existing.id,
      'case_number', existing.case_number,
      'client_id', p_client_id,
      'created', false
    );
  end if;

  assigned := coalesce(
    p_assigned_to,
    (select c.agent_id from public.clients c where c.id = p_client_id)
  );
  new_number := public.allocate_case_number();

  insert into public.cases(
    case_number, client_id, assigned_to, level, suggested_level,
    duration_weeks, current_week, status, next_action,
    registry_source, created_by
  )
  values (
    new_number, p_client_id, assigned, null, null,
    null, 1, 'draft',
    case
      when p_source = 'invite' then 'Esperando que el cliente complete datos y suba su reporte'
      when p_source = 'client_onboarding' then 'Analizar el reporte de crédito cargado'
      else 'Analizar el reporte de crédito cargado'
    end,
    p_source,
    coalesce(p_created_by, (select auth.uid()))
  )
  returning id into new_case;

  return jsonb_build_object(
    'case_id', new_case,
    'case_number', new_number,
    'client_id', p_client_id,
    'created', true
  );
end;
$$;

revoke all on function public.ensure_client_case(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.ensure_client_case(uuid, text, uuid, uuid) to authenticated, service_role;

-- Team create_case uses sequential registry numbers.
create or replace function public.create_case(
  p_first_name text,
  p_last_name text,
  p_email text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_role public.app_role;
  existing_user uuid;
  existing_role public.app_role;
  linked_client uuid;
  responsible_agent uuid;
  ensured jsonb;
begin
  viewer_role := public.current_role();
  if viewer_role not in ('admin', 'repair_agent') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if nullif(trim(p_first_name), '') is null
     or nullif(trim(p_last_name), '') is null
     or nullif(trim(p_email), '') is null then
    raise exception 'Name and email are required' using errcode = '22023';
  end if;

  select u.id, p.role, p.client_id
  into existing_user, existing_role, linked_client
  from auth.users u
  left join public.profiles p on p.id = u.id
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  responsible_agent := case
    when existing_role = 'repair_agent' then existing_user
    when viewer_role = 'repair_agent' then (select auth.uid())
    else null
  end;

  if linked_client is null then
    insert into public.clients(first_name, last_name, email, status, owner_user_id, agent_id)
    values (
      trim(p_first_name), trim(p_last_name), lower(trim(p_email)),
      'active', existing_user, responsible_agent
    )
    returning id into linked_client;
    if existing_user is not null then
      update public.profiles
      set client_id = linked_client, updated_at = now()
      where id = existing_user;
    end if;
  else
    update public.clients
    set first_name = trim(p_first_name),
        last_name = trim(p_last_name),
        email = lower(trim(p_email)),
        owner_user_id = coalesce(owner_user_id, existing_user),
        agent_id = coalesce(agent_id, responsible_agent),
        updated_at = now()
    where id = linked_client;
  end if;

  ensured := public.ensure_client_case(
    linked_client,
    'team',
    responsible_agent,
    (select auth.uid())
  );

  update public.cases
  set next_action = 'Analizar el reporte de crédito cargado',
      registry_source = 'team',
      updated_at = now()
  where id = (ensured ->> 'case_id')::uuid;

  return jsonb_build_object(
    'case_number', ensured ->> 'case_number',
    'case_id', ensured ->> 'case_id',
    'client_id', linked_client,
    'existing_user', existing_user is not null
  );
end;
$$;

-- Client onboarding attaches report to the existing unique case registry.
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
  ensured jsonb;
  open_case uuid;
  case_number text;
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

  ensured := public.ensure_client_case(
    linked_client,
    'client_onboarding',
    null,
    (select auth.uid())
  );
  open_case := (ensured ->> 'case_id')::uuid;
  case_number := ensured ->> 'case_number';

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
    'report_id', report_id
  );
end;
$$;

create or replace function public.get_dashboard_cases()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  viewer_role public.app_role;
begin
  viewer_role := public.current_role();
  if viewer_role is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', ca.id,
      'case_number', ca.case_number,
      'client_id', ca.client_id,
      'level', ca.level,
      'duration_weeks', ca.duration_weeks,
      'current_week', ca.current_week,
      'status', ca.status,
      'next_action', ca.next_action,
      'assigned_to', ca.assigned_to,
      'created_at', ca.created_at,
      'updated_at', ca.updated_at,
      'registry_source', ca.registry_source,
      'has_report', exists(select 1 from public.credit_reports cr where cr.case_id = ca.id),
      'document_count', (
        select count(*)::int from public.documents d where d.case_id = ca.id
      ),
      'clients', to_jsonb(cl) || jsonb_build_object(
        'access_status', case
          when cl.owner_user_id is null then 'not_invited'
          when exists(
            select 1 from auth.users au
            where au.id = cl.owner_user_id and au.email_confirmed_at is not null
          ) then 'confirmed'
          else 'pending'
        end
      ),
      'credit_reports', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', cr.id,
          'storage_path', cr.storage_path,
          'processing_status', cr.processing_status,
          'created_at', cr.created_at,
          'credit_scores', coalesce((
            select jsonb_agg(jsonb_build_object('bureau', cs.bureau, 'score', cs.score))
            from public.credit_scores cs where cs.report_id = cr.id
          ), '[]'::jsonb)
        ))
        from (
          select * from public.credit_reports
          where case_id = ca.id
          order by created_at desc
          limit 1
        ) cr
      ), '[]'::jsonb),
      'credit_accounts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ac.id,
          'creditor_name', ac.creditor_name,
          'balance', ac.balance,
          'issue_type', ac.issue_type,
          'bureaus', ac.bureaus,
          'status', ac.status
        ) order by ac.created_at)
        from public.credit_accounts ac where ac.case_id = ca.id
      ), '[]'::jsonb)
    ) order by ca.created_at desc)
    from public.cases ca
    join public.clients cl on cl.id = ca.client_id
    where viewer_role = 'admin'
       or (
         viewer_role = 'repair_agent'
         and (ca.assigned_to = (select auth.uid()) or cl.agent_id = (select auth.uid()))
       )
       or (viewer_role = 'client' and cl.owner_user_id = (select auth.uid()))
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_case_detail(p_case_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  viewer_role public.app_role;
  allowed boolean := false;
  payload jsonb;
begin
  viewer_role := public.current_role();
  if viewer_role is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select
    viewer_role = 'admin'
    or public.can_manage_case(p_case_id)
    or exists(
      select 1
      from public.cases ca
      join public.clients cl on cl.id = ca.client_id
      where ca.id = p_case_id and cl.owner_user_id = (select auth.uid())
    )
  into allowed;

  if not coalesce(allowed, false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', ca.id,
    'case_number', ca.case_number,
    'client_id', ca.client_id,
    'level', ca.level,
    'duration_weeks', ca.duration_weeks,
    'current_week', ca.current_week,
    'status', ca.status,
    'next_action', ca.next_action,
    'assigned_to', ca.assigned_to,
    'created_at', ca.created_at,
    'updated_at', ca.updated_at,
    'registry_source', ca.registry_source,
    'created_by', ca.created_by,
    'clients', to_jsonb(cl),
    'credit_reports', coalesce((
      select jsonb_agg(to_jsonb(cr) order by cr.created_at desc)
      from public.credit_reports cr where cr.case_id = ca.id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.created_at desc)
      from public.documents d where d.case_id = ca.id or d.client_id = ca.client_id
    ), '[]'::jsonb),
    'credit_accounts', coalesce((
      select jsonb_agg(to_jsonb(ac) order by ac.created_at)
      from public.credit_accounts ac where ac.case_id = ca.id
    ), '[]'::jsonb)
  )
  into payload
  from public.cases ca
  join public.clients cl on cl.id = ca.client_id
  where ca.id = p_case_id;

  return payload;
end;
$$;

revoke all on function public.get_case_detail(uuid) from public, anon;
grant execute on function public.get_case_detail(uuid) to authenticated;

