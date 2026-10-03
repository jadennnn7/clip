-- ============================================================================
-- Workspace in der Datenbank: Projekte, Clips und Brand Kits je Konto
-- ============================================================================
-- Bis hierher lag der Workspace nur im localStorage des Browsers — auf einem
-- anderen Gerät oder nach dem Leeren des Caches war alles weg. Jetzt liest und
-- schreibt die App ihn über /api/workspace, mit RLS als Mandantentrennung.
--
-- Eigenständig und wiederholbar: Installationen, die nur die Token- und
-- Publishing-Migrationen haben, bekommen `projects` und `clips` hier zum
-- ersten Mal; bei einer Installation aus schema.sql kommen nur die neuen
-- Spalten, Policies und `brand_kits` dazu.
-- ============================================================================

begin;

do $$ begin
  create type public.project_source as enum ('upload', 'youtube', 'drive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.project_status as enum (
    'draft', 'queued', 'downloading', 'transcribing', 'analyzing', 'reframing', 'ready', 'error'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.clip_render_status as enum ('pending', 'queued', 'rendering', 'ready', 'error');
exception when duplicate_object then null; end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  title              text not null default 'Unbenanntes Projekt',
  source_type        public.project_source not null,
  source_url         text,
  source_key         text,
  proxy_key          text,
  audio_key          text,
  waveform_key       text,
  thumbnail_url      text,
  duration_seconds   numeric(10,2),
  width              integer,
  height             integer,
  fps                numeric(6,3),
  status             public.project_status not null default 'draft',
  error_message      text,
  trigger_run_id     text,
  rights_confirmed   boolean not null default false,
  rights_confirmed_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint youtube_requires_rights_confirmation
    check (source_type <> 'youtube' or rights_confirmed = true)
);

-- Einstellungen des Imports (Sprache, Cliplänge, Format) und der
-- Publishing-Plan samt ursprünglicher Clip-Reihenfolge.
alter table public.projects add column if not exists settings   jsonb;
alter table public.projects add column if not exists publishing jsonb;

