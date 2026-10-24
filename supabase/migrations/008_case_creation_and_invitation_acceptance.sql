create or replace function public.create_case(
  p_first_name text,p_last_name text,p_email text,p_level smallint,p_weeks smallint
) returns jsonb language plpgsql security definer set search_path=public as $$
declare viewer_role public.app_role; new_client uuid; new_case uuid; new_number text; next_number integer;
begin
  viewer_role:=public.current_role();
  if viewer_role not in ('admin','repair_agent') then raise exception 'Not authorized' using errcode='42501'; end if;
  select coalesce(max((substring(case_number from '[0-9]+$'))::integer),0)+1 into next_number from public.cases;
  new_number:='OXX-'||lpad(next_number::text,3,'0');
  insert into public.clients(first_name,last_name,email,status,agent_id)
  values(trim(p_first_name),trim(p_last_name),nullif(trim(p_email),''),'active',case when viewer_role='repair_agent' then auth.uid() else null end)
  returning id into new_client;
  insert into public.cases(case_number,client_id,assigned_to,level,suggested_level,duration_weeks,current_week,status,next_action)
  values(new_number,new_client,case when viewer_role='repair_agent' then auth.uid() else null end,p_level,p_level,p_weeks,1,'draft','Subir y analizar reporte de crédito')
  returning id into new_case;
  return jsonb_build_object('case_number',new_number,'case_id',new_case,'client_id',new_client);
end $$;
revoke all on function public.create_case(text,text,text,smallint,smallint) from public,anon;
grant execute on function public.create_case(text,text,text,smallint,smallint) to authenticated;

create or replace function public.mark_invitation_accepted() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.invitations set status='accepted',accepted_at=now()
    where auth_user_id=new.id and status='pending';
  end if;
  return new;
end $$;
drop trigger if exists auth_user_accepts_invitation on auth.users;
create trigger auth_user_accepts_invitation after update of email_confirmed_at on auth.users
for each row execute function public.mark_invitation_accepted();
revoke all on function public.mark_invitation_accepted() from public,anon,authenticated;
