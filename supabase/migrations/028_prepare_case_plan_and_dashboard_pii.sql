-- 028: prepare_case_plan RPC + narrow PII in get_dashboard_cases

create or replace function public.prepare_case_plan(
  p_case_id uuid,
  p_level smallint default 2,
  p_duration_weeks smallint default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_role public.app_role;
  weeks smallint;
  w smallint;
  week_id uuid;
  objectives text[];
  objective text;
  existing_weeks int;
  mailing_body text;
begin
  viewer_role := public.current_role();
  if viewer_role is null
     or not (public.is_admin() or (public.is_repair_agent() and public.can_manage_case(p_case_id))) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_level is null or p_level < 1 or p_level > 4 then
    raise exception 'Level must be between 1 and 4' using errcode = '22023';
  end if;

  weeks := coalesce(
    p_duration_weeks,
    case p_level
      when 1 then 4
      when 2 then 6
      when 3 then 8
      else 10
    end
  );
  if weeks < 3 or weeks > 12 then
    raise exception 'Duration weeks must be between 3 and 12' using errcode = '22023';
  end if;

  update public.cases
  set
    level = p_level,
    suggested_level = coalesce(suggested_level, p_level),
    duration_weeks = weeks,
    current_week = greatest(coalesce(current_week, 1), 1),
    status = case
      when status = 'draft'::public.case_status then 'active'::public.case_status
      else status
    end,
    next_action = 'Revisar el plan semanal',
    updated_at = now()
  where id = p_case_id;

  if not found then
    raise exception 'Case not found' using errcode = 'P0002';
  end if;

  update public.credit_reports
  set processing_status = 'analyzed'
  where case_id = p_case_id
    and lower(coalesce(processing_status, '')) in ('analysis_requested', 'uploaded', 'pending');

  select count(*)::int into existing_weeks
  from public.case_weeks
  where case_id = p_case_id;

  if existing_weeks = 0 then
    objectives := array[
      'Semana 1: Revisar reporte, clasificar cuentas y confirmar protegidas',
      'Semana 2: Cartas iniciales a burós (información y cuentas prioritarias)',
      'Semana 3: Validación / disputa directa a acreedores o cobradores',
      'Semana 4: Seguimiento de respuestas y método de verificación',
      'Semana 5: Segunda ronda de disputas según evidencia',
      'Semana 6: Revisión de archivo y ajustes del plan',
      'Semana 7: Cartas de seguimiento y reinvestigación',
      'Semana 8: Escalamiento o consolidación de resultados',
      'Semana 9: Revisión intermedia de puntajes y cuentas',
      'Semana 10: Ronda dirigida a ítems restantes',
      'Semana 11: Preparar cierre o extensión del plan',
      'Semana 12: Revisión final y próxima acción con el cliente'
    ];

    mailing_body := E'[CLIENT FULL NAME]\n[STREET ADDRESS]\n[CITY, STATE ZIP]\n\nDate: ____ / ____ / ______\n\n[RECIPIENT NAME]\n[RECIPIENT ADDRESS]\n[CITY, STATE ZIP]\n\nRe: [ACCOUNT NAME / MASKED ACCOUNT NUMBER]\n\nDear Sir or Madam:\n\nI am writing regarding information associated with the account or matter referenced above. Please investigate and correct or delete any information that is incomplete, inaccurate, or unverifiable.\n\nPlease send the results of your investigation in writing.\n\nSincerely,\n\n[CLIENT FULL NAME]\n';

    for w in 1..weeks loop
      objective := objectives[least(w, array_length(objectives, 1))];
      insert into public.case_weeks(case_id, week_number, objective, status)
      values (p_case_id, w, objective, 'planned')
      returning id into week_id;

      insert into public.weekly_mailings(
        case_week_id,
        case_id,
        sequence_number,
        title,
        recipient_name,
        recipient_address,
        letter_body,
        envelope_notes,
        enclosures,
        status
      ) values (
        week_id,
        p_case_id,
        1,
        format('Week %s dispute letter (draft)', w),
        'Credit bureau / furnisher TBD',
        null,
        mailing_body,
        'White #10 envelope. Return address top-left; recipient centered.',
        array['Signed letter', 'ID copy', 'Proof of address', 'Highlighted report pages']::text[],
        'planned'
      );
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'case_id', p_case_id,
    'level', p_level,
    'duration_weeks', weeks,
    'weeks_created', existing_weeks = 0,
    'week_count', weeks
  );
end;
$$;

revoke all on function public.prepare_case_plan(uuid, smallint, smallint) from public, anon;
grant execute on function public.prepare_case_plan(uuid, smallint, smallint) to authenticated;

-- Narrow client PII on dashboard list (no DOB / SSN last4)
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
      'clients', jsonb_build_object(
        'id', cl.id,
        'first_name', cl.first_name,
        'last_name', cl.last_name,
        'email', cl.email,
        'phone', cl.phone,
        'address_line1', cl.address_line1,
        'address_line2', cl.address_line2,
        'city', cl.city,
        'state', cl.state,
        'postal_code', cl.postal_code,
        'agent_id', cl.agent_id,
        'owner_user_id', cl.owner_user_id,
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
          'provider', cr.provider,
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
          'status', ac.status,
          'account_type', ac.account_type,
          'account_class', ac.account_class,
          'account_status_norm', ac.account_status_norm,
          'is_protected', ac.is_protected,
          'protection_reason', ac.protection_reason,
          'classification_source', ac.classification_source,
          'classification_confidence', ac.classification_confidence
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

revoke all on function public.get_dashboard_cases() from public, anon;
grant execute on function public.get_dashboard_cases() to authenticated;
