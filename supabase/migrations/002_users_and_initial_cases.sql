create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,full_name,role)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.email),'client')
  on conflict(id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

do $$
declare
  c2 uuid; c3 uuid; c4 uuid; c6 uuid;
  k2 uuid; k3 uuid; k4 uuid; k6 uuid;
  r2 uuid; r3 uuid; r4 uuid;
begin
  insert into public.clients(first_name,last_name,status)
  values('José Manuel','Gómez Briceño','active') returning id into c2;
  insert into public.cases(case_number,client_id,level,suggested_level,duration_weeks,status,current_week,next_action)
  values('OXX-002',c2,3,3,7,'draft',1,'Confirmar qué cartas fueron enviadas') returning id into k2;
  insert into public.credit_reports(case_id,provider,storage_path,processing_status,raw_summary)
  values(k2,'Conversation analysis','pending/client-002','reviewed','{"import_status":"plan_prepared"}') returning id into r2;
  insert into public.credit_scores(report_id,bureau,score) values
    (r2,'experian',515),(r2,'equifax',531),(r2,'transunion',527);
  insert into public.credit_accounts(case_id,creditor_name,account_type,balance,issue_type,bureaus) values
    (k2,'Jefferson Capital','Collection',1290,'collection',array['experian','equifax']),
    (k2,'Bank of America','Credit card',153,'charge-off',array['experian','equifax','transunion']);
  insert into public.case_weeks(case_id,week_number,objective) values
    (k2,1,'Personal information disputes and debt validation'),
    (k2,2,'Bureau disputes for Jefferson Capital'),
    (k2,3,'Direct dispute to Bank of America'),
    (k2,4,'Review responses and targeted bureau disputes'),
    (k2,5,'Method of Verification if verified'),
    (k2,6,'Second dispute based on inconsistencies'),
    (k2,7,'Final escalation review');

  insert into public.clients(first_name,last_name,status)
  values('Cinthya Esthefany','Pérez Guzmán','active') returning id into c3;
  insert into public.cases(case_number,client_id,level,suggested_level,duration_weeks,status,current_week,next_action)
  values('OXX-003',c3,3,3,8,'draft',1,'Confirmar qué cartas fueron enviadas') returning id into k3;
  insert into public.credit_reports(case_id,provider,storage_path,processing_status,raw_summary)
  values(k3,'Conversation analysis','pending/client-003','reviewed','{"import_status":"plan_prepared"}') returning id into r3;
  insert into public.credit_scores(report_id,bureau,score) values
    (r3,'transunion',625),(r3,'experian',653),(r3,'equifax',644);
  insert into public.credit_accounts(case_id,creditor_name,account_type,balance,issue_type,bureaus) values
    (k3,'DNF Associates','Collection',3150,'collection',array['experian']),
    (k3,'Credence Resource Management','Collection',432,'collection',array['equifax']),
    (k3,'JPMCB Card','Credit card',1328,'charge-off',array['transunion','experian','equifax']),
    (k3,'Klarna','Installment',null,'derogatory',array['transunion','experian','equifax']);
  insert into public.case_weeks(case_id,week_number,objective) values
    (k3,1,'Initial disputes to three bureaus'),
    (k3,2,'Debt validation to furnishers'),
    (k3,3,'Method of Verification'),
    (k3,4,'Direct disputes to furnishers'),
    (k3,5,'Second investigation round'),
    (k3,6,'Final reinvestigation request'),
    (k3,7,'Final follow-up'),
    (k3,8,'File review and updated report');

  insert into public.clients(first_name,last_name,status)
  values('Nickolas','Fernández','active') returning id into c4;
  insert into public.cases(case_number,client_id,level,suggested_level,duration_weeks,status,current_week,next_action)
  values('OXX-004',c4,1,1,4,'draft',1,'Confirmar qué cartas fueron enviadas') returning id into k4;
  insert into public.credit_reports(case_id,provider,storage_path,processing_status,raw_summary)
  values(k4,'Conversation analysis','pending/client-004','reviewed','{"import_status":"plan_prepared"}') returning id into r4;
  insert into public.credit_scores(report_id,bureau,score) values
    (r4,'transunion',715),(r4,'experian',744),(r4,'equifax',750);
  insert into public.credit_accounts(case_id,creditor_name,account_type,balance,issue_type,bureaus) values
    (k4,'National Credit Systems','Collection',3684,'collection',array['transunion','experian','equifax']),
    (k4,'First Credit Services','Collection',1108,'collection',array['transunion']);
  insert into public.case_weeks(case_id,week_number,objective) values
    (k4,1,'Initial targeted collection disputes'),
    (k4,2,'Debt validation to collection agencies'),
    (k4,3,'Method of Verification follow-up'),
    (k4,4,'Response-based final escalation');

  insert into public.clients(first_name,last_name,status)
  values('Ipzajes Paola','Castellanos Fernández','active') returning id into c6;
  insert into public.cases(case_number,client_id,level,suggested_level,duration_weeks,status,current_week,next_action)
  values('OXX-006',c6,1,1,4,'draft',1,'Confirmar qué cartas fueron enviadas') returning id into k6;
  insert into public.credit_reports(case_id,provider,storage_path,processing_status,raw_summary)
  values(k6,'Conversation analysis','pending/client-006','reviewed','{"import_status":"plan_prepared","scores":"pending confirmation"}');
  insert into public.credit_accounts(case_id,creditor_name,account_type,balance,issue_type,bureaus) values
    (k6,'Capital One','Credit card',713,'derogatory',array['transunion','experian','equifax']),
    (k6,'Bank of America','Credit card',1420,'derogatory',array['transunion','experian','equifax']),
    (k6,'Oportun','Installment',0,'charge-off',array['transunion','experian','equifax']),
    (k6,'Jefferson Capital','Collection',2506,'collection',array['equifax']),
    (k6,'Westlake Service','Auto loan',12735,'repossession/inconsistent',array['transunion','experian','equifax']),
    (k6,'WC/Koalafi','Installment',2578,'charge-off',array['transunion']);
  insert into public.case_weeks(case_id,week_number,objective) values
    (k6,1,'Initial disputes with three bureaus'),
    (k6,2,'Direct investigations with furnishers and collectors'),
    (k6,3,'WC/Koalafi, inquiries and targeted second round'),
    (k6,4,'Response-based follow-up and Method of Verification');

  insert into public.case_activity(case_id,activity_type,description) values
    (k2,'import','Case imported as Plan preparado; mailing status pending client confirmation'),
    (k3,'import','Case imported as Plan preparado; mailing status pending client confirmation'),
    (k4,'import','Case imported as Plan preparado; mailing status pending client confirmation'),
    (k6,'import','Case imported as Plan preparado; mailing status pending client confirmation');
end $$;
