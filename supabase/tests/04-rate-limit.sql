\set ON_ERROR_STOP on
\pset pager off

-- Rate-Limits: fester Zähler pro Konto, Bereich und Fenster; nur service_role.
insert into auth.users (id, email) values ('c0000000-0000-0000-0000-00000000000c', 'rl@example.com') on conflict do nothing;
insert into public.profiles (id, email) values ('c0000000-0000-0000-0000-00000000000c', 'rl@example.com') on conflict do nothing;

select 'R1) Drei Aufrufe bei Limit 2: '
  || string_agg(public.take_rate_limit('c0000000-0000-0000-0000-00000000000c', 'test:1h', 2, 3600)::text, ',')
  || ' (erwartet true,true,false)'
from generate_series(1, 3);

select 'R2) Anderer Bereich zählt getrennt: '
  || public.take_rate_limit('c0000000-0000-0000-0000-00000000000c', 'andere:1h', 2, 3600)::text || ' (erwartet true)';

-- Ein Zähler aus einem abgelaufenen Fenster wird beim nächsten Aufruf entfernt.
insert into public.rate_limit_hits (user_id, bucket, window_start, hits)
values ('c0000000-0000-0000-0000-00000000000c', 'test:1h', now() - interval '3 hours', 99);
select public.take_rate_limit('c0000000-0000-0000-0000-00000000000c', 'test:1h', 2, 3600);
select 'R3) Alte Fenster aufgeräumt: '
  || count(*)::text || ' Zeile (erwartet 1)'
from public.rate_limit_hits where user_id = 'c0000000-0000-0000-0000-00000000000c' and bucket = 'test:1h';

set role authenticated;
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-00000000000c';
do $$
begin
  perform public.take_rate_limit('c0000000-0000-0000-0000-00000000000c', 'test:1h', 1000000, 3600);
  raise exception 'R4) FEHLER: authenticated kann Zähler selbst setzen!';
exception when insufficient_privilege then
  raise notice 'R4) take_rate_limit für authenticated gesperrt (erwartet)';
end $$;
do $$
begin
  perform count(*) from public.rate_limit_hits;
  raise exception 'R5) FEHLER: authenticated kann Zähler lesen!';
exception when insufficient_privilege then
  raise notice 'R5) rate_limit_hits für authenticated gesperrt (erwartet)';
end $$;
reset role;
