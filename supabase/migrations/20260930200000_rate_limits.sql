-- ============================================================================
-- Rate-Limits für kostenpflichtige KI-Routen
-- ============================================================================
-- Hilfe-Assistent und Hook-Titel rufen bei jeder Anfrage Gemini auf. Ein
-- Zähler pro Konto, Bereich und Zeitfenster begrenzt, wie oft das geht — in
-- der Datenbank, weil ein Zähler im Speicher jeder Serverless-Instanz einzeln
-- gälte. Wiederholbar.
-- ============================================================================

begin;

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

commit;
