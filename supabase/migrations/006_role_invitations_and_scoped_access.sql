alter type public.app_role add value if not exists 'repair_agent';

alter table public.profiles add column if not exists invited_by uuid references public.profiles(id) on delete set null;
alter table public.clients add column if not exists agent_id uuid references public.profiles(id) on delete set null;
create index if not exists clients_agent_idx on public.clients(agent_id);
create index if not exists cases_assigned_idx on public.cases(assigned_to);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  role public.app_role not null,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  agent_id uuid references public.profiles(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','expired','cancelled')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique(email,status)
);
create index if not exists invitations_invited_by_idx on public.invitations(invited_by);
alter table public.invitations enable row level security;

create or replace function public.current_role() returns public.app_role
language sql security definer stable set search_path=public as $$
  select role from public.profiles where id=auth.uid()
$$;
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path=public as $$
  select coalesce(public.current_role()='admin',false)
$$;
create or replace function public.is_repair_agent() returns boolean
language sql security definer stable set search_path=public as $$
  select coalesce(public.current_role()='repair_agent',false)
$$;
create or replace function public.can_manage_client(target_client uuid) returns boolean
language sql security definer stable set search_path=public as $$
  select public.is_admin() or exists(
    select 1 from public.clients c where c.id=target_client and c.agent_id=auth.uid()
  )
$$;
create or replace function public.can_manage_case(target_case uuid) returns boolean
language sql security definer stable set search_path=public as $$
  select public.is_admin() or exists(
    select 1 from public.cases ca join public.clients cl on cl.id=ca.client_id
    where ca.id=target_case and (ca.assigned_to=auth.uid() or cl.agent_id=auth.uid())
  )
$$;
create or replace function public.is_team_member() returns boolean
language sql security definer stable set search_path=public as $$
  select public.is_admin() or public.is_repair_agent()
$$;

drop policy if exists "team manages profiles" on public.profiles;
drop policy if exists "team manages clients" on public.clients;
drop policy if exists "team manages cases" on public.cases;
drop policy if exists "team manages credit_reports" on public.credit_reports;
drop policy if exists "team manages credit_accounts" on public.credit_accounts;
drop policy if exists "team manages case_weeks" on public.case_weeks;
drop policy if exists "team manages disputes" on public.disputes;
drop policy if exists "team manages letters" on public.letters;
drop policy if exists "team manages case_activity" on public.case_activity;
drop policy if exists "team manages scores" on public.credit_scores;
drop policy if exists "team manages documents" on public.documents;
drop policy if exists "team manages client files" on storage.objects;

create policy "admins manage profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage clients" on public.clients for all using (public.is_admin()) with check (public.is_admin());
create policy "agents manage assigned clients" on public.clients for all
  using (agent_id=auth.uid() and public.is_repair_agent())
  with check (agent_id=auth.uid() and public.is_repair_agent());
create policy "admins manage cases" on public.cases for all using (public.is_admin()) with check (public.is_admin());
create policy "agents manage assigned cases" on public.cases for all
  using (public.is_repair_agent() and public.can_manage_client(client_id))
  with check (public.is_repair_agent() and public.can_manage_client(client_id));

create policy "admins manage reports" on public.credit_reports for all using (public.is_admin()) with check (public.is_admin());
create policy "agents manage reports" on public.credit_reports for all using (public.can_manage_case(case_id) and public.is_repair_agent()) with check (public.can_manage_case(case_id) and public.is_repair_agent());
create policy "admins manage accounts" on public.credit_accounts for all using (public.is_admin()) with check (public.is_admin());
create policy "agents manage accounts" on public.credit_accounts for all using (public.can_manage_case(case_id) and public.is_repair_agent()) with check (public.can_manage_case(case_id) and public.is_repair_agent());
create policy "admins manage weeks" on public.case_weeks for all using (public.is_admin()) with check (public.is_admin());
create policy "agents manage weeks" on public.case_weeks for all using (public.can_manage_case(case_id) and public.is_repair_agent()) with check (public.can_manage_case(case_id) and public.is_repair_agent());
create policy "admins manage disputes" on public.disputes for all using (public.is_admin()) with check (public.is_admin());
create policy "agents manage disputes" on public.disputes for all using (public.can_manage_case(case_id) and public.is_repair_agent()) with check (public.can_manage_case(case_id) and public.is_repair_agent());
create policy "admins manage letters" on public.letters for all using (public.is_admin()) with check (public.is_admin());
create policy "agents manage letters" on public.letters for all using (public.can_manage_case(case_id) and public.is_repair_agent()) with check (public.can_manage_case(case_id) and public.is_repair_agent());
create policy "admins manage activity" on public.case_activity for all using (public.is_admin()) with check (public.is_admin());
create policy "agents manage activity" on public.case_activity for all using (public.can_manage_case(case_id) and public.is_repair_agent()) with check (public.can_manage_case(case_id) and public.is_repair_agent());
create policy "admins manage scores" on public.credit_scores for all using (public.is_admin()) with check (public.is_admin());
create policy "agents manage scores" on public.credit_scores for all
  using (public.is_repair_agent() and exists(select 1 from public.credit_reports r where r.id=report_id and public.can_manage_case(r.case_id)))
  with check (public.is_repair_agent() and exists(select 1 from public.credit_reports r where r.id=report_id and public.can_manage_case(r.case_id)));
