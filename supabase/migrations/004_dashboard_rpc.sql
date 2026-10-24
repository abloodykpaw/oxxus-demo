create or replace function public.get_dashboard_cases()
returns jsonb
language plpgsql security definer stable set search_path=public as $$
begin
  if not exists (select 1 from public.profiles where id=auth.uid() and role in ('admin','specialist','reviewer')) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',ca.id,'case_number',ca.case_number,'client_id',ca.client_id,'level',ca.level,
    'duration_weeks',ca.duration_weeks,'current_week',ca.current_week,'status',ca.status,
    'next_action',ca.next_action,'clients',to_jsonb(cl),
    'credit_reports',coalesce((select jsonb_agg(jsonb_build_object('credit_scores',coalesce((select jsonb_agg(jsonb_build_object('bureau',cs.bureau,'score',cs.score)) from public.credit_scores cs where cs.report_id=cr.id),'[]'::jsonb))) from public.credit_reports cr where cr.case_id=ca.id),'[]'::jsonb),
    'credit_accounts',coalesce((select jsonb_agg(jsonb_build_object('id',ac.id,'creditor_name',ac.creditor_name,'balance',ac.balance,'issue_type',ac.issue_type,'bureaus',ac.bureaus,'status',ac.status) order by ac.created_at) from public.credit_accounts ac where ac.case_id=ca.id),'[]'::jsonb)
  ) order by ca.case_number) from public.cases ca join public.clients cl on cl.id=ca.client_id),'[]'::jsonb);
end $$;
revoke all on function public.get_dashboard_cases() from public;
grant execute on function public.get_dashboard_cases() to authenticated;
