create extension if not exists "pgcrypto";

create type public.app_role as enum ('admin','specialist','reviewer','client');
create type public.case_status as enum ('draft','active','waiting','completed','archived');
create type public.dispute_status as enum ('detected','planned','draft','sent','waiting','resolved','deleted','verified');

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  date_of_birth date,
  ssn_last4 text check (ssn_last4 is null or ssn_last4 ~ '^[0-9]{4}$'),
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.app_role not null default 'client',
  client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,
  client_id uuid not null references public.clients(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  level smallint not null check (level between 1 and 4),
  suggested_level smallint check (suggested_level between 1 and 4),
  duration_weeks smallint not null check (duration_weeks between 3 and 12),
  current_week smallint not null default 1,
  status public.case_status not null default 'draft',
  started_at date,
  completed_at date,
  next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  provider text,
  report_date date,
  storage_path text not null,
  processing_status text not null default 'uploaded',
  raw_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.credit_scores (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.credit_reports(id) on delete cascade,
  bureau text not null check (bureau in ('transunion','experian','equifax')),
  score smallint not null check (score between 300 and 850),
  created_at timestamptz not null default now(),
  unique(report_id,bureau)
);

create table public.credit_accounts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  creditor_name text not null,
  account_type text,
  account_number_masked text,
  balance numeric(12,2),
  issue_type text,
  bureaus text[] not null default '{}',
  is_negative boolean not null default true,
  status text not null default 'detected',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.case_weeks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  week_number smallint not null,
  objective text not null,
  status text not null default 'planned',
  due_date date,
  completed_at timestamptz,
  summary text,
  unique(case_id,week_number)
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  account_id uuid references public.credit_accounts(id) on delete set null,
  case_week_id uuid references public.case_weeks(id) on delete set null,
  bureau text,
  recipient_name text,
  round smallint not null default 1,
  status public.dispute_status not null default 'planned',
  sent_at date,
  response_due_at date,
  resolved_at date,
  result_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid references public.disputes(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  template_key text not null,
  title text not null,
  recipient_name text,
  recipient_address text,
  body text,
  status text not null default 'draft',
  storage_path text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_path text not null,
  verification_status text not null default 'pending',
  expires_at date,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.case_activity (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.cases(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  activity_type text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index cases_client_idx on public.cases(client_id);
create index reports_case_idx on public.credit_reports(case_id);
create index accounts_case_idx on public.credit_accounts(case_id);
create index disputes_case_idx on public.disputes(case_id);
create index documents_client_idx on public.documents(client_id);
create index activity_case_created_idx on public.case_activity(case_id,created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end $$;
create trigger clients_updated before update on public.clients for each row execute function public.set_updated_at();
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger cases_updated before update on public.cases for each row execute function public.set_updated_at();
create trigger accounts_updated before update on public.credit_accounts for each row execute function public.set_updated_at();
create trigger disputes_updated before update on public.disputes for each row execute function public.set_updated_at();

create or replace function public.is_team_member() returns boolean
language sql security definer stable set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','specialist','reviewer'))
$$;

alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.credit_reports enable row level security;
alter table public.credit_scores enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.case_weeks enable row level security;
alter table public.disputes enable row level security;
alter table public.letters enable row level security;
alter table public.documents enable row level security;
alter table public.case_activity enable row level security;

create policy "team manages profiles" on public.profiles for all using (public.is_team_member()) with check (public.is_team_member());
create policy "users view own profile" on public.profiles for select using (id=auth.uid());
create policy "team manages clients" on public.clients for all using (public.is_team_member()) with check (public.is_team_member());
create policy "clients view own record" on public.clients for select using (owner_user_id=auth.uid());
create policy "team manages cases" on public.cases for all using (public.is_team_member()) with check (public.is_team_member());
create policy "clients view own cases" on public.cases for select using (exists(select 1 from public.clients c where c.id=client_id and c.owner_user_id=auth.uid()));

do $$ declare t text; begin
  foreach t in array array['credit_reports','credit_accounts','case_weeks','disputes','letters','case_activity'] loop
    execute format('create policy "team manages %1$s" on public.%1$I for all using (public.is_team_member()) with check (public.is_team_member())',t);
    execute format('create policy "clients view own %1$s" on public.%1$I for select using (exists(select 1 from public.cases ca join public.clients cl on cl.id=ca.client_id where ca.id=case_id and cl.owner_user_id=auth.uid()))',t);
  end loop;
end $$;

create policy "team manages scores" on public.credit_scores for all using (public.is_team_member()) with check (public.is_team_member());
create policy "clients view own scores" on public.credit_scores for select using (exists(select 1 from public.credit_reports r join public.cases ca on ca.id=r.case_id join public.clients cl on cl.id=ca.client_id where r.id=report_id and cl.owner_user_id=auth.uid()));
create policy "team manages documents" on public.documents for all using (public.is_team_member()) with check (public.is_team_member());
create policy "clients view own documents" on public.documents for select using (exists(select 1 from public.clients c where c.id=client_id and c.owner_user_id=auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('client-documents','client-documents',false,26214400,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

create policy "team manages client files" on storage.objects for all
using (bucket_id='client-documents' and public.is_team_member())
with check (bucket_id='client-documents' and public.is_team_member());