create index if not exists projects_user_created_idx on public.projects (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- clips
-- ---------------------------------------------------------------------------

create table if not exists public.clips (
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
  words             jsonb not null default '[]'::jsonb,
  caption_style     jsonb not null default '{}'::jsonb,
  crop_keyframes    jsonb not null default '[]'::jsonb,
  render_status     public.clip_render_status not null default 'pending',
  render_key        text,
  render_job_id     text,
  render_error      text,
  thumbnail_url     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint clip_range_valid check (end_seconds > start_seconds),
  constraint virality_score_range check (virality_score between 0 and 100)
);

alter table public.clips add column if not exists editorial       jsonb;
alter table public.clips add column if not exists analysis_source text check (analysis_source in ('ai', 'heuristic'));
alter table public.clips add column if not exists analysis_notice text;
alter table public.clips add column if not exists segments        jsonb;
alter table public.clips add column if not exists overlays        jsonb not null default '[]'::jsonb;
alter table public.clips add column if not exists video_settings  jsonb;
-- Bisher eigene Felder des Browser-Workspace, jetzt am Clip selbst.
alter table public.clips add column if not exists removed_words   jsonb not null default '[]'::jsonb;
alter table public.clips add column if not exists output_format   text;
alter table public.clips add column if not exists is_favorite     boolean not null default false;

do $$ begin
  alter table public.clips add constraint clips_output_format_valid
    check (output_format is null or output_format in ('9:16', '1:1', '16:9'));
exception when duplicate_object then null; end $$;

create index if not exists clips_project_score_idx on public.clips (project_id, virality_score desc);
create index if not exists clips_user_idx          on public.clips (user_id);

-- ---------------------------------------------------------------------------
-- brand_kits — gespeicherte Untertitel-Stile
-- ---------------------------------------------------------------------------
-- Die ID ist Text: Die zwei Vorlagen, mit denen jeder Workspace beginnt,
-- haben feste IDs (`brand-studio`, `brand-impact`) — für jedes Konto dieselben.

create table if not exists public.brand_kits (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  id         text not null check (length(id) between 1 and 100),
  name       text not null check (length(trim(name)) between 1 and 200),
  style      jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Einmal gesetzt, wenn der Workspace angelegt ist (Vorlagen oder übernommene
-- Browser-Daten). Danach bleiben gelöschte Vorlagen gelöscht.
alter table public.profiles add column if not exists workspace_initialized_at timestamptz;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
drop trigger if exists clips_updated_at on public.clips;
create trigger clips_updated_at before update on public.clips
  for each row execute function public.set_updated_at();
drop trigger if exists brand_kits_updated_at on public.brand_kits;
create trigger brand_kits_updated_at before update on public.brand_kits
  for each row execute function public.set_updated_at();

-- `user_id` eines Clips folgt immer seinem Projekt — auch wenn ein Clip per
-- UPDATE ein anderes Projekt bekommen soll. Gehört das fremden Konten,
-- scheitert die RLS-Prüfung an genau diesem Wert.
create or replace function public.set_user_id_from_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select p.user_id into new.user_id from public.projects p where p.id = new.project_id;
  if new.user_id is null then
    raise exception 'Projekt % existiert nicht', new.project_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.set_user_id_from_project() from public;

drop trigger if exists clips_set_user_id on public.clips;
create trigger clips_set_user_id before insert on public.clips
  for each row execute function public.set_user_id_from_project();
drop trigger if exists clips_set_user_id_on_move on public.clips;
create trigger clips_set_user_id_on_move before update of project_id, user_id on public.clips
  for each row execute function public.set_user_id_from_project();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.projects   enable row level security;
alter table public.clips      enable row level security;
alter table public.brand_kits enable row level security;

drop policy if exists "projects: eigene lesen" on public.projects;
create policy "projects: eigene lesen" on public.projects for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "projects: eigene anlegen" on public.projects;
create policy "projects: eigene anlegen" on public.projects for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "projects: eigene bearbeiten" on public.projects;
create policy "projects: eigene bearbeiten" on public.projects for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "projects: eigene löschen" on public.projects;
create policy "projects: eigene löschen" on public.projects for delete to authenticated
  using (user_id = (select auth.uid()));

-- Clips entstehen im Browser aus dem Ergebnis der Pipeline. Der Trigger oben
-- setzt `user_id` aus dem Projekt; die Prüfung lässt also nur Clips in
-- eigenen Projekten zu.
drop policy if exists "clips: eigene lesen" on public.clips;
create policy "clips: eigene lesen" on public.clips for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "clips: eigene anlegen" on public.clips;
create policy "clips: eigene anlegen" on public.clips for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "clips: eigene bearbeiten" on public.clips;
create policy "clips: eigene bearbeiten" on public.clips for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "clips: eigene löschen" on public.clips;
create policy "clips: eigene löschen" on public.clips for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "brand_kits: eigene lesen" on public.brand_kits;
create policy "brand_kits: eigene lesen" on public.brand_kits for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "brand_kits: eigene anlegen" on public.brand_kits;
create policy "brand_kits: eigene anlegen" on public.brand_kits for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "brand_kits: eigene bearbeiten" on public.brand_kits;
create policy "brand_kits: eigene bearbeiten" on public.brand_kits for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "brand_kits: eigene löschen" on public.brand_kits;
create policy "brand_kits: eigene löschen" on public.brand_kits for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.projects, public.clips, public.brand_kits to authenticated;
grant all on public.projects, public.clips, public.brand_kits to service_role;
-- Abo und Guthaben bleiben gesperrt; nur diese Markierung darf der Nutzer setzen.
grant update (workspace_initialized_at) on public.profiles to authenticated;

commit;
