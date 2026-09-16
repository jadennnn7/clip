-- ============================================================================
-- OmegaClip — Datenbankschema
-- ============================================================================
-- Einspielen:  supabase start && psql "$DATABASE_URL" -f supabase/schema.sql
--
-- Zwei Sicherheitsprinzipien ziehen sich durch dieses Schema:
--
--  1) RLS ist auf JEDER Tabelle in `public` aktiv, mit Policies pro Operation.
--     Multi-Tenant-Isolation läuft ausschließlich über `auth.uid()`.
--
--  2) OAuth-Tokens liegen NICHT in `public`. Sie liegen in `private`, einem
--     Schema, das nicht über PostgREST exponiert wird. Selbst ein fehlerhaftes
--     RLS-Policy kann damit keine fremden Social-Media-Kanäle freigeben.
-- ============================================================================

create extension if not exists "pgcrypto";

-- `private` wird bewusst NICHT in Supabase → Settings → API → Exposed Schemas
-- eingetragen. Nur `service_role` (Route Handlers, Trigger.dev-Tasks) liest hier.
create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- ============================================================================
-- Enums
-- ============================================================================

create type subscription_tier as enum ('free', 'starter', 'pro', 'agency');

create type project_source as enum ('upload', 'youtube', 'drive');

create type project_status as enum (
  'draft',        -- angelegt, Quelle noch nicht vollständig
  'queued',       -- wartet auf einen Worker
  'downloading',  -- Quelle wird geholt / verifiziert
  'transcribing', -- Deepgram
  'analyzing',    -- Claude
  'reframing',    -- Szenenerkennung + Active-Speaker-Tracking
  'ready',        -- Clips liegen vor
  'error'
);

create type clip_render_status as enum (
  'pending', 'queued', 'rendering', 'ready', 'error'
);

create type social_platform as enum ('youtube', 'tiktok', 'instagram');

create type social_account_status as enum (
  'active',
  'expired',       -- Token abgelaufen, Refresh möglich
  'needs_reauth',  -- Refresh fehlgeschlagen → Nutzer muss neu verbinden
  'revoked'
);

-- Der Kern des USP-Kompromisses: Vollautomatik ist nicht auf jeder Plattform
-- erlaubt, also ist der Automatisierungsgrad pro verbundenem Account einstellbar.
create type automation_mode as enum (
  'auto_publish',  -- direkt veröffentlichen (ggf. ab auto_publish_min_score)
  'review_queue',  -- rendern + einplanen, wartet auf Freigabe durch den Nutzer
  'manual'         -- nur rendern, kein Scheduling
);

create type schedule_status as enum (
  'needs_review',  -- wartet auf Nutzerfreigabe (review_queue-Modus)
  'pending',       -- freigegeben, wartet auf publish_at
  'publishing',    -- ein Worker hat die Zeile gegriffen
  'published',
  'failed',
  'cancelled'
);

-- ============================================================================
-- profiles — 1:1 mit auth.users, trägt Abo-Stufe und Verbrauchslimits
-- ============================================================================

create table public.profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  email                   text not null,
  full_name               text,
  avatar_url              text,

  stripe_customer_id      text unique,
  stripe_subscription_id  text unique,
  subscription_tier       subscription_tier not null default 'free',
  subscription_status     text not null default 'inactive',
  current_period_end      timestamptz,

  -- Guthaben. `render_minutes_used` wird beim Enqueue RESERVIERT (nicht erst
  -- nach dem Render), sonst überziehen parallel laufende Jobs das Limit.
  render_minutes_limit    integer not null default 10,
  render_minutes_used     numeric(10,2) not null default 0,
  render_minutes_reset_at timestamptz not null default (now() + interval '30 days'),
  max_social_accounts     integer not null default 1,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint render_minutes_used_non_negative check (render_minutes_used >= 0)
);

-- ============================================================================
-- projects — ein hochgeladenes/verlinktes Quellvideo
-- ============================================================================

