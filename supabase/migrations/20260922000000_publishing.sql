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
