-- ============================================================================
-- Support-Anfragen aus dem Hilfe-Widget
-- ============================================================================
-- Kann der KI-Assistent nicht helfen, schreibt der Nutzer im Widget an das
-- Team. Die Anfrage geht per E-Mail an den Support und steht zusätzlich hier:
-- Eine Mail kann hängen bleiben, die Zeile nicht. `mailed_at` bleibt leer,
-- solange der Versand nicht geklappt hat; `mail_error` sagt, warum.
--
-- Nur service_role liest und schreibt. Die Antwort kommt per E-Mail, in der
-- App gibt es keine Liste. Mit dem Konto verschwinden auch seine Anfragen.
--
-- Wiederholbar.
-- ============================================================================

begin;

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

commit;