create table public.projects (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,

  title              text not null default 'Unbenanntes Projekt',
  source_type        project_source not null,
  source_url         text,           -- YouTube-/Drive-URL, falls zutreffend
  source_key         text,           -- R2-Key der Originaldatei
  proxy_key          text,           -- R2-Key des 720p-Proxys für den Editor
  audio_key          text,           -- R2-Key des 16-kHz-Mono-WAV für Deepgram
  waveform_key       text,           -- R2-Key der vorberechneten Peaks (peaks.json)
  thumbnail_url      text,

  duration_seconds   numeric(10,2),
  width              integer,
  height             integer,
  fps                numeric(6,3),

  status             project_status not null default 'draft',
  error_message      text,
  trigger_run_id     text,

  -- Bei source_type = 'youtube' bestätigt der Nutzer, die Rechte am Video zu
  -- halten. Das Herunterladen fremder YouTube-Inhalte verstößt gegen deren ToS;
  -- diese Spalte dokumentiert die Zusicherung nachweisbar.
  rights_confirmed   boolean not null default false,
  rights_confirmed_at timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint youtube_requires_rights_confirmation
    check (source_type <> 'youtube' or rights_confirmed = true)
);

-- ============================================================================
-- transcripts — bewusst eigene Tabelle, nicht in `projects` eingebettet
-- ============================================================================
-- Ein 60-Minuten-Transkript sind ~9.000 Wort-Objekte. Läge `words` in
-- `projects`, würde jede Statusabfrage im Dashboard-Grid den kompletten Blob
-- mitziehen. Ausgelagert bleibt das Grid schlank.
-- ============================================================================

create table public.transcripts (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null unique references public.projects(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,

  provider     text not null default 'deepgram',
  model        text not null default 'nova-3',
  language     text not null default 'de',
  full_text    text not null default '',

  -- [{ word, start, end, confidence, speaker }]
  -- Wort-Level ist nicht optional: die Hormozi-Untertitel heben das gerade
  -- gesprochene Wort hervor, das geht nur mit Timestamps pro Wort.
  words        jsonb not null default '[]'::jsonb,

  created_at   timestamptz not null default now()
);

-- ============================================================================
-- clips — von Claude erkannte Segmente mit hohem Viralitätspotenzial
-- ============================================================================

create table public.clips (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,

  title             text not null default '',
  description       text not null default '',
  hashtags          text[] not null default '{}',
  hook_text         text,

  start_seconds     numeric(10,3) not null,
  end_seconds       numeric(10,3) not null,

  virality_score    integer not null default 0,
  score_reasoning   text,

  -- Ausschnitt des Wort-Arrays für genau diesen Clip (Timestamps auf den
  -- Clip-Start normalisiert), damit der Editor nicht das Gesamttranskript lädt.
  words             jsonb not null default '[]'::jsonb,

  -- Untertitel-Styling: { preset, fontFamily, fontSize, color, highlightColor,
  --                       strokeWidth, strokeColor, positionY, uppercase, animation }
  caption_style     jsonb not null default '{}'::jsonb,

  -- Ergebnis der Active-Speaker-Erkennung: [{ frame, x, y, scale }].
  -- Die Computer Vision läuft im Worker, Remotion interpoliert nur noch.
  -- Dadurch bleibt der Render deterministisch und im Editor manuell korrigierbar.
  crop_keyframes    jsonb not null default '[]'::jsonb,

  render_status     clip_render_status not null default 'pending',
  render_key        text,           -- R2-Key des fertigen 9:16-MP4
  render_job_id     text,           -- Remotion-Lambda-Render-ID
  render_error      text,
  thumbnail_url     text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint clip_range_valid check (end_seconds > start_seconds),
  constraint virality_score_range check (virality_score between 0 and 100)
);

-- ============================================================================
-- social_accounts — Metadaten. Tokens liegen in private.social_account_tokens!
-- ============================================================================

create table public.social_accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,

  platform              social_platform not null,
  platform_account_id   text not null,
  platform_username     text,
  avatar_url            text,
  status                social_account_status not null default 'active',

  -- Steuert, wie weit die Automatik gehen darf. TikTok wird beim Verbinden
  -- hart auf 'review_queue' gesetzt, solange das Content-Posting-Audit fehlt
  -- (un-auditierte Clients dürfen nur SELF_ONLY posten).
  automation_mode       automation_mode not null default 'review_queue',
  auto_publish_min_score integer not null default 80,

  -- Meta-spezifisch: die IG-Professional-Account-ID und die verknüpfte Page.
  meta_page_id          text,
  meta_ig_user_id       text,

  last_published_at     timestamptz,
  last_error            text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (user_id, platform, platform_account_id),
  constraint auto_publish_min_score_range check (auto_publish_min_score between 0 and 100)
);

