delete from public.weekly_mailings wm using public.case_weeks cw
where wm.case_week_id=cw.id and wm.status<>'sent' and (
  lower(cw.objective) like '%three bureau%' or lower(cw.objective) like '%three bureaus%' or lower(cw.objective) like '%tres buró%' or lower(cw.objective) like '%bureaus%'
);
insert into public.weekly_mailings(case_week_id,case_id,sequence_number,title,recipient_name,recipient_address,letter_body,enclosures,status)
select cw.id,cw.case_id,b.seq,'Carta a '||b.name||': '||cw.objective,b.name,b.address,
concat('Fecha: ____ / ____ / ______',E'\n\n',cl.first_name,' ',cl.last_name,E'\n',coalesce(cl.address_line1,'Dirección del cliente por confirmar'),E'\n',coalesce(concat_ws(', ',cl.city,cl.state,cl.postal_code),'Ciudad, Estado y ZIP por confirmar'),E'\n\n','A: ',b.name,E'\n',b.address,E'\n\n','Asunto: Solicitud de investigación — ',cw.objective,E'\n\n','A quien corresponda:',E'\n\n','Solicito una investigación completa y verificable de la información señalada en mi reporte de crédito. Favor de revisar cada elemento marcado en la copia adjunta, verificar la exactitud, integridad y fuente de la información, y corregir o eliminar cualquier dato que no pueda ser sustentado de manera completa y precisa.',E'\n\n','Solicito que me envíen por escrito los resultados de la investigación y una copia actualizada de mi reporte.',E'\n\n','Atentamente,',E'\n\n\n',cl.first_name,' ',cl.last_name,E'\n','Firma: ______________________________'),
array['Carta firmada','Copia de identificación','Comprobante de domicilio','Copia del reporte de '||b.name||' con elementos marcados'],'ready'
from public.case_weeks cw join public.cases ca on ca.id=cw.case_id join public.clients cl on cl.id=ca.client_id
cross join (values(1,'TransUnion Consumer Solutions',E'P.O. Box 2000\nChester, PA 19016-2000'),(2,'Experian — Dispute by Mail',E'P.O. Box 4500\nAllen, TX 75013'),(3,'Equifax Information Services LLC',E'P.O. Box 740256\nAtlanta, GA 30374-0256')) b(seq,name,address)
where lower(cw.objective) like '%three bureau%' or lower(cw.objective) like '%three bureaus%' or lower(cw.objective) like '%tres buró%' or lower(cw.objective) like '%bureaus%'
on conflict(case_week_id,sequence_number) do nothing;

delete from public.weekly_mailings wm using public.case_weeks cw
where wm.case_week_id=cw.id and wm.status<>'sent'
and not (lower(cw.objective) like '%three bureau%' or lower(cw.objective) like '%three bureaus%' or lower(cw.objective) like '%bureaus%')
and (lower(cw.objective) like '%debt validation%' or lower(cw.objective) like '%furnisher%' or lower(cw.objective) like '%collector%' or lower(cw.objective) like '%collection agenc%' or lower(cw.objective) like '%direct dispute%');
insert into public.weekly_mailings(case_week_id,case_id,sequence_number,title,recipient_name,recipient_address,letter_body,enclosures,status)
select cw.id,cw.case_id,row_number() over(partition by cw.id order by ac.created_at)::smallint,
'Carta a '||ac.creditor_name||': '||cw.objective,ac.creditor_name,null,
concat('Fecha: ____ / ____ / ______',E'\n\n',cl.first_name,' ',cl.last_name,E'\n',coalesce(cl.address_line1,'Dirección del cliente por confirmar'),E'\n',coalesce(concat_ws(', ',cl.city,cl.state,cl.postal_code),'Ciudad, Estado y ZIP por confirmar'),E'\n\n','A: ',ac.creditor_name,E'\n','Dirección: CONFIRMAR EN EL REPORTE O CORRESPONDENCIA DEL ACREEDOR',E'\n\n','Asunto: ',cw.objective,E'\n','Cuenta: ',coalesce(ac.account_number_masked,'Número de cuenta por confirmar'),E'\n\n','A quien corresponda:',E'\n\n','Escribo respecto a la cuenta indicada. Solicito una investigación y validación completa de la información reportada, incluyendo la identificación del acreedor original, el historial y balance que sustentan la cuenta, y la autoridad para reportarla o cobrarla. Favor de corregir cualquier información incompleta o inexacta y responder por escrito con los documentos verificables correspondientes.',E'\n\n','Atentamente,',E'\n\n\n',cl.first_name,' ',cl.last_name,E'\n','Firma: ______________________________'),
array['Carta firmada','Copia de identificación','Comprobante de domicilio','Copia de la sección del reporte correspondiente a '||ac.creditor_name],'ready'
from public.case_weeks cw join public.cases ca on ca.id=cw.case_id join public.clients cl on cl.id=ca.client_id join public.credit_accounts ac on ac.case_id=ca.id
where not (lower(cw.objective) like '%three bureau%' or lower(cw.objective) like '%three bureaus%' or lower(cw.objective) like '%bureaus%')
and (lower(cw.objective) like '%debt validation%' or lower(cw.objective) like '%furnisher%' or lower(cw.objective) like '%collector%' or lower(cw.objective) like '%collection agenc%' or lower(cw.objective) like '%direct dispute%')
on conflict(case_week_id,sequence_number) do nothing;
