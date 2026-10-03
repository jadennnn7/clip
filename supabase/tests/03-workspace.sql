\set ON_ERROR_STOP on
\pset pager off

-- Workspace in der Datenbank: Projekte, Clips und Brand Kits je Konto.
-- Läuft sowohl nach schema.sql als auch nach der Migration
-- 20260929000000_workspace.sql auf einer Datenbank ohne `projects`/`clips`.

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'ws-a@example.com'),
  ('b0000000-0000-0000-0000-00000000000b', 'ws-b@example.com')
on conflict do nothing;
-- Ohne Auth-Trigger (reine Migrations-Installation) fehlen sonst die Profile.
insert into public.profiles (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'ws-a@example.com'),
  ('b0000000-0000-0000-0000-00000000000b', 'ws-b@example.com')
on conflict do nothing;

set role authenticated;

-- ---------------------------------------------------------------- Nutzer A
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000a';

insert into public.projects (id, user_id, title, source_type, status, rights_confirmed, settings, publishing)
values ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'Projekt A',
        'youtube', 'ready', true, '{"aspectRatio":"9:16"}', '{"clipIds":["a2000000-0000-0000-0000-000000000001"]}');

-- Der Browser legt Clips an; user_id setzt der Trigger aus dem Projekt.
insert into public.clips (id, project_id, user_id, title, start_seconds, end_seconds, virality_score,
                          removed_words, output_format, is_favorite)
values ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-00000000000a', 'Clip A', 10, 40, 88, '[2,5]', '1:1', true);

select 'W1) A legt Projekt und Clip an: ' || count(*)::text || ' Clip (erwartet 1), Format '
  || max(output_format) || ', Favorit ' || bool_or(is_favorite)::text from public.clips;

insert into public.brand_kits (user_id, id, name, style)
values ('a0000000-0000-0000-0000-00000000000a', 'brand-studio', 'Studio', '{"preset":"minimal"}');

update public.profiles set workspace_initialized_at = now() where id = 'a0000000-0000-0000-0000-00000000000a';
select 'W2) A markiert den Workspace als angelegt: '
  || (workspace_initialized_at is not null)::text || ' (erwartet true)' from public.profiles;

do $$
begin
  update public.profiles set render_minutes_limit = 99999 where id = 'a0000000-0000-0000-0000-00000000000a';
  raise exception 'W3) FEHLER: A konnte sich Guthaben schreiben!';
exception when insufficient_privilege then
  raise notice 'W3) Guthaben bleibt für den Browser gesperrt (erwartet)';
end $$;

-- ---------------------------------------------------------------- Nutzer B
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000b';

select 'W4) B sieht Projekte/Clips/Kits von A: '
  || (select count(*) from public.projects)::text || '/'
  || (select count(*) from public.clips)::text || '/'
  || (select count(*) from public.brand_kits)::text || ' (erwartet 0/0/0)';

do $$
begin
  insert into public.clips (id, project_id, user_id, title, start_seconds, end_seconds)
  values ('b2000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000001',
          'b0000000-0000-0000-0000-00000000000b', 'Untergeschoben', 1, 5);
  raise exception 'W5) FEHLER: B konnte einen Clip in As Projekt anlegen!';
exception when insufficient_privilege then
  raise notice 'W5) Clip in fremdem Projekt blockiert (erwartet)';
end $$;

-- Überschreiben per Upsert mit fremder ID
do $$
begin
  insert into public.clips (id, project_id, user_id, title, start_seconds, end_seconds)
  values ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
          'b0000000-0000-0000-0000-00000000000b', 'Übernommen', 1, 5)
  on conflict (id) do update set title = excluded.title;
  raise exception 'W6) FEHLER: B konnte As Clip per Upsert überschreiben!';
exception when insufficient_privilege then
  raise notice 'W6) Upsert auf fremden Clip blockiert (erwartet)';
end $$;

-- „Nur anlegen, falls neu“ mit fremder ID ändert nichts.
insert into public.projects (id, user_id, title, source_type, status)
values ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'Projekt B', 'upload', 'ready');
insert into public.clips (id, project_id, user_id, title, start_seconds, end_seconds)
values ('a2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-00000000000b', 'Übernommen', 1, 5)
on conflict (id) do nothing;

insert into public.clips (id, project_id, user_id, title, start_seconds, end_seconds)
values ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-00000000000b', 'Clip B', 1, 5);

do $$
begin
  update public.clips set project_id = 'a1000000-0000-0000-0000-000000000001'
  where id = 'b2000000-0000-0000-0000-000000000001';
  raise exception 'W7) FEHLER: B konnte einen Clip in As Projekt verschieben!';
exception when insufficient_privilege then
  raise notice 'W7) Verschieben in fremdes Projekt blockiert (erwartet)';
end $$;

-- Gleiche Kit-ID wie A: jedes Konto hat seine eigenen Vorlagen.
insert into public.brand_kits (user_id, id, name, style)
values ('b0000000-0000-0000-0000-00000000000b', 'brand-studio', 'Studio', '{"preset":"minimal"}');

do $$
begin
  insert into public.clips (id, project_id, user_id, title, start_seconds, end_seconds, output_format)
  values ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001',
          'b0000000-0000-0000-0000-00000000000b', 'Falsches Format', 1, 5, '4:5');
  raise exception 'W8) FEHLER: ungültiges Ausgabeformat gespeichert!';
exception when check_violation then
  raise notice 'W8) Ungültiges Ausgabeformat blockiert (erwartet)';
end $$;

delete from public.projects where id = 'b1000000-0000-0000-0000-000000000001';
select 'W9) Projekt gelöscht, Clips per Cascade weg: ' || count(*)::text || ' (erwartet 0)' from public.clips;

reset role;
select 'W10) As Clip unverändert: ' || title || ' (erwartet Clip A)'
  from public.clips where id = 'a2000000-0000-0000-0000-000000000001';
select 'W11) Kits je Konto getrennt: ' || count(*)::text || ' (erwartet 2)' from public.brand_kits where id = 'brand-studio';