-- ---------------------------------------------------------------------------
-- private.social_account_tokens — außerhalb der PostgREST-Reichweite
-- ---------------------------------------------------------------------------
-- Über `public` wäre diese Tabelle per REST erreichbar und nur durch RLS
-- geschützt. Ein einziger Policy-Fehler gäbe damit fremde Kanäle frei.
-- In `private` existiert sie für anon/authenticated schlicht nicht.
--
-- Empfohlen zusätzlich: Werte über Supabase Vault ablegen
-- (`vault.create_secret(...)`) und hier nur die Secret-UUID speichern.
-- `TOKEN_ENCRYPTION_KEY` ist der App-seitige Fallback (AES-256-GCM).
-- ---------------------------------------------------------------------------

create table private.social_account_tokens (
  social_account_id  uuid primary key references public.social_accounts(id) on delete cascade,
  access_token       text not null,
  refresh_token      text,
  token_expires_at   timestamptz,
  refresh_expires_at timestamptz,
  scopes             text[] not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

revoke all on private.social_account_tokens from anon, authenticated;

-- ============================================================================
-- posting_schedules — die Publishing-Queue
-- ============================================================================

create table public.posting_schedules (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  clip_id            uuid not null references public.clips(id) on delete cascade,
  social_account_id  uuid not null references public.social_accounts(id) on delete cascade,

  publish_at         timestamptz not null,
  status             schedule_status not null default 'needs_review',

  platform_post_id   text,
  platform_post_url  text,

  attempt_count      integer not null default 0,
  last_error         text,
  next_retry_at      timestamptz,

  -- Doppel-Posts sind der schlimmste denkbare Fehlerfall dieser Plattform:
  -- sie sind für den Nutzer öffentlich sichtbar und nicht rückgängig zu machen.
  -- Deshalb zwei unabhängige Schutzschichten:
  --   (a) dieser UNIQUE-Constraint verhindert doppelte Queue-Einträge
  --   (b) claim_posting_schedule() unten verhindert, dass zwei Worker
  --       dieselbe Zeile gleichzeitig greifen
  idempotency_key    text not null unique,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (clip_id, social_account_id)
);

-- ============================================================================
-- usage_events — Audit-Trail für Render-Minuten (Abrechnung nachvollziehbar)
-- ============================================================================

create table public.usage_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete set null,
  clip_id       uuid references public.clips(id) on delete set null,
  kind          text not null,              -- 'reserve' | 'refund' | 'reset'
  minutes       numeric(10,2) not null,
  note          text,
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- stripe_events — Idempotenz für Webhooks (Stripe liefert mehrfach aus)
-- ============================================================================

create table public.stripe_events (
  id           text primary key,            -- Stripe Event-ID
  type         text not null,
  processed_at timestamptz not null default now()
);

-- ============================================================================
-- Indizes
-- ============================================================================

create index projects_user_created_idx    on public.projects (user_id, created_at desc);
create index projects_status_idx          on public.projects (status) where status not in ('ready', 'error');
create index clips_project_score_idx      on public.clips (project_id, virality_score desc);
create index clips_user_idx               on public.clips (user_id);
create index transcripts_user_idx         on public.transcripts (user_id);
create index social_accounts_user_idx     on public.social_accounts (user_id, platform);

-- Der Query des Publishing-Crons: "welche Einträge sind jetzt fällig?"
create index posting_schedules_due_idx
  on public.posting_schedules (status, publish_at)
  where status in ('pending', 'failed');

create index posting_schedules_user_idx   on public.posting_schedules (user_id, publish_at desc);
create index usage_events_user_idx        on public.usage_events (user_id, created_at desc);

-- ============================================================================
-- Trigger: updated_at
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at          before update on public.profiles          for each row execute function public.set_updated_at();
create trigger projects_updated_at          before update on public.projects          for each row execute function public.set_updated_at();
create trigger clips_updated_at             before update on public.clips             for each row execute function public.set_updated_at();
create trigger social_accounts_updated_at   before update on public.social_accounts   for each row execute function public.set_updated_at();
create trigger posting_schedules_updated_at before update on public.posting_schedules for each row execute function public.set_updated_at();

-- ============================================================================
-- Trigger: user_id denormalisieren
-- ============================================================================
-- `clips` und `transcripts` hängen über `project_id` am Nutzer. Ohne
-- denormalisiertes user_id bräuchte jede RLS-Policy ein EXISTS-Subquery auf
-- `projects` — pro geprüfter Zeile. Mit der Spalte wird daraus ein Index-Lookup.
-- Der Trigger füllt sie automatisch, damit sie nicht abweichen kann.
-- ============================================================================

create or replace function public.set_user_id_from_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select p.user_id into new.user_id from public.projects p where p.id = new.project_id;
  if new.user_id is null then
    raise exception 'Projekt % existiert nicht', new.project_id;
  end if;
  return new;
end;
$$;

create trigger clips_set_user_id       before insert on public.clips       for each row execute function public.set_user_id_from_project();
create trigger transcripts_set_user_id before insert on public.transcripts for each row execute function public.set_user_id_from_project();

-- ============================================================================
-- Trigger: profiles bei Registrierung anlegen
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Credit-Reservierung
-- ============================================================================
-- Wird VOR dem Enqueue aufgerufen. Die Prüfung und die Erhöhung passieren in
-- einem einzigen atomaren UPDATE — ein nachgelagertes "erst prüfen, dann
-- erhöhen" würde bei zwei gleichzeitigen Jobs beide durchlassen.
-- Gibt true zurück, wenn das Guthaben gereicht hat.
-- ============================================================================

create or replace function public.reserve_render_minutes(
  p_user_id uuid,
  p_minutes numeric,
  p_project_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.profiles
     set render_minutes_used = render_minutes_used + p_minutes
   where id = p_user_id
     and render_minutes_used + p_minutes <= render_minutes_limit;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return false;
  end if;

  insert into public.usage_events (user_id, project_id, kind, minutes)
  values (p_user_id, p_project_id, 'reserve', p_minutes);

  return true;
end;
$$;

-- Gegenbuchung, wenn ein Render fehlschlägt. `greatest(...)` verhindert, dass
-- ein doppelter Refund das Konto ins Minus dreht.
create or replace function public.refund_render_minutes(
  p_user_id uuid,
  p_minutes numeric,
  p_project_id uuid default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set render_minutes_used = greatest(0, render_minutes_used - p_minutes)
   where id = p_user_id;

  insert into public.usage_events (user_id, project_id, kind, minutes, note)
  values (p_user_id, p_project_id, 'refund', p_minutes, p_note);
end;
$$;

-- ============================================================================
-- claim_posting_schedule — die zweite Schutzschicht gegen Doppel-Posts
-- ============================================================================
-- Der Worker holt sich Arbeit ausschließlich hierüber. Das WHERE auf den
-- Ausgangsstatus macht den Übergang atomar: greifen zwei Worker dieselbe Zeile,
-- gewinnt genau einer, der andere bekommt kein Ergebnis zurück.
-- ============================================================================

create or replace function public.claim_posting_schedule(p_id uuid)
returns public.posting_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.posting_schedules;
begin
  update public.posting_schedules
     set status = 'publishing',
         attempt_count = attempt_count + 1
   where id = p_id
     and status in ('pending', 'failed')
  returning * into v_row;

  return v_row;  -- NULL, wenn ein anderer Worker schneller war
end;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles          enable row level security;
alter table public.projects          enable row level security;
alter table public.transcripts       enable row level security;
alter table public.clips             enable row level security;
alter table public.social_accounts   enable row level security;
alter table public.posting_schedules enable row level security;
alter table public.usage_events      enable row level security;
alter table public.stripe_events     enable row level security;

-- --- profiles --------------------------------------------------------------
-- Kein INSERT-Policy: Profile entstehen ausschließlich über den Auth-Trigger.
-- Kein DELETE-Policy: Profile verschwinden über auth.users → ON DELETE CASCADE.
create policy "profiles: eigenes Profil lesen"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- Abo-Stufe und Guthaben dürfen NICHT vom Client änderbar sein — diese Spalten
-- schreibt ausschließlich der Stripe-Webhook bzw. die Reservierungsfunktion,
-- beide mit service_role (umgeht RLS).
create policy "profiles: eigenes Profil bearbeiten"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- --- projects --------------------------------------------------------------
create policy "projects: eigene lesen"
  on public.projects for select to authenticated
  using (user_id = (select auth.uid()));

create policy "projects: eigene anlegen"
  on public.projects for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "projects: eigene bearbeiten"
  on public.projects for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "projects: eigene löschen"
  on public.projects for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- transcripts -----------------------------------------------------------
-- Nur lesbar: Transkripte schreibt ausschließlich die Pipeline (service_role).
create policy "transcripts: eigene lesen"
  on public.transcripts for select to authenticated
  using (user_id = (select auth.uid()));

-- --- clips -----------------------------------------------------------------
-- INSERT bleibt der Pipeline vorbehalten; der Nutzer darf Clips bearbeiten
-- (Titel, Trim, Caption-Styling) und löschen.
create policy "clips: eigene lesen"
  on public.clips for select to authenticated
  using (user_id = (select auth.uid()));

create policy "clips: eigene bearbeiten"
  on public.clips for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "clips: eigene löschen"
  on public.clips for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- social_accounts -------------------------------------------------------
-- Der Client darf Metadaten sehen und den automation_mode umstellen.
-- Die Tokens liegen in `private` und sind hier ohnehin nicht enthalten.
create policy "social_accounts: eigene lesen"
  on public.social_accounts for select to authenticated
  using (user_id = (select auth.uid()));

create policy "social_accounts: eigene bearbeiten"
  on public.social_accounts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "social_accounts: eigene trennen"
  on public.social_accounts for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- posting_schedules -----------------------------------------------------
-- Der Nutzer darf freigeben, umplanen und abbrechen. Angelegt werden Einträge
-- von der Pipeline; `publishing`/`published` setzt nur der Worker.
create policy "posting_schedules: eigene lesen"
  on public.posting_schedules for select to authenticated
  using (user_id = (select auth.uid()));

create policy "posting_schedules: eigene bearbeiten"
  on public.posting_schedules for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "posting_schedules: eigene abbrechen"
  on public.posting_schedules for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- usage_events ----------------------------------------------------------
-- Nur lesbar (Verbrauchshistorie im Billing-Bereich). Geschrieben wird
-- ausschließlich über die SECURITY-DEFINER-Funktionen oben.
create policy "usage_events: eigene lesen"
  on public.usage_events for select to authenticated
  using (user_id = (select auth.uid()));

-- --- stripe_events ---------------------------------------------------------
-- Bewusst KEINE Policy: RLS ist aktiv, also sieht `authenticated` nichts.
-- Nur service_role (Webhook-Handler) greift zu.

-- ============================================================================
-- Grants
-- ============================================================================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Ausführungsrechte der SECURITY-DEFINER-Funktionen
-- ---------------------------------------------------------------------------
-- WICHTIG: Postgres vergibt EXECUTE auf neue Funktionen automatisch an PUBLIC.
-- Ein `revoke ... from authenticated` allein wirkt deshalb NICHT — die Rolle
-- behält das Recht über PUBLIC. Entzogen werden muss es PUBLIC selbst.
--
-- Ohne diesen Entzug könnte sich jeder eingeloggte Nutzer per PostgREST-RPC
-- `refund_render_minutes` aufrufen und sich unbegrenzt Guthaben gutschreiben;
-- `claim_posting_schedule` ließe sich missbrauchen, um Beiträge doppelt
-- zu veröffentlichen.
revoke execute on function public.reserve_render_minutes(uuid, numeric, uuid) from public;
revoke execute on function public.refund_render_minutes(uuid, numeric, uuid, text) from public;
revoke execute on function public.claim_posting_schedule(uuid) from public;

-- Auch die Trigger-Funktionen laufen als SECURITY DEFINER und gehören nicht
-- in die Reichweite eines Clients.
revoke execute on function public.set_user_id_from_project() from public;
revoke execute on function public.handle_new_user() from public;

grant execute on function public.reserve_render_minutes(uuid, numeric, uuid) to service_role;
grant execute on function public.refund_render_minutes(uuid, numeric, uuid, text) to service_role;
grant execute on function public.claim_posting_schedule(uuid) to service_role;
