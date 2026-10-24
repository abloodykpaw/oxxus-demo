-- P0–P3 foundation: protected accounts, audit, copiloto drafts, governed KB

alter table public.credit_accounts
  add column if not exists account_class text,
  add column if not exists account_status_norm text,
  add column if not exists is_protected boolean not null default false,
  add column if not exists protection_reason text,
  add column if not exists classification_source text,
  add column if not exists classification_confidence numeric(4,3);

do $$ begin
  alter table public.credit_accounts
    add constraint credit_accounts_account_class_check
    check (account_class is null or account_class in (
      'revolving','installment','collection','inquiry','other'
    ));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.credit_accounts
    add constraint credit_accounts_status_norm_check
    check (account_status_norm is null or account_status_norm in (
      'open','closed','charged_off','collection','unknown'
    ));
exception when duplicate_object then null;
end $$;

create index if not exists credit_accounts_protected_idx
  on public.credit_accounts(case_id) where is_protected;

create table if not exists public.account_audit_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.credit_accounts(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.copilot_drafts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  account_id uuid references public.credit_accounts(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  draft_type text not null default 'letter',
  title text not null,
  body text not null,
  template_key text,
  citations jsonb not null default '[]'::jsonb,
  status text not null default 'suggested'
    check (status in ('suggested','approved','rejected','sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.copilot_feedback (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid references public.copilot_drafts(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  rating text not null check (rating in ('useful','incorrect')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null default 'sop',
  status text not null default 'draft'
    check (status in ('draft','published','archived')),
  current_version int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.kb_documents(id) on delete cascade,
  version_number int not null,
  body text not null,
  source_urls text[] not null default '{}',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(document_id, version_number)
);

create table if not exists public.kb_change_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.kb_documents(id) on delete set null,
  title text not null,
  proposal text not null,
  source_url text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  requested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.account_audit_log enable row level security;
alter table public.copilot_drafts enable row level security;
alter table public.copilot_feedback enable row level security;
alter table public.kb_documents enable row level security;
alter table public.kb_versions enable row level security;
alter table public.kb_change_requests enable row level security;

drop policy if exists "team read account audit" on public.account_audit_log;
create policy "team read account audit" on public.account_audit_log
  for select using (public.is_admin() or public.is_repair_agent());

drop policy if exists "admins insert account audit" on public.account_audit_log;
create policy "admins insert account audit" on public.account_audit_log
  for insert with check (public.is_admin() or public.is_repair_agent());

drop policy if exists "team manages copiloto drafts" on public.copilot_drafts;
create policy "team manages copiloto drafts" on public.copilot_drafts
  for all using (
    public.is_admin()
    or (public.is_repair_agent() and public.can_manage_case(case_id))
  ) with check (
    public.is_admin()
    or (public.is_repair_agent() and public.can_manage_case(case_id))
  );

drop policy if exists "team manages copiloto feedback" on public.copilot_feedback;
create policy "team manages copiloto feedback" on public.copilot_feedback
  for all using (public.is_admin() or public.is_repair_agent())
  with check (public.is_admin() or public.is_repair_agent());

drop policy if exists "team read kb docs" on public.kb_documents;
create policy "team read kb docs" on public.kb_documents
  for select using (public.is_admin() or public.is_repair_agent());

drop policy if exists "admins manage kb docs" on public.kb_documents;
create policy "admins manage kb docs" on public.kb_documents
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "team read kb versions" on public.kb_versions;
create policy "team read kb versions" on public.kb_versions
  for select using (public.is_admin() or public.is_repair_agent());

drop policy if exists "admins manage kb versions" on public.kb_versions;
create policy "admins manage kb versions" on public.kb_versions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "team manage kb change requests" on public.kb_change_requests;
create policy "team manage kb change requests" on public.kb_change_requests
  for all using (public.is_admin() or public.is_repair_agent())
  with check (public.is_admin() or public.is_repair_agent());

grant select, insert on public.account_audit_log to authenticated;
grant select, insert, update, delete on public.copilot_drafts to authenticated;
grant select, insert on public.copilot_feedback to authenticated;
grant select, insert, update, delete on public.kb_documents to authenticated;
grant select, insert, update, delete on public.kb_versions to authenticated;
grant select, insert, update on public.kb_change_requests to authenticated;

create or replace function public.guard_protected_credit_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  override_ok boolean := false;
begin
  if tg_op = 'DELETE' then
    if old.is_protected then
      insert into public.account_audit_log(account_id, case_id, actor_id, action, detail)
      values (old.id, old.case_id, auth.uid(), 'blocked_delete', jsonb_build_object(
        'creditor_name', old.creditor_name,
        'protection_reason', old.protection_reason
      ));
      raise exception 'Protected account cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;

  if old.is_protected then
    begin
      override_ok := coalesce(current_setting('oxxus.protection_override', true), '') = '1'
        and public.is_admin();
    exception when others then
      override_ok := false;
    end;

    if not override_ok and (
      new.creditor_name is distinct from old.creditor_name
      or new.account_number_masked is distinct from old.account_number_masked
      or new.is_protected is distinct from old.is_protected
      or new.account_class is distinct from old.account_class
      or new.account_status_norm is distinct from old.account_status_norm
    ) then
      insert into public.account_audit_log(account_id, case_id, actor_id, action, detail)
      values (old.id, old.case_id, auth.uid(), 'blocked_update', jsonb_build_object(
        'creditor_name', old.creditor_name,
        'attempted', row_to_json(new)
      ));
      raise exception 'Protected account cannot be modified without admin override'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_protected_credit_account on public.credit_accounts;
create trigger guard_protected_credit_account
  before update or delete on public.credit_accounts
  for each row execute function public.guard_protected_credit_account();

create or replace function public.admin_override_account_protection(
  p_account_id uuid,
  p_reason text,
  p_set_protected boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'Override reason required' using errcode = '22023';
  end if;

  perform set_config('oxxus.protection_override', '1', true);

  update public.credit_accounts
  set is_protected = p_set_protected,
      protection_reason = case when p_set_protected then coalesce(protection_reason, 'manual') else null end,
      classification_source = 'agent',
      updated_at = now()
  where id = p_account_id;

  insert into public.account_audit_log(account_id, case_id, actor_id, action, detail)
  select ac.id, ac.case_id, auth.uid(), 'admin_override',
    jsonb_build_object('reason', p_reason, 'is_protected', p_set_protected)
  from public.credit_accounts ac where ac.id = p_account_id;

  return jsonb_build_object('ok', true, 'account_id', p_account_id, 'is_protected', p_set_protected);
end;
$$;

revoke all on function public.admin_override_account_protection(uuid, text, boolean) from public, anon;
grant execute on function public.admin_override_account_protection(uuid, text, boolean) to authenticated;

create or replace function public.classify_case_accounts(p_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count int := 0;
begin
  if not (public.is_admin() or (public.is_repair_agent() and public.can_manage_case(p_case_id))) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.credit_accounts ac
  set
    account_class = case
      when lower(coalesce(ac.issue_type,'')) like '%collection%' then 'collection'
      when lower(coalesce(ac.account_type,'')) ~ '(card|revolving|credit.?card)' then 'revolving'
      when lower(coalesce(ac.account_type,'')) ~ '(auto|mortgage|install|loan|student)' then 'installment'
      when lower(coalesce(ac.creditor_name,'')) ~ '(visa|mastercard|amex|discover|capital one|chase|citi|bank of america|synchrony|credit card)'
        and coalesce(ac.is_negative, true) = false then 'revolving'
      else coalesce(ac.account_class, 'other')
    end,
    account_status_norm = case
      when lower(coalesce(ac.issue_type,'')) like '%collection%' then 'collection'
      when lower(coalesce(ac.issue_type,'')) like '%charge%' then 'charged_off'
      when coalesce(ac.is_negative, true) = false then 'open'
      else coalesce(ac.account_status_norm, 'unknown')
    end,
    is_protected = case
      when lower(coalesce(ac.issue_type,'')) ~ '(collection|charge.?off|late|derogatory)' then false
      when coalesce(ac.is_negative, true) = false
        and (
          lower(coalesce(ac.account_type,'')) ~ '(card|revolving|credit.?card)'
          or lower(coalesce(ac.creditor_name,'')) ~ '(visa|mastercard|amex|discover|capital one|chase|citi|bank of america|synchrony|credit card)'
        ) then true
      else ac.is_protected
    end,
    protection_reason = case
      when lower(coalesce(ac.issue_type,'')) ~ '(collection|charge.?off|late|derogatory)' then null
      when coalesce(ac.is_negative, true) = false
        and (
          lower(coalesce(ac.account_type,'')) ~ '(card|revolving|credit.?card)'
          or lower(coalesce(ac.creditor_name,'')) ~ '(visa|mastercard|amex|discover|capital one|chase|citi|bank of america|synchrony|credit card)'
        ) then 'open_revolving'
      else ac.protection_reason
    end,
    classification_source = 'parser',
    classification_confidence = case
      when lower(coalesce(ac.issue_type,'')) ~ '(collection|charge.?off)' then 0.92
      when coalesce(ac.is_negative, true) = false
        and lower(coalesce(ac.account_type,'')) ~ '(card|revolving)' then 0.88
      else 0.55
    end,
    updated_at = now()
  where ac.case_id = p_case_id
    and not ac.is_protected;

  get diagnostics updated_count = row_count;

  insert into public.account_audit_log(account_id, case_id, actor_id, action, detail)
  select null, p_case_id, auth.uid(), 'classify_batch',
    jsonb_build_object('updated', updated_count);

  return jsonb_build_object('ok', true, 'updated', updated_count);
end;
$$;

revoke all on function public.classify_case_accounts(uuid) from public, anon;
grant execute on function public.classify_case_accounts(uuid) to authenticated;

-- Seed governed KB from Letter Library categories (published)
insert into public.kb_documents(slug, title, category, status, current_version)
values
  ('oxxus-operating-principles', 'Principios operativos del copiloto OXXUS', 'sop', 'published', 1),
  ('protected-accounts-policy', 'Politica de cuentas protegidas', 'policy', 'published', 1),
  ('letter-selection-guide', 'Guia de seleccion de cartas', 'sop', 'published', 1)
on conflict (slug) do nothing;

insert into public.kb_versions(document_id, version_number, body, source_urls, approved_at)
select d.id, 1, v.body, '{}', now()
from public.kb_documents d
join (
  values
    ('oxxus-operating-principles', E'El copiloto asiste al agente de reparacion. No envia disputas solo. No promete score. Toda carta es borrador hasta aprobacion humana. Knowledge base curada; internet solo allowlist oficial con cita.'),
    ('protected-accounts-policy', E'Las tarjetas y creditos vigentes (revolving/installment open) se marcan is_protected. No se borran ni se editan campos criticos sin override de admin documentado. La IA clasifica; Postgres impone.'),
    ('letter-selection-guide', E'Usar LetterLibrary: collections → Debt Validation / Collection Account Dispute; charge-off → Charge-Off Account Dispute; late → Late Payment Dispute; identity → Identity Theft Block. Adaptar al expediente y evidencia.')
) as v(slug, body) on v.slug = d.slug
where not exists (
  select 1 from public.kb_versions kv where kv.document_id = d.id and kv.version_number = 1
);

-- Extend dashboard payload with protection fields
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
