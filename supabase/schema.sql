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

  -- Guthaben in Credits (1 Credit = 1 Minute Quellvideo), siehe
  -- settle_credit_cycles und charge_clip_tokens weiter unten.
  plan_credits            numeric(10,2) not null default 120, -- Gratis-Test, dann Abo-Kontingent
  pack_credits            numeric(10,2) not null default 0,   -- Nachkäufe, verfallen nicht
  monthly_credits         integer not null default 0,         -- Kontingent des aktiven Abos
  credit_cycle_anchor     timestamptz,
  credit_cycles_granted   integer not null default 0,
  cycle_peak_credits      integer not null default 0,
  trial_exports_used      integer not null default 0,
  trial_ended_at          timestamptz,

  -- Veraltet: Nur noch reserve_/refund_render_minutes lesen diese Spalten.
  render_minutes_limit    integer not null default 8,
  render_minutes_used     numeric(10,2) not null default 0,
  render_minutes_reset_at timestamptz not null default (now() + interval '30 days'),
  max_social_accounts     integer not null default 1,

  -- Einmal gesetzt, wenn der Workspace angelegt ist (Vorlagen oder übernommene
  -- Browser-Daten). Danach bleiben gelöschte Brand-Kit-Vorlagen gelöscht.
  workspace_initialized_at timestamptz,

  -- Partnerprogramm (siehe unten): der eigene Code, und wer über einen
  -- Partnerlink kam, der werbende Partner.
  partner_code            text,
  referred_by             uuid references public.profiles(id) on delete set null,
  referred_at             timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint render_minutes_used_non_negative check (render_minutes_used >= 0),
  constraint credits_non_negative check (
    plan_credits >= 0 and pack_credits >= 0 and monthly_credits >= 0
    and credit_cycles_granted >= 0 and cycle_peak_credits >= 0 and trial_exports_used >= 0
  ),
  constraint profiles_partner_code_format check (partner_code ~ '^[a-z0-9]{4,32}$'),
  constraint profiles_not_self_referred check (referred_by is distinct from id)
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

  -- Einstellungen des Imports (Sprache, Cliplänge, Format) und der
  -- Publishing-Plan samt ursprünglicher Clip-Reihenfolge.
  settings           jsonb,
  publishing         jsonb,

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
-- clips — ausgewählte Passagen mit redaktioneller Bewertung
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
  -- Versionierte Einzelbewertung von Hook, Flow und Value. Trend bleibt ohne
  -- aktuelle Datengrundlage unbewertet. NULL bei älteren/regelbasierten Clips.
  editorial         jsonb,
  analysis_source   text check (analysis_source in ('ai', 'heuristic')),
  analysis_notice   text,

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

  -- Schnitt im Editor. `segments`: behaltene Abschnitte [{ start, end }] in
  -- Sekunden ab Clip-Start; null heißt „der ganze Clip am Stück“.
  -- `overlays`: Text, Formen, Emojis, Fortschrittsbalken über dem Bild.
  -- `video_settings`: Bildaufteilung, Farbe, Zoom, Lautstärke, Blenden.
  segments          jsonb,
  overlays          jsonb not null default '[]'::jsonb,
  video_settings    jsonb,

  render_status     clip_render_status not null default 'pending',
  render_key        text,           -- R2-Key des fertigen 9:16-MP4
  render_job_id     text,           -- Remotion-Lambda-Render-ID
  render_error      text,
  thumbnail_url     text,

  -- Im Editor ausgeblendete Untertitelwörter (Indizes in `words`), das
  -- gewählte Ausgabeformat und die Favoriten-Markierung.
  removed_words     jsonb not null default '[]'::jsonb,
  output_format     text,
  is_favorite       boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint clip_range_valid check (end_seconds > start_seconds),
  constraint virality_score_range check (virality_score between 0 and 100),
  constraint clips_output_format_valid
    check (output_format is null or output_format in ('9:16', '1:1', '16:9'))
);

-- ============================================================================
-- brand_kits — gespeicherte Untertitel-Stile
-- ============================================================================
-- Die ID ist Text: Die zwei Vorlagen, mit denen jeder Workspace beginnt,
-- haben feste IDs (`brand-studio`, `brand-impact`) — für jedes Konto dieselben.

create table public.brand_kits (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  id         text not null check (length(id) between 1 and 100),
  name       text not null check (length(trim(name)) between 1 and 200),
  style      jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
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
create trigger brand_kits_updated_at        before update on public.brand_kits        for each row execute function public.set_updated_at();

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
-- Auch ein UPDATE kann `user_id` nicht vom Projekt lösen: Soll ein Clip in ein
-- fremdes Projekt wandern, scheitert die RLS-Prüfung an genau diesem Wert.
create trigger clips_set_user_id_on_move before update of project_id, user_id on public.clips for each row execute function public.set_user_id_from_project();

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
    coalesce(new.email, ''),
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

insert into public.profiles (id, email, full_name, avatar_url)
select id, coalesce(email, ''), raw_user_meta_data->>'full_name', raw_user_meta_data->>'avatar_url'
from auth.users
on conflict (id) do nothing;

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
alter table public.brand_kits        enable row level security;

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
-- Clips entstehen im Browser aus dem Ergebnis der Pipeline. `user_id` setzt
-- der Trigger aus dem Projekt; die Prüfung lässt also nur Clips in eigenen
-- Projekten zu.
create policy "clips: eigene lesen"
  on public.clips for select to authenticated
  using (user_id = (select auth.uid()));

create policy "clips: eigene anlegen"
  on public.clips for insert to authenticated
  with check (user_id = (select auth.uid()));

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

-- --- brand_kits ------------------------------------------------------------
create policy "brand_kits: eigene lesen"
  on public.brand_kits for select to authenticated
  using (user_id = (select auth.uid()));

create policy "brand_kits: eigene anlegen"
  on public.brand_kits for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "brand_kits: eigene bearbeiten"
  on public.brand_kits for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "brand_kits: eigene löschen"
  on public.brand_kits for delete to authenticated
  using (user_id = (select auth.uid()));

-- --- stripe_events ---------------------------------------------------------
-- Bewusst KEINE Policy: RLS ist aktiv, also sieht `authenticated` nichts.
-- Nur service_role (Webhook-Handler) greift zu.

-- ============================================================================
-- Grants
-- ============================================================================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- RLS controls rows, not columns. Clients may only edit presentation fields.
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url, workspace_initialized_at) on public.profiles to authenticated;
grant usage on schema public to service_role;
grant all on public.profiles to service_role;

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

