-- Token-Guthaben: Packs werden als idempotente Buchung gutgeschrieben.
-- Ein Stripe-Webhook kann mehrfach zugestellt werden; die Referenz verhindert
-- doppelte Token.
create table if not exists public.token_credit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reference text not null unique,
  tokens numeric(10,2) not null check (tokens > 0),
  created_at timestamptz not null default now()
);

alter table public.token_credit_events enable row level security;
revoke all on public.token_credit_events from anon, authenticated;

create or replace function public.grant_token_pack(
  p_user_id uuid,
  p_tokens numeric,
  p_reference text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tokens <= 0 or p_reference is null or length(trim(p_reference)) = 0 then
    return false;
  end if;

  insert into public.token_credit_events (user_id, reference, tokens)
  values (p_user_id, p_reference, p_tokens)
  on conflict (reference) do nothing;

  if not found then return false; end if;

  update public.profiles
     set render_minutes_limit = render_minutes_limit + p_tokens,
         updated_at = now()
   where id = p_user_id;
  return found;
end;
$$;

revoke all on function public.grant_token_pack(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.grant_token_pack(uuid, numeric, text) to service_role;
