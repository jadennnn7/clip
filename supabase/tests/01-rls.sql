\set ON_ERROR_STOP on
\pset pager off

-- Zwei Nutzer anlegen. Der Auth-Trigger erzeugt die Profile automatisch.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

select '1) Profile per Trigger angelegt: ' || count(*)::text || ' (erwartet 2)' from public.profiles;

-- Daten für Nutzer A (als Eigentümer der DB, umgeht RLS wie service_role).
insert into public.projects (id, user_id, title, source_type, status)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'Projekt von A', 'upload', 'ready');

insert into public.clips (project_id, user_id, title, start_seconds, end_seconds, virality_score)
values ('aaaaaaaa-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000000',  -- absichtlich falsch: Trigger korrigiert
        'Clip von A', 10, 40, 91);

select '2) user_id per Trigger denormalisiert: ' ||
       (select user_id::text from public.clips limit 1) ||
       ' (erwartet 1111...)';

insert into public.social_accounts (user_id, platform, platform_account_id, platform_username)
values ('11111111-1111-1111-1111-111111111111', 'youtube', 'UC_a', '@a');

-- ---------------------------------------------------------------- Nutzer B
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select '3) B sieht Projekte von A: ' || count(*)::text || ' (erwartet 0)' from public.projects;
select '4) B sieht Clips von A: '    || count(*)::text || ' (erwartet 0)' from public.clips;
select '5) B sieht Kanäle von A: '   || count(*)::text || ' (erwartet 0)' from public.social_accounts;

-- ---------------------------------------------------------------- Nutzer A
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select '6) A sieht eigene Projekte: ' || count(*)::text || ' (erwartet 1)' from public.projects;
select '7) A sieht eigenes Profil: '  || count(*)::text || ' (erwartet 1)' from public.profiles;

-- B darf nichts in A's Namen anlegen.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  insert into public.projects (user_id, title, source_type, status)
  values ('11111111-1111-1111-1111-111111111111', 'Untergeschoben', 'upload', 'ready');
  raise exception '8) FEHLER: B konnte ein Projekt für A anlegen!';
exception when insufficient_privilege then
  raise notice '8) INSERT von B für A blockiert (erwartet)';
end $$;

-- Tokens dürfen für authenticated unerreichbar sein.
do $$
declare n int;
begin
  execute 'select count(*) from private.social_account_tokens' into n;
  raise exception '9) FEHLER: authenticated konnte Tokens lesen!';
exception when insufficient_privilege then
  raise notice '9) private.social_account_tokens für authenticated gesperrt (erwartet)';
end $$;

-- Guthaben-Funktionen dürfen nicht per RPC aufrufbar sein.
do $$
begin
  perform public.refund_render_minutes('22222222-2222-2222-2222-222222222222', 999);
  raise exception '10) FEHLER: authenticated konnte Guthaben zurückbuchen!';
exception when insufficient_privilege then
  raise notice '10) refund_render_minutes für authenticated gesperrt (erwartet)';
end $$;

reset role;

-- ---------------------------------------------------------------- Guthaben
select '11) Reservierung innerhalb des Limits: ' ||
  public.reserve_render_minutes('11111111-1111-1111-1111-111111111111', 8)::text || ' (erwartet true)';
select '12) Reservierung über dem Limit: ' ||
  public.reserve_render_minutes('11111111-1111-1111-1111-111111111111', 5)::text || ' (erwartet false, Limit 10)';
select '13) Verbrauch jetzt: ' || render_minutes_used::text || ' (erwartet 8.00)'
  from public.profiles where id = '11111111-1111-1111-1111-111111111111';

-- ------------------------------------------------- Doppel-Post-Schutz
insert into public.posting_schedules (user_id, clip_id, social_account_id, publish_at, status, idempotency_key)
select '11111111-1111-1111-1111-111111111111', c.id, s.id, now(), 'pending', 'post:test:1'
from public.clips c, public.social_accounts s limit 1;

select '14) Erster Worker greift die Zeile: ' ||
  case when (public.claim_posting_schedule((select id from public.posting_schedules))).id is not null
       then 'ja' else 'nein' end || ' (erwartet ja)';
select '15) Zweiter Worker greift dieselbe Zeile: ' ||
  case when (public.claim_posting_schedule((select id from public.posting_schedules))).id is not null
       then 'JA — DOPPEL-POST MÖGLICH!' else 'nein' end || ' (erwartet nein)';

-- ------------------------------------------------- Constraints
do $$
begin
  insert into public.projects (user_id, title, source_type, status)
  values ('11111111-1111-1111-1111-111111111111', 'YT ohne Rechte', 'youtube', 'ready');
  raise exception '16) FEHLER: YouTube-Projekt ohne Rechtebestätigung angelegt!';
exception when check_violation then
  raise notice '16) YouTube ohne Rechtebestätigung blockiert (erwartet)';
end $$;

do $$
begin
  insert into public.clips (project_id, user_id, title, start_seconds, end_seconds, virality_score)
  values ('aaaaaaaa-0000-0000-0000-000000000001',
          '11111111-1111-1111-1111-111111111111', 'Rückwärts', 40, 10, 50);
  raise exception '17) FEHLER: Clip mit end < start angelegt!';
exception when check_violation then
  raise notice '17) Clip mit end <= start blockiert (erwartet)';
end $$;