-- Durable publication snapshots; OAuth credentials remain outside PostgREST.
create table if not exists public.publishing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_job_id text not null,
  clip_index integer not null check (clip_index >= 0),
  account_id uuid not null references public.social_accounts(id),
  clip jsonb not null,
  source_width integer not null check (source_width > 0),
  source_height integer not null check (source_height > 0),
  proxy_key text not null,
  output_format text not null,
  title text not null,
  status text not null default 'needs_review' check (status in (
    'needs_review', 'pending', 'rendering', 'publishing', 'published',
    'action_required', 'failed', 'cancelled'
  )),
  review_required boolean not null default false,
  publish_at timestamptz not null default now(),
  render_key text,
  checkpoint jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  platform_post_id text,
  platform_post_url text,
  lease_until timestamptz,
  claim_token uuid,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, source_job_id, clip_index, account_id)
);

create index if not exists publishing_jobs_due_idx on public.publishing_jobs(status, publish_at, next_retry_at);
create index if not exists publishing_jobs_owner_idx on public.publishing_jobs(user_id, created_at desc);
alter table public.publishing_jobs enable row level security;
drop policy if exists "publishing_jobs: eigene lesen" on public.publishing_jobs;
create policy "publishing_jobs: eigene lesen" on public.publishing_jobs for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.publishing_jobs from public, anon, authenticated;
-- Checkpoints can contain resumable-upload URLs: never expose them to clients.
grant select (
  id, user_id, source_job_id, clip_index, account_id, clip, source_width, source_height,
  proxy_key, output_format, title, status, review_required, publish_at, render_key,
  attempt_count, last_error, platform_post_id, platform_post_url, lease_until,
  next_retry_at, created_at, updated_at
) on public.publishing_jobs to authenticated;
grant all on public.publishing_jobs to service_role;
drop trigger if exists publishing_jobs_updated_at on public.publishing_jobs;
create trigger publishing_jobs_updated_at before update on public.publishing_jobs
  for each row execute function public.set_updated_at();

-- Browser writes must go through the API, which checks platform capabilities.
revoke insert, update, delete on public.social_accounts from authenticated;
grant select, insert, update, delete on public.social_accounts to service_role;

-- Defense in depth even for service-role inserts: a job must target its owner.
create or replace function public.check_publishing_account_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.social_accounts a where a.id = new.account_id and a.user_id = new.user_id) then
    raise exception 'Publication account owner mismatch';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_publishing_account_owner() from public, anon, authenticated;
drop trigger if exists publishing_jobs_account_owner on public.publishing_jobs;
create trigger publishing_jobs_account_owner before insert or update of user_id, account_id
  on public.publishing_jobs for each row execute function public.check_publishing_account_owner();

