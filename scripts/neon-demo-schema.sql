-- Schema + seed helpers for OXXUS public demo on Neon (fictitious data only).
-- Applied to branch oxxus-demo — never run against production Supabase.

alter table public.demo_cases add column if not exists duration_weeks integer default 16;
alter table public.demo_cases add column if not exists current_week integer default 1;
alter table public.demo_cases add column if not exists registry_source text default 'demo';
alter table public.demo_clients add column if not exists address_line1 text;
alter table public.demo_clients add column if not exists postal_code text;

create table if not exists public.demo_credit_reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.demo_cases(id) on delete cascade,
  provider text,
  storage_path text,
  processing_status text default 'ready',
  created_at timestamptz not null default now()
);

create table if not exists public.demo_credit_scores (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.demo_credit_reports(id) on delete cascade,
  bureau text not null,
  score integer not null
);

create table if not exists public.demo_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.demo_cases(id) on delete cascade,
  creditor_name text not null,
  balance numeric,
  issue_type text,
  bureaus text[] default '{}',
  status text default 'open',
  account_type text,
  account_class text,
  account_status_norm text,
  is_protected boolean default false,
  protection_reason text,
  classification_source text,
  classification_confidence numeric,
  created_at timestamptz not null default now()
);
