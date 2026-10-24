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
    'credit_reports',coalesce((select jsonb_agg(jsonb_build_object('credit_scores',coalesce((select jsonb_agg(jsonb_build_object('bureau',cs.bureau,'score',cs.score)) from public.credit_scores cs where cs.report_id=cr.id),'[]'::jsonb))) from (select * from public.credit_reports where case_id=ca.id order by created_at desc limit 1) cr),'[]'::jsonb),
    'credit_accounts',coalesce((select jsonb_agg(jsonb_build_object('id',ac.id,'creditor_name',ac.creditor_name,'balance',ac.balance,'issue_type',ac.issue_type,'bureaus',ac.bureaus,'status',ac.status) order by ac.created_at) from public.credit_accounts ac where ac.case_id=ca.id),'[]'::jsonb)
  ) order by ca.case_number) from public.cases ca join public.clients cl on cl.id=ca.client_id
  where viewer_role='admin'
     or (viewer_role='repair_agent' and (ca.assigned_to=auth.uid() or cl.agent_id=auth.uid()))
     or (viewer_role='client' and cl.owner_user_id=auth.uid())),'[]'::jsonb);
end $$;
revoke all on function public.get_dashboard_cases() from public,anon;
grant execute on function public.get_dashboard_cases() to authenticated;
revoke all on function public.rls_auto_enable() from public,anon,authenticated;