-- Claims are atomic. The caller supplies a fencing token and checks it on every
-- write. A 65-minute lease outlasts the worker's 60-minute execution deadline.
create or replace function public.claim_publishing_job(p_id uuid, p_claim_token uuid, p_lease_seconds integer default 3900)
returns public.publishing_jobs language plpgsql security definer set search_path = '' as $$
declare v_row public.publishing_jobs;
begin
  if p_claim_token is null or p_lease_seconds < 60 or p_lease_seconds > 7200 then
    raise exception 'Invalid publication lease';
  end if;
  update public.publishing_jobs j
  set status = 'rendering', claim_token = p_claim_token,
      lease_until = now() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1
  where j.id = p_id and j.attempt_count < 5
    and (j.next_retry_at is null or j.next_retry_at <= now())
    and (
      (j.status = 'pending' and j.publish_at <= now())
      or (j.status = 'needs_review' and j.render_key is null)
      or (j.status in ('rendering', 'publishing') and j.lease_until < now())
    )
    and exists (select 1 from public.social_accounts a where a.id = j.account_id and a.user_id = j.user_id and a.status = 'active')
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.claim_publishing_job(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_publishing_job(uuid, uuid, integer) to service_role;

alter table private.social_account_tokens add column if not exists refresh_lease_until timestamptz;

create or replace function public.get_social_account_tokens(p_user_id uuid, p_account_id uuid)
returns table(access_token text, refresh_token text, token_expires_at timestamptz, refresh_expires_at timestamptz, scopes text[])
language sql security definer set search_path = '' as $$
  select t.access_token, t.refresh_token, t.token_expires_at, t.refresh_expires_at, t.scopes
  from private.social_account_tokens t join public.social_accounts a on a.id = t.social_account_id
  where a.id = p_account_id and a.user_id = p_user_id and a.status = 'active';
$$;
revoke execute on function public.get_social_account_tokens(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_social_account_tokens(uuid, uuid) to service_role;

-- Metadata and encrypted tokens commit together; reconnection does not silently
-- opt a previously revoked connection into automatic public publishing.
create or replace function public.save_social_account_connection(
  p_user_id uuid, p_platform public.social_platform, p_platform_account_id text,
  p_platform_username text, p_avatar_url text, p_meta_page_id text, p_meta_ig_user_id text,
  p_access_token text, p_refresh_token text, p_token_expires_at timestamptz,
  p_refresh_expires_at timestamptz, p_scopes text[]
) returns public.social_accounts language plpgsql security definer set search_path = '' as $$
declare v_account public.social_accounts;
begin
  insert into public.social_accounts (
    user_id, platform, platform_account_id, platform_username, avatar_url,
    meta_page_id, meta_ig_user_id, status, automation_mode
  ) values (
    p_user_id, p_platform, p_platform_account_id, p_platform_username, p_avatar_url,
    p_meta_page_id, p_meta_ig_user_id, 'active', 'review_queue'
  ) on conflict (user_id, platform, platform_account_id) do update set
    platform_username = excluded.platform_username, avatar_url = excluded.avatar_url,
    meta_page_id = excluded.meta_page_id, meta_ig_user_id = excluded.meta_ig_user_id,
    status = 'active', last_error = null,
    automation_mode = case when public.social_accounts.status = 'revoked' then 'review_queue'::public.automation_mode else public.social_accounts.automation_mode end
  returning * into v_account;
  insert into private.social_account_tokens (
    social_account_id, access_token, refresh_token, token_expires_at, refresh_expires_at, scopes
  ) values (
    v_account.id, p_access_token, p_refresh_token, p_token_expires_at, p_refresh_expires_at, p_scopes
  ) on conflict (social_account_id) do update set
    access_token = excluded.access_token,
    refresh_token = excluded.refresh_token,
    token_expires_at = excluded.token_expires_at,
    refresh_expires_at = excluded.refresh_expires_at,
    scopes = excluded.scopes, refresh_lease_until = null, updated_at = now();
  return v_account;
end;
$$;
revoke execute on function public.save_social_account_connection(uuid, public.social_platform, text, text, text, text, text, text, text, timestamptz, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.save_social_account_connection(uuid, public.social_platform, text, text, text, text, text, text, text, timestamptz, timestamptz, text[]) to service_role;

create or replace function public.claim_social_token_refresh(p_user_id uuid, p_account_id uuid, p_expected_access_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.social_account_tokens t set refresh_lease_until = now() + interval '2 minutes'
  where t.social_account_id = p_account_id and t.access_token = p_expected_access_token
    and (t.refresh_lease_until is null or t.refresh_lease_until < now())
    and exists (select 1 from public.social_accounts a where a.id = p_account_id and a.user_id = p_user_id and a.status = 'active');
  return found;
end;
$$;
revoke execute on function public.claim_social_token_refresh(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_social_token_refresh(uuid, uuid, text) to service_role;

create or replace function public.release_social_token_refresh(p_user_id uuid, p_account_id uuid, p_expected_access_token text)
returns void language sql security definer set search_path = '' as $$
  update private.social_account_tokens t set refresh_lease_until = null
  where t.social_account_id = p_account_id and t.access_token = p_expected_access_token
    and exists (select 1 from public.social_accounts a where a.id = p_account_id and a.user_id = p_user_id);
$$;
revoke execute on function public.release_social_token_refresh(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.release_social_token_refresh(uuid, uuid, text) to service_role;

create or replace function public.store_social_account_tokens(
  p_user_id uuid, p_account_id uuid, p_expected_access_token text, p_access_token text,
  p_refresh_token text, p_token_expires_at timestamptz, p_refresh_expires_at timestamptz, p_scopes text[]
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.social_account_tokens t set access_token = p_access_token, refresh_token = p_refresh_token,
    token_expires_at = p_token_expires_at, refresh_expires_at = p_refresh_expires_at,
    scopes = p_scopes, refresh_lease_until = null, updated_at = now()
  where t.social_account_id = p_account_id and t.access_token = p_expected_access_token
    and exists (select 1 from public.social_accounts a where a.id = p_account_id and a.user_id = p_user_id and a.status = 'active');
  return found;
end;
$$;
revoke execute on function public.store_social_account_tokens(uuid, uuid, text, text, text, timestamptz, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.store_social_account_tokens(uuid, uuid, text, text, text, timestamptz, timestamptz, text[]) to service_role;

create or replace function public.disconnect_social_account(p_user_id uuid, p_account_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.social_accounts set status = 'revoked', automation_mode = 'manual', last_error = null
    where id = p_account_id and user_id = p_user_id;
  if not found then return false; end if;
  delete from private.social_account_tokens where social_account_id = p_account_id;
  update public.publishing_jobs set status = 'cancelled', claim_token = null, lease_until = null,
    last_error = 'Kanal wurde getrennt.'
    where account_id = p_account_id and user_id = p_user_id and status in ('needs_review', 'pending', 'failed');
  -- Already-started external requests may complete; the worker records their
  -- actual outcome instead of incorrectly declaring them cancelled.
  return true;
end;
$$;
revoke execute on function public.disconnect_social_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.disconnect_social_account(uuid, uuid) to service_role;

-- ============================================================================
-- Credits nach Quellminuten (auch als Migration
-- 20260930000000_source_minute_credits.sql). Erklärung dort.
-- ============================================================================
-- Jobs use text references because local UUIDs and cloud run IDs differ.
-- There is deliberately no projects FK: local pipeline jobs live on disk.
create table if not exists public.token_credit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reference text not null unique,
  tokens numeric(10,2) not null check (tokens > 0),
  created_at timestamptz not null default now()
);
alter table public.token_credit_events enable row level security;
revoke all on public.token_credit_events from public, anon, authenticated;
grant all on public.token_credit_events to service_role;

create table if not exists public.clip_token_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reference text not null check (length(trim(reference)) > 0),
  tokens numeric(10,2) not null check (tokens > 0 and tokens <> 'NaN'::numeric),
  created_at timestamptz not null default now(),
  unique (user_id, reference)
);
alter table public.clip_token_charges enable row level security;
revoke all on public.clip_token_charges from public, anon, authenticated;
grant all on public.clip_token_charges to service_role;


-- ---------------------------------------------------------------------------
-- Fällige Monatsgutschriften nachholen
-- ---------------------------------------------------------------------------
-- Zeitzone UTC: Stripe rechnet Perioden in UTC, und `+ interval '1 month'`
-- hinge sonst von der Session-Zeitzone ab. Monate zählen immer vom Anker aus,
-- damit ein Abo vom 31. nicht über den Februar auf den 28. abrutscht.
create or replace function public.settle_credit_cycles(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' set timezone = 'UTC'
as $$
declare
  v_profile public.profiles%rowtype;
  v_plan numeric;
  v_cycles integer;
  v_next timestamptz;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Credit profile is missing';
  end if;
  if v_profile.monthly_credits <= 0 or v_profile.credit_cycle_anchor is null
     or v_profile.current_period_end is null
     or v_profile.subscription_status not in ('active', 'trialing') then
    return;
  end if;

  v_plan := v_profile.plan_credits;
  v_cycles := v_profile.credit_cycles_granted;
  loop
    v_next := v_profile.credit_cycle_anchor + make_interval(months => v_cycles);
    exit when v_next > now() or v_next >= v_profile.current_period_end
      or v_cycles >= v_profile.credit_cycles_granted + 240;
    v_plan := least(v_plan, v_profile.monthly_credits) + v_profile.monthly_credits;
    v_cycles := v_cycles + 1;
  end loop;

  if v_cycles <> v_profile.credit_cycles_granted then
    update public.profiles
       set plan_credits = v_plan, credit_cycles_granted = v_cycles,
           cycle_peak_credits = v_profile.monthly_credits, updated_at = now()
     where id = p_user_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guthaben lesen (holt fällige Monate vorher nach)
-- ---------------------------------------------------------------------------
create or replace function public.credit_balance(p_user_id uuid)
returns table (
  tier public.subscription_tier,
  status text,
  plan_credits numeric,
  pack_credits numeric,
  monthly_credits integer,
  next_grant_at timestamptz,
  trial_exports_used integer,
  on_trial boolean
)
language plpgsql security definer set search_path = '' set timezone = 'UTC'
as $$
begin
  perform public.settle_credit_cycles(p_user_id);
  return query
    select p.subscription_tier, p.subscription_status, p.plan_credits, p.pack_credits, p.monthly_credits,
           case when p.monthly_credits > 0 and p.credit_cycle_anchor is not null
                then p.credit_cycle_anchor + make_interval(months => p.credit_cycles_granted) end,
           p.trial_exports_used,
           p.monthly_credits = 0 and p.trial_ended_at is null
      from public.profiles p
     where p.id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Credits für einen Clip-Job abbuchen — atomar und genau einmal je Referenz
-- ---------------------------------------------------------------------------
-- Name und Signatur bleiben, damit laufende Worker nicht brechen; gebucht
-- wird jetzt die Quellminuten-Zahl, erst aus plan_credits, dann aus
-- pack_credits.
create or replace function public.charge_clip_tokens(
  p_user_id uuid,
  p_tokens numeric,
  p_reference text
)
returns boolean language plpgsql security definer set search_path = '' set timezone = 'UTC'
as $$
declare
  v_plan numeric;
  v_pack numeric;
  v_from_plan numeric;
begin
  if p_user_id is null or p_tokens is null or p_tokens <= 0
     or p_tokens::text in ('NaN', 'Infinity', '-Infinity')
     or p_tokens <> round(p_tokens, 2) or p_tokens > 99999999.99
     or p_reference is null or length(trim(p_reference)) = 0 then
    raise exception using errcode = '22023', message = 'Invalid credit charge';
  end if;

  -- Sperrt das Profil. Alle Buchungen eines Kontos laufen dadurch
  -- nacheinander und sehen Guthaben und Buchungsliste zusammen.
  perform public.settle_credit_cycles(p_user_id);
  select plan_credits, pack_credits into v_plan, v_pack
    from public.profiles where id = p_user_id for update;

  if exists (select 1 from public.clip_token_charges where user_id = p_user_id and reference = p_reference) then
    return true;
  end if;
  if v_plan + v_pack < p_tokens then return false; end if;

  v_from_plan := least(v_plan, p_tokens);
  insert into public.clip_token_charges (user_id, reference, tokens)
  values (p_user_id, p_reference, p_tokens);
  update public.profiles
     set plan_credits = plan_credits - v_from_plan,
         pack_credits = pack_credits - (p_tokens - v_from_plan),
         updated_at = now()
   where id = p_user_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Nachkauf gutschreiben — idempotent über die Stripe-Session
-- ---------------------------------------------------------------------------
create or replace function public.grant_token_pack(p_user_id uuid, p_tokens numeric, p_reference text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if p_user_id is null or p_tokens is null or p_tokens <= 0
     or p_tokens::text in ('NaN', 'Infinity', '-Infinity')
     or p_tokens <> trunc(p_tokens) or p_tokens > 99999999
     or p_reference is null or length(trim(p_reference)) = 0 then
    raise exception using errcode = '22023', message = 'Invalid credit pack';
  end if;
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Credit profile is missing';
  end if;
  insert into public.token_credit_events (user_id, reference, tokens)
  values (p_user_id, p_reference, p_tokens) on conflict (reference) do nothing;
  if not found then return false; end if;
  update public.profiles set pack_credits = pack_credits + p_tokens, updated_at = now()
   where id = p_user_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Abo-Stand aus Stripe übernehmen
-- ---------------------------------------------------------------------------
-- Der Webhook liest das Abo frisch bei Stripe und übergibt den aktuellen
-- Stand; mehrfach zugestellte oder vertauschte Ereignisse führen so zum
-- selben Ergebnis.
--
--   Neues Abo (bisher kein Kontingent): Monatskontingent sofort, mit
--     derselben Übertrag-Regel wie jeden Monat — ein Rest aus dem Test
--     bleibt also erhalten.
--   Aufstieg: die Differenz sofort, aber je Monat nur bis zum höchsten schon
--     gutgeschriebenen Kontingent. Hin- und Herwechseln bringt nichts extra.
--   Abstieg: gilt ab der nächsten Monatsgutschrift.
--   Gekündigt: zurück auf Free. Schon gutgeschriebene Credits bleiben.
--   past_due, unpaid, incomplete: Tarif bleibt, neue Gutschriften pausieren
--     (settle_credit_cycles verlangt active oder trialing).
create or replace function public.apply_subscription(
  p_user_id uuid,
  p_tier public.subscription_tier,
  p_monthly_credits integer,
  p_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_subscription_id text,
  p_customer_id text
)
returns void language plpgsql security definer set search_path = '' set timezone = 'UTC'
as $$
declare
  v_profile public.profiles%rowtype;
  v_active boolean;
begin
  if p_user_id is null or p_tier is null or p_monthly_credits is null or p_monthly_credits < 0
     or p_status is null or p_subscription_id is null or length(trim(p_subscription_id)) = 0 then
    raise exception using errcode = '22023', message = 'Invalid subscription state';
  end if;
  v_active := p_status in ('active', 'trialing') and p_tier <> 'free' and p_monthly_credits > 0;

  -- Erst die Monate des bisherigen Tarifs nachholen, dann umstellen.
  perform public.settle_credit_cycles(p_user_id);
  select * into v_profile from public.profiles where id = p_user_id for update;

  if not v_active then
    -- Ereignisse eines anderen als des gespeicherten Abos ändern nichts,
    -- z. B. das Ende eines alten Abos, nachdem schon ein neues läuft.
    if v_profile.stripe_subscription_id is distinct from p_subscription_id then return; end if;
    if p_status in ('canceled', 'incomplete_expired') or p_tier = 'free' then
      update public.profiles
         set subscription_tier = 'free', subscription_status = p_status,
             stripe_subscription_id = null, current_period_end = p_period_end,
             monthly_credits = 0, credit_cycle_anchor = null, credit_cycles_granted = 0,
             cycle_peak_credits = 0,
             stripe_customer_id = coalesce(p_customer_id, stripe_customer_id), updated_at = now()
       where id = p_user_id;
    else
      update public.profiles
         set subscription_status = p_status, current_period_end = p_period_end, updated_at = now()
       where id = p_user_id;
    end if;
    return;
  end if;

  if v_profile.monthly_credits = 0 or v_profile.credit_cycle_anchor is null then
    update public.profiles
       set plan_credits = least(plan_credits, p_monthly_credits) + p_monthly_credits,
           credit_cycle_anchor = coalesce(p_period_start, now()),
           credit_cycles_granted = 1,
           cycle_peak_credits = p_monthly_credits
     where id = p_user_id;
  else
    update public.profiles
       set plan_credits = plan_credits + greatest(0, p_monthly_credits - cycle_peak_credits),
           cycle_peak_credits = greatest(cycle_peak_credits, p_monthly_credits)
     where id = p_user_id;
  end if;

  update public.profiles
     set subscription_tier = p_tier, subscription_status = p_status,
         stripe_subscription_id = p_subscription_id, current_period_end = p_period_end,
         stripe_customer_id = coalesce(p_customer_id, stripe_customer_id),
         monthly_credits = p_monthly_credits,
         trial_ended_at = coalesce(trial_ended_at, now()),
         updated_at = now()
   where id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Exporte im Gratis-Test zählen
-- ---------------------------------------------------------------------------
-- Nur Konten, die noch nie ein Abo hatten, sind begrenzt. Wer gekündigt hat,
-- exportiert seine schon bezahlten Clips weiter. Die Referenz macht einen
-- wiederholten Veröffentlichungsauftrag zu demselben Export.
create table if not exists public.export_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reference text not null check (length(trim(reference)) > 0),
  created_at timestamptz not null default now(),
  unique (user_id, reference)
);
alter table public.export_events enable row level security;
revoke all on public.export_events from public, anon, authenticated;
grant all on public.export_events to service_role;

create or replace function public.consume_trial_export(p_user_id uuid, p_reference text, p_limit integer)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if p_user_id is null or p_limit is null or p_limit < 0
     or p_reference is null or length(trim(p_reference)) = 0 then
    raise exception using errcode = '22023', message = 'Invalid export';
  end if;
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Credit profile is missing';
  end if;
  if v_profile.monthly_credits > 0 or v_profile.trial_ended_at is not null then return true; end if;
  if exists (select 1 from public.export_events where user_id = p_user_id and reference = p_reference) then
    return true;
  end if;
  if v_profile.trial_exports_used >= p_limit then return false; end if;

  insert into public.export_events (user_id, reference) values (p_user_id, p_reference);
  update public.profiles set trial_exports_used = trial_exports_used + 1, updated_at = now()
   where id = p_user_id;
  return true;
end;
$$;

revoke all on function public.settle_credit_cycles(uuid) from public, anon, authenticated;
revoke all on function public.credit_balance(uuid) from public, anon, authenticated;
revoke all on function public.charge_clip_tokens(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.grant_token_pack(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.apply_subscription(uuid, public.subscription_tier, integer, text, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.consume_trial_export(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.settle_credit_cycles(uuid) to service_role;
grant execute on function public.credit_balance(uuid) to service_role;
grant execute on function public.charge_clip_tokens(uuid, numeric, text) to service_role;
grant execute on function public.grant_token_pack(uuid, numeric, text) to service_role;
grant execute on function public.apply_subscription(uuid, public.subscription_tier, integer, text, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.consume_trial_export(uuid, text, integer) to service_role;

-- ============================================================================
-- Rate-Limits für kostenpflichtige KI-Routen (auch als Migration
-- 20260930200000_rate_limits.sql). Zähler pro Konto, Bereich und Zeitfenster.
-- ============================================================================

create table if not exists public.rate_limit_hits (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  bucket       text not null check (length(bucket) between 1 and 100),
  window_start timestamptz not null,
  hits         integer not null default 0 check (hits >= 0),
  primary key (user_id, bucket, window_start)
);

alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from public, anon, authenticated;
grant all on public.rate_limit_hits to service_role;

-- Zählt einen Aufruf im festen Fenster und sagt, ob er noch erlaubt ist.
-- Abgelaufene Fenster desselben Bereichs räumt der nächste Aufruf ab.
create or replace function public.take_rate_limit(
  p_user_id uuid, p_bucket text, p_limit integer, p_window_seconds integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_user_id is null or p_bucket is null or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 31 * 86400 then
    raise exception using errcode = '22023', message = 'Invalid rate limit';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_hits as r (user_id, bucket, window_start, hits)
  values (p_user_id, p_bucket, v_window, 1)
  on conflict (user_id, bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;
  delete from public.rate_limit_hits
  where user_id = p_user_id and bucket = p_bucket and window_start < v_window;
  return v_hits <= p_limit;
end;
$$;

revoke execute on function public.take_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.take_rate_limit(uuid, text, integer, integer) to service_role;

-- ============================================================================
-- Partnerprogramm (auch als Migration
-- 20261006000000_partner_program.sql). Erklärung dort.
-- ============================================================================
create unique index if not exists profiles_partner_code_key on public.profiles (partner_code);
create index if not exists profiles_referred_by_idx on public.profiles (referred_by) where referred_by is not null;

-- Eine Zeile je bezahlter Rechnung oder Checkout-Session eines geworbenen
-- Kontos. `user_id` ist der Partner; das geworbene Konto darf gelöscht
-- werden, die Provision bleibt.
create table if not exists public.partner_commissions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  customer_id      uuid references public.profiles(id) on delete set null,
  reference        text not null unique check (length(trim(reference)) > 0),
  payment_intent   text,
  net_cents        integer not null check (net_cents > 0),
  rate             numeric(5,4) not null check (rate > 0 and rate <= 1),
  commission_cents integer not null check (commission_cents >= 0),
  reversed_cents   integer not null default 0,
  currency         text not null check (currency ~ '^[a-z]{3}$'),
  paid_at          timestamptz not null,
  available_at     timestamptz not null,
  created_at       timestamptz not null default now(),
  constraint partner_commission_reversal check (reversed_cents between 0 and commission_cents)
);
create index if not exists partner_commissions_user_idx on public.partner_commissions (user_id, paid_at desc);
create index if not exists partner_commissions_customer_idx on public.partner_commissions (customer_id, paid_at);
create index if not exists partner_commissions_payment_idx on public.partner_commissions (payment_intent)
  where payment_intent is not null;
alter table public.partner_commissions enable row level security;
revoke all on public.partner_commissions from public, anon, authenticated;
grant all on public.partner_commissions to service_role;

create table if not exists public.partner_payouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  currency     text not null default 'eur' check (currency ~ '^[a-z]{3}$'),
  reference    text not null check (length(trim(reference)) > 0),
  created_at   timestamptz not null default now()
);
create index if not exists partner_payouts_user_idx on public.partner_payouts (user_id, created_at desc);
alter table public.partner_payouts enable row level security;
revoke all on public.partner_payouts from public, anon, authenticated;
grant all on public.partner_payouts to service_role;

-- ---------------------------------------------------------------------------
-- Partnercode: 8 Zeichen ohne leicht verwechselbare (0/o, 1/l/i)
-- ---------------------------------------------------------------------------
-- Zufall aus gen_random_uuid(), das ohne pgcrypto und unabhängig vom
-- search_path verfügbar ist. Die Bytes 6 und 8 tragen Versions- und
-- Variantenbits und bleiben außen vor.
create or replace function public.new_partner_code()
returns text language plpgsql volatile set search_path = ''
as $$
declare
  v_alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_code text := '';
  v_index integer;
begin
  foreach v_index in array array[0, 1, 2, 3, 4, 5, 7, 9] loop
    v_code := v_code || substr(v_alphabet, 1 + get_byte(v_bytes, v_index) % length(v_alphabet), 1);
  end loop;
  return v_code;
end;
$$;

-- Erst beim ersten Aufruf der Partnerseite, nicht für jedes Konto: Ein
-- Zusammenstoß beim Anlegen des Profils ließe sonst die Registrierung scheitern.
create or replace function public.ensure_partner_code(p_user_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
begin
  select partner_code into v_code from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Partner profile is missing';
  end if;
  if v_code is not null then return v_code; end if;
  for attempt in 1..10 loop
    begin
      update public.profiles set partner_code = public.new_partner_code(), updated_at = now()
       where id = p_user_id
      returning partner_code into v_code;
      return v_code;
    exception when unique_violation then
      null; -- schon vergeben, nächster Versuch
    end;
  end loop;
  raise exception 'No free partner code';
end;
$$;

-- ---------------------------------------------------------------------------
-- Angemeldetes Konto einem Partner zuordnen
-- ---------------------------------------------------------------------------
-- Ruft der Proxy mit dem Code aus dem Cookie auf, sobald jemand angemeldet
-- ist. Zugeordnet wird höchstens einmal, nie an sich selbst und nur, solange
-- das Konto noch nie ein Abo hatte — Bestandskunden bringen keine Provision.
create or replace function public.claim_referral(p_code text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_partner uuid;
  v_profile public.profiles%rowtype;
begin
  if v_user is null or p_code is null or lower(trim(p_code)) !~ '^[a-z0-9]{4,32}$' then return false; end if;
  select id into v_partner from public.profiles where partner_code = lower(trim(p_code));
  if v_partner is null or v_partner = v_user then return false; end if;

  select * into v_profile from public.profiles where id = v_user for update;
  if not found or v_profile.referred_by is not null or v_profile.trial_ended_at is not null
     or v_profile.stripe_subscription_id is not null or v_profile.monthly_credits > 0 then
    return false;
  end if;
  update public.profiles set referred_by = v_partner, referred_at = now(), updated_at = now()
   where id = v_user;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Provision für eine Zahlung buchen — idempotent über die Stripe-Referenz
-- ---------------------------------------------------------------------------
-- Gibt die Provision in Cent zurück, null wenn keine anfällt: Konto ohne
-- Partner oder Laufzeit vorbei. Die Laufzeit beginnt mit der ersten Zahlung.
create or replace function public.record_partner_commission(
  p_customer_id uuid,
  p_reference text,
  p_payment_intent text,
  p_net_cents integer,
  p_currency text,
  p_paid_at timestamptz,
  p_rate numeric,
  p_months integer,
  p_hold_days integer
)
returns integer language plpgsql security definer set search_path = '' set timezone = 'UTC'
as $$
declare
  v_partner uuid;
  v_first timestamptz;
  v_commission integer;
begin
  if p_customer_id is null or p_reference is null or length(trim(p_reference)) = 0
     or p_net_cents is null or p_net_cents <= 0
     or p_currency is null or lower(p_currency) !~ '^[a-z]{3}$' or p_paid_at is null
     or p_rate is null or p_rate <= 0 or p_rate > 1
     or p_months is null or p_months < 1 or p_hold_days is null or p_hold_days < 0 then
    raise exception using errcode = '22023', message = 'Invalid partner commission';
  end if;

  -- Sperrt das geworbene Konto: Zwei Rechnungen gleichzeitig sehen dieselbe
  -- erste Zahlung.
  select referred_by into v_partner from public.profiles where id = p_customer_id for update;

  -- Schon gebucht: Stripe stellt Ereignisse mehrfach zu.
  select commission_cents into v_commission from public.partner_commissions where reference = p_reference;
  if found then return v_commission; end if;
  if v_partner is null then return null; end if;

  select min(paid_at) into v_first from public.partner_commissions where customer_id = p_customer_id;
  if v_first is not null and p_paid_at >= v_first + make_interval(months => p_months) then return null; end if;

  v_commission := floor(p_net_cents * p_rate)::integer;
  insert into public.partner_commissions (user_id, customer_id, reference, payment_intent, net_cents, rate,
                                          commission_cents, currency, paid_at, available_at)
  values (v_partner, p_customer_id, p_reference, nullif(trim(p_payment_intent), ''), p_net_cents, p_rate,
          v_commission, lower(p_currency), p_paid_at, p_paid_at + make_interval(days => p_hold_days));
  return v_commission;
end;
$$;

-- ---------------------------------------------------------------------------
-- Erstattung oder Rückbuchung: Provision anteilig zurücknehmen
-- ---------------------------------------------------------------------------
-- Stripe meldet den bisher erstatteten Gesamtbetrag. Der Abzug wächst nur,
-- damit vertauscht zugestellte Ereignisse nichts zurückdrehen.
create or replace function public.reverse_partner_commission(
  p_payment_intent text,
  p_refunded_cents integer,
  p_amount_cents integer
)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_rows integer;
begin
  if p_payment_intent is null or length(trim(p_payment_intent)) = 0
     or p_refunded_cents is null or p_refunded_cents < 0 or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception using errcode = '22023', message = 'Invalid partner reversal';
  end if;
  update public.partner_commissions
     set reversed_cents = greatest(reversed_cents, least(commission_cents,
           ceil(commission_cents::numeric * least(p_refunded_cents, p_amount_cents) / p_amount_cents)::integer))
   where payment_intent = p_payment_intent;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stand eines Partners (legt den Code beim ersten Aufruf an)
-- ---------------------------------------------------------------------------
-- `available_cents` kann negativ sein, wenn nach einer Auszahlung erstattet
-- wurde — die nächste Provision gleicht das aus.
create or replace function public.partner_overview(p_user_id uuid)
returns table (
  partner_code text,
  signups integer,
  customers integer,
  pending_cents bigint,
  available_cents bigint,
  paid_out_cents bigint,
  next_release_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
begin
  v_code := public.ensure_partner_code(p_user_id);
  return query
    with earned as (
      select coalesce(sum(c.commission_cents - c.reversed_cents) filter (where c.available_at > now()), 0)::bigint as pending,
             coalesce(sum(c.commission_cents - c.reversed_cents) filter (where c.available_at <= now()), 0)::bigint as released,
             (count(distinct c.customer_id) filter (where c.commission_cents > c.reversed_cents))::integer as paying,
             min(c.available_at) filter (where c.available_at > now()) as next_release
        from public.partner_commissions c
       where c.user_id = p_user_id
    ), paid as (
      select coalesce(sum(o.amount_cents), 0)::bigint as total
        from public.partner_payouts o
       where o.user_id = p_user_id
    )
    select v_code,
           (select count(*)::integer from public.profiles p where p.referred_by = p_user_id),
           e.paying, e.pending, e.released - paid.total, paid.total, e.next_release
      from earned e, paid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auszahlungen (für scripts/partner-payouts.ts)
-- ---------------------------------------------------------------------------
create or replace function public.partner_payables(p_min_cents integer)
returns table (user_id uuid, email text, partner_code text, available_cents bigint)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.email, p.partner_code, x.released - coalesce(y.paid, 0)
    from (select c.user_id, sum(c.commission_cents - c.reversed_cents)::bigint as released
            from public.partner_commissions c
           where c.available_at <= now()
           group by c.user_id) x
    join public.profiles p on p.id = x.user_id
    left join (select o.user_id, sum(o.amount_cents)::bigint as paid
                 from public.partner_payouts o
                group by o.user_id) y on y.user_id = x.user_id
   where x.released - coalesce(y.paid, 0) >= greatest(p_min_cents, 1)
   order by 4 desc;
$$;

create or replace function public.record_partner_payout(p_user_id uuid, p_amount_cents integer, p_reference text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_available bigint;
  v_id uuid;
begin
  if p_user_id is null or p_amount_cents is null or p_amount_cents <= 0
     or p_reference is null or length(trim(p_reference)) = 0 then
    raise exception using errcode = '22023', message = 'Invalid partner payout';
  end if;
  -- Sperrt den Partner, damit zwei Auszahlungen nicht denselben Betrag sehen.
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Partner profile is missing';
  end if;
  select o.available_cents into v_available from public.partner_overview(p_user_id) o;
  if p_amount_cents > v_available then
    raise exception using errcode = '22023', message = 'Payout exceeds the available balance';
  end if;
  insert into public.partner_payouts (user_id, amount_cents, reference)
  values (p_user_id, p_amount_cents, trim(p_reference))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.new_partner_code() from public, anon, authenticated;
revoke execute on function public.ensure_partner_code(uuid) from public, anon, authenticated;
revoke execute on function public.claim_referral(text) from public, anon;
revoke execute on function public.record_partner_commission(uuid, text, text, integer, text, timestamptz, numeric, integer, integer) from public, anon, authenticated;
revoke execute on function public.reverse_partner_commission(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.partner_overview(uuid) from public, anon, authenticated;
revoke execute on function public.partner_payables(integer) from public, anon, authenticated;
revoke execute on function public.record_partner_payout(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.claim_referral(text) to authenticated, service_role;
grant execute on function public.ensure_partner_code(uuid) to service_role;
grant execute on function public.record_partner_commission(uuid, text, text, integer, text, timestamptz, numeric, integer, integer) to service_role;
grant execute on function public.reverse_partner_commission(text, integer, integer) to service_role;
grant execute on function public.partner_overview(uuid) to service_role;
grant execute on function public.partner_payables(integer) to service_role;
grant execute on function public.record_partner_payout(uuid, integer, text) to service_role;

-- ============================================================================
-- Support-Anfragen (auch als Migration
-- 20261006120000_support_requests.sql). Erklärung dort.
-- ============================================================================
create table if not exists public.support_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  email      text not null check (length(trim(email)) > 0),
  message    text not null check (length(trim(message)) between 1 and 4000),
  -- Chatverlauf mit dem Assistenten, falls der Nutzer ihn mitschickt: [{ role, text }].
  transcript jsonb not null default '[]'::jsonb check (jsonb_typeof(transcript) = 'array'),
  page       text check (page is null or length(page) <= 200),
  mailed_at  timestamptz,
  mail_error text,
  created_at timestamptz not null default now()
);
create index if not exists support_requests_user_idx on public.support_requests (user_id, created_at desc);
create index if not exists support_requests_unmailed_idx on public.support_requests (created_at) where mailed_at is null;
alter table public.support_requests enable row level security;
revoke all on public.support_requests from public, anon, authenticated;
grant all on public.support_requests to service_role;
