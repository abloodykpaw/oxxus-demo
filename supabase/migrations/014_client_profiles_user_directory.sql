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
    'credit_reports',coalesce((select jsonb_agg(jsonb_build_object('credit_scores',coalesce((select jsonb_agg(jsonb_build_object('bureau',cs.bureau,'score',cs.score)) from public.credit_scores cs where cs.report_id=cr.id),'[]'::jsonb))) from (select * from public.credit_reports where case_id=ca.id order by created_at desc limit 1) cr),'[]'::jsonb),
    'credit_accounts',coalesce((select jsonb_agg(jsonb_build_object('id',ac.id,'creditor_name',ac.creditor_name,'balance',ac.balance,'issue_type',ac.issue_type,'bureaus',ac.bureaus,'status',ac.status) order by ac.created_at) from public.credit_accounts ac where ac.case_id=ca.id),'[]'::jsonb)
  ) order by ca.case_number) from public.cases ca join public.clients cl on cl.id=ca.client_id
  where viewer_role='admin'
     or (viewer_role='repair_agent' and (ca.assigned_to=(select auth.uid()) or cl.agent_id=(select auth.uid())))
     or (viewer_role='client' and cl.owner_user_id=(select auth.uid()))),'[]'::jsonb);
end $$;
revoke all on function public.get_dashboard_cases() from public,anon;
grant execute on function public.get_dashboard_cases() to authenticated;

create or replace function public.update_client_details(
  p_client_id uuid,p_first_name text,p_last_name text,p_email text,p_phone text,
  p_address_line1 text,p_address_line2 text,p_city text,p_state text,p_postal_code text
) returns void language plpgsql security definer set search_path='' as $$
declare allowed boolean; full_name text; street_block text; city_block text; new_header text; new_signature text;
begin
  select public.can_manage_client(p_client_id) or exists(select 1 from public.clients c where c.id=p_client_id and c.owner_user_id=(select auth.uid())) into allowed;
  if not coalesce(allowed,false) then raise exception 'Not authorized' using errcode='42501'; end if;
  if nullif(trim(p_first_name),'') is null or nullif(trim(p_last_name),'') is null then raise exception 'Name is required' using errcode='22023'; end if;
  update public.clients set first_name=trim(p_first_name),last_name=trim(p_last_name),email=nullif(lower(trim(p_email)),''),phone=nullif(trim(p_phone),''),address_line1=nullif(trim(p_address_line1),''),address_line2=nullif(trim(p_address_line2),''),city=nullif(trim(p_city),''),state=nullif(upper(trim(p_state)),''),postal_code=nullif(trim(p_postal_code),''),updated_at=now() where id=p_client_id;
  full_name:=trim(p_first_name)||' '||trim(p_last_name);
  street_block:=coalesce(nullif(trim(p_address_line1),''),'RETURN ADDRESS TO BE CONFIRMED')||case when nullif(trim(p_address_line2),'') is not null then E'\n'||trim(p_address_line2) else '' end;
  city_block:=coalesce(nullif(concat_ws(', ',nullif(trim(p_city),''),nullif(upper(trim(p_state)),''),nullif(trim(p_postal_code),'')),''),'CITY, STATE ZIP');
  new_header:=concat('Date: ____ / ____ / ______',E'\n\n',full_name,E'\n',street_block,E'\n',city_block,E'\n\n','To:');
  new_signature:=concat('Sincerely,',E'\n\n\n',full_name,E'\n','Signature: ______________________________');
  update public.weekly_mailings wm set letter_body=regexp_replace(regexp_replace(wm.letter_body,'(?s)^Date:.*?\n\nTo:',new_header), '(?s)Sincerely,.*$',new_signature)
  where wm.case_id in (select ca.id from public.cases ca where ca.client_id=p_client_id);
end $$;
revoke all on function public.update_client_details(uuid,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.update_client_details(uuid,text,text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.get_user_directory()
returns jsonb language plpgsql security definer stable set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'full_name',p.full_name,'role',p.role,'client_id',p.client_id,'confirmed',u.email_confirmed_at is not null) order by p.full_name,u.email) from auth.users u join public.profiles p on p.id=u.id),'[]'::jsonb);
end $$;
revoke all on function public.get_user_directory() from public,anon;
grant execute on function public.get_user_directory() to authenticated;

create or replace function public.admin_set_user_role(p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_user_id=(select auth.uid()) then raise exception 'You cannot change your own administrator role' using errcode='22023'; end if;
  if p_role not in ('admin','repair_agent','client') then raise exception 'Invalid role' using errcode='22023'; end if;
  update public.profiles set role=p_role::public.app_role,updated_at=now() where id=p_user_id;
end $$;
revoke all on function public.admin_set_user_role(uuid,text) from public,anon;
grant execute on function public.admin_set_user_role(uuid,text) to authenticated;

create or replace function public.assign_client_to_agent(p_client_id uuid,p_agent_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_agent_id is not null and not exists(select 1 from public.profiles p where p.id=p_agent_id and p.role='repair_agent') then raise exception 'The selected user is not a repair agent' using errcode='22023'; end if;
  update public.clients set agent_id=p_agent_id,updated_at=now() where id=p_client_id;
  update public.cases set assigned_to=p_agent_id,updated_at=now() where client_id=p_client_id;
end $$;
revoke all on function public.assign_client_to_agent(uuid,uuid) from public,anon;
grant execute on function public.assign_client_to_agent(uuid,uuid) to authenticated;
