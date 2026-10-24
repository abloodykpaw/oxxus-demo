create table if not exists public.weekly_mailings (
  id uuid primary key default gen_random_uuid(),
  case_week_id uuid not null references public.case_weeks(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  sequence_number smallint not null default 1,
  title text not null,
  recipient_name text not null,
  recipient_address text,
  letter_body text not null,
  envelope_notes text not null default 'Sobre #10 blanco, escrito o impreso en tinta negra. Coloque remitente arriba a la izquierda y destinatario centrado.',
  enclosures text[] not null default '{}',
  status text not null default 'planned' check(status in ('planned','ready','sent')),
  sent_confirmed_by uuid references public.profiles(id) on delete set null,
  sent_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(case_week_id,sequence_number)
);
create index if not exists weekly_mailings_case_week_idx on public.weekly_mailings(case_week_id,sequence_number);
create index if not exists weekly_mailings_case_idx on public.weekly_mailings(case_id);
alter table public.weekly_mailings enable row level security;

create table if not exists public.score_progress (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  report_id uuid references public.credit_reports(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  transunion smallint check(transunion between 300 and 850),
  experian smallint check(experian between 300 and 850),
  equifax smallint check(equifax between 300 and 850),
  note text,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists score_progress_case_created_idx on public.score_progress(case_id,created_at desc);
create index if not exists score_progress_client_idx on public.score_progress(client_id);
create index if not exists score_progress_uploaded_by_idx on public.score_progress(uploaded_by);
alter table public.score_progress enable row level security;

create policy "authorized users view weekly mailings" on public.weekly_mailings for select to authenticated
using (
  (select public.can_manage_case(case_id)) or exists(
    select 1 from public.cases ca join public.clients cl on cl.id=ca.client_id
    where ca.id=weekly_mailings.case_id and cl.owner_user_id=(select auth.uid())
  )
);
create policy "authorized users view score progress" on public.score_progress for select to authenticated
using (
  (select public.can_manage_case(case_id)) or exists(
    select 1 from public.clients cl where cl.id=score_progress.client_id and cl.owner_user_id=(select auth.uid())
  )
);

grant select on public.weekly_mailings to authenticated;
grant select on public.score_progress to authenticated;

create or replace function public.confirm_weekly_mailing(p_mailing_id uuid,p_sent boolean)
returns public.weekly_mailings language plpgsql security definer set search_path=public as $$
declare item public.weekly_mailings; allowed boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  select * into item from public.weekly_mailings where id=p_mailing_id;
  if item.id is null then raise exception 'Mailing not found' using errcode='P0002'; end if;
  select public.can_manage_case(item.case_id) or exists(
    select 1 from public.cases ca join public.clients cl on cl.id=ca.client_id
    where ca.id=item.case_id and cl.owner_user_id=auth.uid()
  ) into allowed;
  if not allowed then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.weekly_mailings set status=case when p_sent then 'sent' else 'ready' end,
    sent_confirmed_by=case when p_sent then auth.uid() else null end,
    sent_confirmed_at=case when p_sent then now() else null end,
    updated_at=now() where id=p_mailing_id returning * into item;
  return item;
end $$;
revoke all on function public.confirm_weekly_mailing(uuid,boolean) from public,anon;
grant execute on function public.confirm_weekly_mailing(uuid,boolean) to authenticated;

create or replace function public.record_score_progress(
  p_case_id uuid,p_storage_path text,p_file_name text,p_transunion smallint,p_experian smallint,p_equifax smallint,p_note text
) returns public.score_progress language plpgsql security definer set search_path=public as $$
declare target_client uuid; allowed boolean; new_report uuid; result public.score_progress;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  select ca.client_id,
    public.can_manage_case(ca.id) or exists(select 1 from public.clients cl where cl.id=ca.client_id and cl.owner_user_id=auth.uid())
  into target_client,allowed from public.cases ca where ca.id=p_case_id;
  if target_client is null or not allowed then raise exception 'Not authorized' using errcode='42501'; end if;
  insert into public.credit_reports(case_id,provider,report_date,storage_path,processing_status,raw_summary)
  values(p_case_id,'Progress evidence',current_date,p_storage_path,'reviewed',jsonb_build_object('type','score_progress','uploaded_by',auth.uid())) returning id into new_report;
  if p_transunion is not null then insert into public.credit_scores(report_id,bureau,score) values(new_report,'transunion',p_transunion); end if;
  if p_experian is not null then insert into public.credit_scores(report_id,bureau,score) values(new_report,'experian',p_experian); end if;
  if p_equifax is not null then insert into public.credit_scores(report_id,bureau,score) values(new_report,'equifax',p_equifax); end if;
  insert into public.score_progress(case_id,client_id,report_id,storage_path,file_name,transunion,experian,equifax,note,uploaded_by)
  values(p_case_id,target_client,new_report,p_storage_path,p_file_name,p_transunion,p_experian,p_equifax,nullif(trim(p_note),''),auth.uid()) returning * into result;
  return result;
end $$;
revoke all on function public.record_score_progress(uuid,text,text,smallint,smallint,smallint,text) from public,anon;
grant execute on function public.record_score_progress(uuid,text,text,smallint,smallint,smallint,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('score-progress','score-progress',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "authorized users upload score evidence" on storage.objects for insert to authenticated
with check(bucket_id='score-progress' and exists(
  select 1 from public.clients cl where cl.id::text=(storage.foldername(name))[1]
  and (public.is_admin() or cl.agent_id=(select auth.uid()) or cl.owner_user_id=(select auth.uid()))
));
create policy "authorized users view score evidence" on storage.objects for select to authenticated
using(bucket_id='score-progress' and exists(
  select 1 from public.clients cl where cl.id::text=(storage.foldername(name))[1]
  and (public.is_admin() or cl.agent_id=(select auth.uid()) or cl.owner_user_id=(select auth.uid()))
));

insert into public.weekly_mailings(case_week_id,case_id,sequence_number,title,recipient_name,recipient_address,letter_body,enclosures,status)
select cw.id,cw.case_id,1,
  'Carta: '||cw.objective,
  case when lower(cw.objective) similar to '%(bureau|bureaus|transunion|experian|equifax)%' then 'Buró(s) de crédito indicado(s) en el plan' else 'Acreedor o agencia indicada en el reporte' end,
  null,
  concat('Fecha: ____ / ____ / ______',E'\n\n',cl.first_name,' ',cl.last_name,E'\n',coalesce(cl.address_line1,'Dirección del cliente por confirmar'),E'\n',coalesce(concat_ws(', ',cl.city,cl.state,cl.postal_code),'Ciudad, Estado y ZIP por confirmar'),E'\n\n','A: ',case when lower(cw.objective) similar to '%(bureau|bureaus|transunion|experian|equifax)%' then 'Buró(s) de crédito indicado(s) en el plan' else 'Acreedor o agencia indicada en el reporte' end,E'\n','Dirección: CONFIRMAR ANTES DE ENVIAR',E'\n\n','Asunto: ',cw.objective,E'\n\n','A quien corresponda:',E'\n\n','Solicito una investigación completa y verificable de la información señalada en mi reporte de crédito. El objetivo de esta comunicación es: ',cw.objective,'. Favor de revisar los documentos incluidos, verificar la exactitud de la información y corregir o eliminar cualquier dato que no pueda ser sustentado de manera completa y precisa.',E'\n\n','Solicito que me envíen por escrito los resultados de la investigación y una copia actualizada de mi reporte cuando corresponda.',E'\n\n','Atentamente,',E'\n\n\n',cl.first_name,' ',cl.last_name,E'\n','Firma: ______________________________'),
  array['Carta firmada','Copia de identificación','Comprobante de domicilio','Copia del reporte con los elementos relevantes marcados'],
  'ready'
from public.case_weeks cw join public.cases ca on ca.id=cw.case_id join public.clients cl on cl.id=ca.client_id
on conflict(case_week_id,sequence_number) do nothing;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='weekly_mailings') then alter publication supabase_realtime add table public.weekly_mailings; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='score_progress') then alter publication supabase_realtime add table public.score_progress; end if;
  end if;
end $$;
