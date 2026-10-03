\set ON_ERROR_STOP on
\pset pager off

-- Kontolöschung: `auth.admin.deleteUser` löscht die Zeile in auth.users, den
-- Rest muss die Datenbank selbst erledigen. Jede Tabelle mit `user_id` muss
-- danach leer sein für dieses Konto — auch eine, die später dazukommt.

insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-00000000000d', 'delete-me@example.com'),
  ('e0000000-0000-0000-0000-00000000000e', 'keep-me@example.com')
on conflict do nothing;
insert into public.profiles (id, email) values
  ('d0000000-0000-0000-0000-00000000000d', 'delete-me@example.com'),
  ('e0000000-0000-0000-0000-00000000000e', 'keep-me@example.com')
on conflict do nothing;

-- Von jeder Sorte eine Zeile, für beide Konten.
do $$
declare
  owner uuid;
  project uuid;
  clip uuid;
  account uuid;
begin
  foreach owner in array array['d0000000-0000-0000-0000-00000000000d', 'e0000000-0000-0000-0000-00000000000e']::uuid[] loop
    insert into public.projects (user_id, title, source_type, status, rights_confirmed)
      values (owner, 'Video', 'youtube', 'ready', true) returning id into project;
    insert into public.transcripts (project_id, user_id) values (project, owner);
    insert into public.clips (project_id, user_id, title, start_seconds, end_seconds)
      values (project, owner, 'Clip', 0, 30) returning id into clip;
    insert into public.brand_kits (user_id, id, name, style) values (owner, 'brand-studio', 'Studio', '{}');
    insert into public.social_accounts (user_id, platform, platform_account_id)
      values (owner, 'instagram', 'ig-' || owner) returning id into account;
    insert into private.social_account_tokens (social_account_id, access_token) values (account, 'v1.token');
    insert into public.posting_schedules (user_id, clip_id, social_account_id, publish_at, idempotency_key)
      values (owner, clip, account, now(), 'schedule-' || owner);
    -- Der Fremdschlüssel auf social_accounts hat kein ON DELETE: Das geht nur
    -- gut, weil beide Zeilen in derselben Kaskade verschwinden.
    insert into public.publishing_jobs (user_id, source_job_id, clip_index, account_id, clip, source_width,
                                        source_height, proxy_key, output_format, title)
      values (owner, 'run_x', 0, account, '{}', 1920, 1080, 'pipeline/run_x/proxy.mp4', '9:16', 'Clip');
    insert into public.usage_events (user_id, project_id, clip_id, kind, minutes) values (owner, project, clip, 'reserve', 1);
    insert into public.token_credit_events (user_id, reference, tokens) values (owner, 'pack-' || owner, 10);
    insert into public.clip_token_charges (user_id, reference, tokens) values (owner, 'charge-' || owner, 1);
    insert into public.export_events (user_id, reference) values (owner, 'export-' || owner);
    insert into public.rate_limit_hits (user_id, bucket, window_start, hits) values (owner, 'pipeline', now(), 1);
  end loop;
end $$;

delete from auth.users where id = 'd0000000-0000-0000-0000-00000000000d';

do $$
declare
  t record;
  n bigint;
  left_over text := '';
  kept text := '';
begin
  for t in
    select c.table_schema, c.table_name from information_schema.columns c
    join information_schema.tables using (table_schema, table_name)
    where c.column_name = 'user_id' and c.table_schema in ('public', 'private') and table_type = 'BASE TABLE'
    order by 1, 2
  loop
    execute format('select count(*) from %I.%I where user_id = %L', t.table_schema, t.table_name,
                   'd0000000-0000-0000-0000-00000000000d') into n;
    if n > 0 then left_over := left_over || format(' %s.%s (%s)', t.table_schema, t.table_name, n); end if;
    execute format('select count(*) from %I.%I where user_id = %L', t.table_schema, t.table_name,
                   'e0000000-0000-0000-0000-00000000000e') into n;
    if n = 0 and t.table_name <> 'profiles' then kept := kept || format(' %s.%s', t.table_schema, t.table_name); end if;
  end loop;
  if left_over <> '' then raise exception 'D1) FEHLER: Nach der Kontolöschung übrig:%', left_over; end if;
  raise notice 'D1) Keine Zeile des gelöschten Kontos übrig (erwartet)';
  if exists (select 1 from public.profiles where id = 'd0000000-0000-0000-0000-00000000000d') then
    raise exception 'D2) FEHLER: Das Profil besteht noch';
  end if;
  if exists (select 1 from private.social_account_tokens tok
             where not exists (select 1 from public.social_accounts a where a.id = tok.social_account_id)) then
    raise exception 'D2) FEHLER: Kanal-Tokens ohne Kanal übrig';
  end if;
  raise notice 'D2) Profil und Kanal-Tokens sind weg (erwartet)';
  if kept <> '' then raise exception 'D3) FEHLER: Beim anderen Konto fehlt etwas:%', kept; end if;
  raise notice 'D3) Das andere Konto ist unberührt (erwartet)';
end $$;
