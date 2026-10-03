-- ============================================================================
-- Credits nach Quellminuten: Gratis-Test, Abo-Kontingent und Nachkäufe
-- ============================================================================
-- 1 Credit = 1 Minute analysiertes Ausgangsvideo. Das Guthaben liegt in zwei
-- Töpfen, damit eine Abo-Änderung nie bezahlte Nachkäufe überschreibt:
--
--   plan_credits  Gratis-Test (einmalig) und die monatlichen Kontingente
--                 des Abos. Jede Monatsgutschrift überträgt höchstens ein
--                 Monatskontingent: neu = least(rest, monat) + monat.
--   pack_credits  Nachkäufe. Verfallen nicht, keine Abo-Änderung setzt sie
--                 zurück.
--
-- Abgebucht wird zuerst aus plan_credits (die verfallen eher), dann aus
-- pack_credits.
--
-- Monatsgutschriften holt settle_credit_cycles nach, sobald gebucht oder das
-- Guthaben gelesen wird — so bekommen auch Jahresabos ihr Kontingent Monat für
-- Monat, ohne Cronjob. Gutgeschrieben wird nur ein Monat, der vor
-- current_period_end beginnt: Ein Monatsabo bekommt den nächsten Monat erst,
-- wenn Stripe die bezahlte Verlängerung gemeldet hat.
--
-- Die alten Spalten render_minutes_* bleiben für reserve_/refund_render_minutes
-- stehen, bestimmen das Clip-Guthaben aber nicht mehr.
--
-- Wiederholbar: Spalten anlegen und alte Stände übernehmen passiert nur beim
-- ersten Lauf, Funktionen werden ersetzt.
-- ============================================================================

begin;

-- Beide Buchungstabellen gibt es seit den Token-Migrationen. Für den Fall,
-- dass nur eine davon eingespielt wurde, hier noch einmal.
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

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'plan_credits') then
    return;
  end if;

  alter table public.profiles
    add column plan_credits          numeric(10,2) not null default 30,
    add column pack_credits          numeric(10,2) not null default 0,
    add column monthly_credits       integer not null default 0,
    add column credit_cycle_anchor   timestamptz,
    add column credit_cycles_granted integer not null default 0,
    add column cycle_peak_credits    integer not null default 0,
    add column trial_exports_used    integer not null default 0,
    add column trial_ended_at        timestamptz,
    add constraint credits_non_negative check (
      plan_credits >= 0 and pack_credits >= 0 and monthly_credits >= 0
      and credit_cycles_granted >= 0 and cycle_peak_credits >= 0 and trial_exports_used >= 0
    );

  -- Übernahme der alten Stände. Nachkäufe bleiben erhalten, soweit sie noch
  -- nicht verbraucht sind. Das Abo-Kontingent zählte in Clip-Minuten und ist
  -- mit Quellminuten nicht vergleichbar: Gratis-Konten bekommen den neuen
  -- Test, bezahlte Konten ein volles Monatskontingent des neuen Tarifs. Die
  -- nächste Monatsgutschrift wartet auf das nächste Stripe-Ereignis, das
  -- Status und Periode setzt.
  update public.profiles p set
    pack_credits = least(
      greatest(0, p.render_minutes_limit - p.render_minutes_used),
      coalesce((select sum(e.tokens) from public.token_credit_events e where e.user_id = p.id), 0)
    ),
    monthly_credits = case p.subscription_tier
      when 'starter' then 150 when 'pro' then 450 when 'agency' then 1200 else 0 end,
    plan_credits = case p.subscription_tier
      when 'starter' then 150 when 'pro' then 450 when 'agency' then 1200 else 30 end,
    cycle_peak_credits = case p.subscription_tier
      when 'starter' then 150 when 'pro' then 450 when 'agency' then 1200 else 0 end,
    credit_cycle_anchor = case when p.subscription_tier <> 'free' then now() end,
    credit_cycles_granted = case when p.subscription_tier <> 'free' then 1 else 0 end,
    trial_ended_at = case when p.subscription_tier <> 'free' then now() end;
end;
$$;

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

notify pgrst, 'reload schema';
commit;
