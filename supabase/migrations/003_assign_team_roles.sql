update public.profiles p
set full_name='Cristhyam Aranguren', role='admin'
from auth.users u
where p.id=u.id and lower(u.email)=lower('oxxuscreative@gmail.com');

update public.profiles p
set full_name='Aerys Targeryen', role='specialist'
from auth.users u
where p.id=u.id and lower(u.email)=lower('tusaludinsurance@gmail.com');
