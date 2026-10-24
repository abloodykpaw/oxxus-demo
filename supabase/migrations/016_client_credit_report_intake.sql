drop policy if exists "clients upload own credit reports" on storage.objects;
create policy "clients upload own credit reports" on storage.objects for insert to authenticated
with check (
  bucket_id='client-documents'
  and exists(
    select 1 from public.clients c
    where c.id::text=(storage.foldername(name))[1]
      and c.owner_user_id=(select auth.uid())
  )
);

drop policy if exists "clients register own credit reports" on public.credit_reports;
create policy "clients register own credit reports" on public.credit_reports for insert to authenticated
with check (
  exists(
    select 1 from public.cases ca
    join public.clients cl on cl.id=ca.client_id
    where ca.id=credit_reports.case_id
      and cl.owner_user_id=(select auth.uid())
  )
);

drop policy if exists "clients register own documents" on public.documents;
create policy "clients register own documents" on public.documents for insert to authenticated
with check (
  exists(
    select 1 from public.clients cl
    where cl.id=documents.client_id
      and cl.owner_user_id=(select auth.uid())
  )
  and (
    documents.case_id is null
    or exists(
      select 1 from public.cases ca
      where ca.id=documents.case_id
        and ca.client_id=documents.client_id
    )
  )
);

create or replace function public.get_dashboard_cases()
returns jsonb language plpgsql security definer stable set search_path='' as $$
declare viewer_role public.app_role;
begin
  viewer_role:=public.current_role();
  if viewer_role is null then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',ca.id,'case_number',ca.case_number,'client_id',ca.client_id,'level',ca.level,
    'duration_weeks',ca.duration_weeks,'current_week',ca.current_week,'status',ca.status,
    'next_action',ca.next_action,'assigned_to',ca.assigned_to,
    'clients',to_jsonb(cl)||jsonb_build_object('access_status',case
      when cl.owner_user_id is null then 'not_invited'
      when exists(select 1 from auth.users au where au.id=cl.owner_user_id and au.email_confirmed_at is not null) then 'confirmed'
      else 'pending' end),
    'credit_reports',coalesce((select jsonb_agg(jsonb_build_object(
      'id',cr.id,'provider',cr.provider,'processing_status',cr.processing_status,
      'raw_summary',cr.raw_summary,'created_at',cr.created_at,
      'credit_scores',coalesce((select jsonb_agg(jsonb_build_object('bureau',cs.bureau,'score',cs.score)) from public.credit_scores cs where cs.report_id=cr.id),'[]'::jsonb)
    )) from (select * from public.credit_reports where case_id=ca.id order by created_at desc limit 1) cr),'[]'::jsonb),
    'credit_accounts',coalesce((select jsonb_agg(jsonb_build_object('id',ac.id,'creditor_name',ac.creditor_name,'balance',ac.balance,'issue_type',ac.issue_type,'bureaus',ac.bureaus,'status',ac.status) order by ac.created_at) from public.credit_accounts ac where ac.case_id=ca.id),'[]'::jsonb)
  ) order by ca.case_number) from public.cases ca join public.clients cl on cl.id=ca.client_id
  where viewer_role='admin'
     or (viewer_role='repair_agent' and (ca.assigned_to=(select auth.uid()) or cl.agent_id=(select auth.uid())))
     or (viewer_role='client' and cl.owner_user_id=(select auth.uid()))),'[]'::jsonb);
end $$;
revoke all on function public.get_dashboard_cases() from public,anon;
grant execute on function public.get_dashboard_cases() to authenticated;
