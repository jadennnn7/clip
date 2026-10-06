-- ============================================================================
-- Partnerprogramm
-- ============================================================================
-- Jedes Konto kann Ocuris über einen eigenen Link (`/?ref=<code>`)
-- weiterempfehlen. Wer darüber kommt und ein Konto anlegt, wird dem Partner
-- zugeordnet (`profiles.referred_by`), solange er noch nie ein Abo hatte. Von
-- jeder Zahlung des geworbenen Kontos bekommt der Partner einen Anteil. Satz,
-- Laufzeit und Wartezeit übergibt der Stripe-Webhook aus src/lib/partner.ts —
-- wie bei den Credits steht hier keine Geschäftszahl.
--
-- Provisionen sind ein Buch, keine Kontostände: Erstattungen und
-- Rückbuchungen mindern die jeweilige Zeile, Auszahlungen stehen in einer
-- eigenen Tabelle. Auszahlbar ist, was die Wartezeit hinter sich hat, minus
-- allem schon Ausgezahlten. Eine Erstattung nach der Auszahlung verrechnet
-- sich so mit der nächsten.
--
-- Wiederholbar.
-- ============================================================================

begin;

alter table public.profiles add column if not exists partner_code text;
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists referred_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_partner_code_format') then
    alter table public.profiles add constraint profiles_partner_code_format
      check (partner_code ~ '^[a-z0-9]{4,32}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_not_self_referred') then
    alter table public.profiles add constraint profiles_not_self_referred
      check (referred_by is distinct from id);
  end if;
end;
$$;

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

commit;