create policy "admins manage documents" on public.documents for all using (public.is_admin()) with check (public.is_admin());
create policy "agents manage documents" on public.documents for all using (public.is_repair_agent() and public.can_manage_client(client_id)) with check (public.is_repair_agent() and public.can_manage_client(client_id));

create policy "admins manage invitations" on public.invitations for all using (public.is_admin()) with check (public.is_admin());
create policy "agents manage client invitations" on public.invitations for all
  using (public.is_repair_agent() and invited_by=auth.uid() and role='client')
  with check (public.is_repair_agent() and invited_by=auth.uid() and role='client' and agent_id=auth.uid());

create policy "admins manage client files" on storage.objects for all
  using (bucket_id='client-documents' and public.is_admin())
  with check (bucket_id='client-documents' and public.is_admin());
create policy "agents manage assigned client files" on storage.objects for all
  using (bucket_id='client-documents' and public.is_repair_agent() and exists(select 1 from public.clients c where c.id::text=(storage.foldername(name))[1] and c.agent_id=auth.uid()))
  with check (bucket_id='client-documents' and public.is_repair_agent() and exists(select 1 from public.clients c where c.id::text=(storage.foldername(name))[1] and c.agent_id=auth.uid()));

create or replace function public.get_dashboard_cases()
returns jsonb language plpgsql security definer stable set search_path=public as $$
declare viewer_role public.app_role;
begin
  viewer_role:=public.current_role();
  if viewer_role is null then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',ca.id,'case_number',ca.case_number,'client_id',ca.client_id,'level',ca.level,
    'duration_weeks',ca.duration_weeks,'current_week',ca.current_week,'status',ca.status,
    'next_action',ca.next_action,'assigned_to',ca.assigned_to,'clients',to_jsonb(cl),
    'credit_reports',coalesce((select jsonb_agg(jsonb_build_object('credit_scores',coalesce((select jsonb_agg(jsonb_build_object('bureau',cs.bureau,'score',cs.score)) from public.credit_scores cs where cs.report_id=cr.id),'[]'::jsonb))) from public.credit_reports cr where cr.case_id=ca.id),'[]'::jsonb),
    'credit_accounts',coalesce((select jsonb_agg(jsonb_build_object('id',ac.id,'creditor_name',ac.creditor_name,'balance',ac.balance,'issue_type',ac.issue_type,'bureaus',ac.bureaus,'status',ac.status) order by ac.created_at) from public.credit_accounts ac where ac.case_id=ca.id),'[]'::jsonb)
  ) order by ca.case_number) from public.cases ca join public.clients cl on cl.id=ca.client_id
  where viewer_role='admin'
     or (viewer_role='repair_agent' and (ca.assigned_to=auth.uid() or cl.agent_id=auth.uid()))
     or (viewer_role='client' and cl.owner_user_id=auth.uid())),'[]'::jsonb);
end $$;

update public.profiles p set role='repair_agent'
from auth.users u where p.id=u.id and lower(u.email)=lower('tusaludinsurance@gmail.com');

grant select,insert,update,delete on public.invitations to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_repair_agent() to authenticated;
grant execute on function public.can_manage_client(uuid) to authenticated;
grant execute on function public.can_manage_case(uuid) to authenticated;
