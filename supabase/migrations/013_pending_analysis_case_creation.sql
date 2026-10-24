-- New cases begin without a guessed level or duration. Those values are added
-- only after the uploaded credit report has been analyzed.
alter table public.cases alter column level drop not null;
alter table public.cases alter column duration_weeks drop not null;

drop function if exists public.create_case(text,text,text,smallint,smallint);
drop function if exists public.create_case(text,text,text);

create function public.create_case(
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
  new_case uuid;
  new_number text;
  next_number integer;
begin
  viewer_role := public.current_role();
  if viewer_role not in ('admin','repair_agent') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if nullif(trim(p_first_name),'') is null or nullif(trim(p_last_name),'') is null or nullif(trim(p_email),'') is null then
    raise exception 'Name and email are required' using errcode='22023';
  end if;

  select u.id, p.role, p.client_id
  into existing_user, existing_role, linked_client
  from auth.users u
  left join public.profiles p on p.id=u.id
  where lower(u.email)=lower(trim(p_email))
  limit 1;

  responsible_agent := case
    when existing_role='repair_agent' then existing_user
    when viewer_role='repair_agent' then (select auth.uid())
    else null
  end;

  if linked_client is null then
    insert into public.clients(first_name,last_name,email,status,owner_user_id,agent_id)
    values(trim(p_first_name),trim(p_last_name),lower(trim(p_email)),'active',existing_user,responsible_agent)
    returning id into linked_client;
    if existing_user is not null then
      update public.profiles set client_id=linked_client,updated_at=now() where id=existing_user;
    end if;
  else
    update public.clients
    set first_name=trim(p_first_name),last_name=trim(p_last_name),email=lower(trim(p_email)),
        owner_user_id=coalesce(owner_user_id,existing_user),agent_id=coalesce(agent_id,responsible_agent),updated_at=now()
    where id=linked_client;
  end if;

  select coalesce(max((substring(case_number from '[0-9]+$'))::integer),0)+1
  into next_number from public.cases;
  new_number := 'OXX-'||lpad(next_number::text,3,'0');
  insert into public.cases(case_number,client_id,assigned_to,level,suggested_level,duration_weeks,current_week,status,next_action)
  values(new_number,linked_client,responsible_agent,null,null,null,1,'draft','Analizar el reporte de crédito cargado')
  returning id into new_case;

  return jsonb_build_object(
    'case_number',new_number,
    'case_id',new_case,
    'client_id',linked_client,
    'existing_user',existing_user is not null
  );
end $$;

revoke all on function public.create_case(text,text,text) from public,anon;
grant execute on function public.create_case(text,text,text) to authenticated;

drop policy if exists "clients view own stored files" on storage.objects;
create policy "clients view own stored files" on storage.objects for select to authenticated
using (
  bucket_id='client-documents'
  and exists(
    select 1 from public.clients c
    where c.id::text=(storage.foldername(name))[1]
      and c.owner_user_id=(select auth.uid())
  )
);
