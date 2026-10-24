create table if not exists public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active','closed','afk_closed')),
  display_name text not null,
  role text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.work_activity_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.work_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null default 'note',
  title text not null,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists work_sessions_user_date_idx on public.work_sessions(user_id,work_date desc);
create index if not exists work_sessions_last_activity_idx on public.work_sessions(last_activity_at desc);
create index if not exists work_activity_session_idx on public.work_activity_entries(session_id,created_at);

alter table public.work_sessions enable row level security;
alter table public.work_activity_entries enable row level security;

drop policy if exists "team views permitted work sessions" on public.work_sessions;
create policy "team views permitted work sessions" on public.work_sessions for select
using (user_id=auth.uid() or public.is_admin());

drop policy if exists "team views permitted work activities" on public.work_activity_entries;
create policy "team views permitted work activities" on public.work_activity_entries for select
using (user_id=auth.uid() or public.is_admin());

create or replace function public.touch_work_session(
  p_activity_type text default 'presence',
  p_title text default null,
  p_detail text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  current_profile public.profiles%rowtype;
  current_session public.work_sessions%rowtype;
  local_date date := (now() at time zone 'America/New_York')::date;
begin
  select * into current_profile from public.profiles where id=auth.uid();
  if current_profile.id is null or current_profile.role not in ('admin','web_collaborator','repair_agent','specialist','reviewer') then
    raise exception 'workday access denied';
  end if;

  select * into current_session
  from public.work_sessions
  where user_id=auth.uid() and status='active'
  order by last_activity_at desc
  limit 1;

  if current_session.id is not null and current_session.last_activity_at < now()-interval '6 hours' then
    update public.work_sessions
    set status='afk_closed',ended_at=current_session.last_activity_at
    where id=current_session.id;
    current_session.id := null;
  end if;

  if current_session.id is null or current_session.work_date<>local_date then
    if current_session.id is not null then
      update public.work_sessions set status='closed',ended_at=last_activity_at where id=current_session.id;
    end if;
    insert into public.work_sessions(user_id,work_date,display_name,role)
    values(auth.uid(),local_date,coalesce(current_profile.full_name,split_part(coalesce(auth.jwt()->>'email','Equipo OXXUS'),'@',1)),current_profile.role::text)
    returning * into current_session;
    insert into public.work_activity_entries(session_id,user_id,activity_type,title,detail)
    values(current_session.id,auth.uid(),'session_start','Inicio de jornada','Primera actividad registrada en OXXUS.');
  else
    update public.work_sessions set last_activity_at=now() where id=current_session.id;
  end if;

  if nullif(trim(coalesce(p_title,'')),'') is not null then
    insert into public.work_activity_entries(session_id,user_id,activity_type,title,detail)
    values(current_session.id,auth.uid(),coalesce(nullif(trim(p_activity_type),''),'note'),trim(p_title),nullif(trim(coalesce(p_detail,'')),''));
  end if;
  return current_session.id;
end;
$$;

create or replace function public.finish_work_session(p_note text default null) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare current_session public.work_sessions%rowtype;
begin
  select * into current_session from public.work_sessions
  where user_id=auth.uid() and status='active'
  order by last_activity_at desc limit 1;
  if current_session.id is null then return null; end if;
  if nullif(trim(coalesce(p_note,'')),'') is not null then
    insert into public.work_activity_entries(session_id,user_id,activity_type,title,detail)
    values(current_session.id,auth.uid(),'session_end','Cierre de jornada',trim(p_note));
  else
    insert into public.work_activity_entries(session_id,user_id,activity_type,title,detail)
    values(current_session.id,auth.uid(),'session_end','Cierre de jornada','Jornada finalizada por el usuario.');
  end if;
  update public.work_sessions set status='closed',last_activity_at=now(),ended_at=now() where id=current_session.id;
  return current_session.id;
end;
$$;

grant select on public.work_sessions,public.work_activity_entries to authenticated;
grant execute on function public.touch_work_session(text,text,text) to authenticated;
grant execute on function public.finish_work_session(text) to authenticated;
