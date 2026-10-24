-- Keep the application controls in Spanish while standardizing every outgoing
-- client letter, envelope instruction and enclosure list in English.
update public.weekly_mailings as wm
set
  title = 'Letter to ' || wm.recipient_name || ': ' || cw.objective,
  envelope_notes = 'Use a white #10 business envelope. Print clearly in black ink, place the return address in the upper-left corner, add sufficient postage in the upper-right corner, and send by USPS Certified Mail with tracking. Keep the receipt and a complete copy of everything mailed.',
  enclosures = array[
    'Signed original letter',
    'Copy of a government-issued photo ID',
    'Copy of recent proof of address',
    'Copy of the credit report with the disputed item(s) highlighted'
  ]::text[],
  letter_body = concat(
    'Date: ____ / ____ / ______', E'\n\n',
    cl.first_name, ' ', cl.last_name, E'\n',
    coalesce(nullif(cl.address_line1, ''), 'RETURN ADDRESS TO BE CONFIRMED'), E'\n',
    coalesce(nullif(concat_ws(', ', nullif(cl.city, ''), nullif(cl.state, ''), nullif(cl.postal_code, '')), ''), 'CITY, STATE ZIP'), E'\n\n',
    'To: ', wm.recipient_name, E'\n',
    coalesce(nullif(wm.recipient_address, ''), 'ADDRESS TO BE VERIFIED BEFORE MAILING'), E'\n\n',
    'Re: ', cw.objective, E'\n',
    'Client reference: ', ca.case_number, E'\n\n',
    'Dear Sir or Madam:', E'\n\n',
    case
      when lower(wm.recipient_name) like '%transunion%'
        or lower(wm.recipient_name) like '%experian%'
        or lower(wm.recipient_name) like '%equifax%'
      then concat(
        'I am writing to dispute information identified in the enclosed copy of my credit report. I believe the identified item or items may be inaccurate, incomplete, or unverifiable.', E'\n\n',
        'Please conduct a reasonable reinvestigation of each highlighted item, review all enclosed supporting information, and contact the company that furnished the information. If an item cannot be verified as complete and accurate, please delete or correct it as required by applicable law.', E'\n\n',
        'Please send me the written results of your reinvestigation and an updated copy of my credit report. If an item is verified, please also provide the name, address, and telephone number of the furnisher contacted and a description of the procedure used to determine accuracy.'
      )
      else concat(
        'I am writing regarding information associated with the account or matter referenced in the enclosed documents. I dispute any information that is inaccurate, incomplete, or unsupported by your records.', E'\n\n',
        'Please investigate this matter and provide documentation showing the account ownership, complete payment history, current balance, relevant dates, and your authority to report or collect it. Please also correct or request deletion of any information that cannot be fully verified.', E'\n\n',
        'Please respond in writing with the results of your investigation and copies of the documents used to support your determination.'
      )
    end,
    E'\n\n',
    'Sincerely,', E'\n\n\n',
    cl.first_name, ' ', cl.last_name, E'\n',
    'Signature: ______________________________'
  )
from public.case_weeks as cw
join public.cases as ca on ca.id = cw.case_id
join public.clients as cl on cl.id = ca.client_id
where wm.case_week_id = cw.id;
