-- Standalone credit bootstrap for installations that only have Supabase Auth.
-- Safe to reapply: existing profile balances and charge references are retained.
begin;

do $$
begin
  create type public.subscription_tier as enum ('free', 'starter', 'pro', 'agency');
exception when duplicate_object then null;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_tier public.subscription_tier not null default 'free',
  subscription_status text not null default 'inactive',
  current_period_end timestamptz,
  render_minutes_limit integer not null default 8,
  render_minutes_used numeric(10,2) not null default 0,
  render_minutes_reset_at timestamptz not null default (now() + interval '30 days'),
  max_social_accounts integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint render_minutes_used_non_negative check (render_minutes_used >= 0)
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts created before this migration need a profile too. Never reset an
-- existing account's plan, purchased tokens, or consumption during backfill.
insert into public.profiles (id, email, full_name, avatar_url)
select id, coalesce(email, ''), raw_user_meta_data->>'full_name', raw_user_meta_data->>'avatar_url'
from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
drop policy if exists "profiles: eigenes Profil lesen" on public.profiles;
create policy "profiles: eigenes Profil lesen" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists "profiles: eigenes Profil bearbeiten" on public.profiles;
create policy "profiles: eigenes Profil bearbeiten" on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant usage on schema public to anon, authenticated, service_role;
revoke all on public.profiles from public, anon, authenticated;
-- REVOKE at table level does not remove older column-level grants.
do $$
declare v_columns text;
begin
  select string_agg(quote_ident(attname), ', ') into v_columns
  from pg_attribute where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke all privileges (%s) on public.profiles from public, anon, authenticated', v_columns);
end;
$$;
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
grant all on public.profiles to service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Jobs use text references because local UUIDs and cloud run IDs differ.
-- There is deliberately no projects FK: local pipeline jobs live on disk.
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

create or replace function public.charge_clip_tokens(
  p_user_id uuid,
  p_tokens numeric,
  p_reference text
)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_used numeric;
  v_limit numeric;
begin
  if p_user_id is null or p_tokens is null or p_tokens <= 0
     or p_tokens::text in ('NaN', 'Infinity', '-Infinity')
     or p_tokens <> round(p_tokens, 2) or p_tokens > 99999999.99
     or p_reference is null or length(trim(p_reference)) = 0 then
    raise exception using errcode = '22023', message = 'Invalid clip token charge';
  end if;

  -- Every charge for this account holds the same lock. Concurrent retries and
  -- different jobs therefore see the committed balance and ledger together.
  select render_minutes_used, render_minutes_limit into v_used, v_limit
  from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Token profile is missing';
  end if;

  if exists (select 1 from public.clip_token_charges where user_id = p_user_id and reference = p_reference) then
    return true;
  end if;
  if v_used + p_tokens > v_limit then return false; end if;

  insert into public.clip_token_charges (user_id, reference, tokens)
  values (p_user_id, p_reference, p_tokens);
  update public.profiles set render_minutes_used = render_minutes_used + p_tokens, updated_at = now()
  where id = p_user_id;
  return true;
end;
$$;

revoke all on function public.charge_clip_tokens(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.charge_clip_tokens(uuid, numeric, text) to service_role;

-- Include pack credits so this bootstrap also supports the existing webhook.
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

create or replace function public.grant_token_pack(p_user_id uuid, p_tokens numeric, p_reference text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  -- Packs contain whole tokens; reject values that an integer limit would round.
  if p_user_id is null or p_tokens is null or p_tokens <= 0
     or p_tokens::text in ('NaN', 'Infinity', '-Infinity')
     or p_tokens <> trunc(p_tokens) or p_tokens > 99999999
     or p_reference is null or length(trim(p_reference)) = 0 then
    raise exception using errcode = '22023', message = 'Invalid token pack';
  end if;
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Token profile is missing';
  end if;
  insert into public.token_credit_events (user_id, reference, tokens)
  values (p_user_id, p_reference, p_tokens) on conflict (reference) do nothing;
  if not found then return false; end if;
  update public.profiles set render_minutes_limit = render_minutes_limit + p_tokens, updated_at = now()
  where id = p_user_id;
  return true;
end;
$$;
revoke all on function public.grant_token_pack(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.grant_token_pack(uuid, numeric, text) to service_role;

notify pgrst, 'reload schema';
commit;
