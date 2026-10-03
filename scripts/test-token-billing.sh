#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="omegaclip-tokens-test-$$"
MIGRATION=20260922120000_clip_token_billing.sql
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --rm -d --name "$NAME" -e POSTGRES_PASSWORD=postgres postgres:16 >/dev/null
for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker cp "$ROOT/supabase/tests/00-bootstrap.sql" "$NAME:/tmp/bootstrap.sql" >/dev/null
docker cp "$ROOT/supabase/schema.sql" "$NAME:/tmp/schema.sql" >/dev/null
docker cp "$ROOT/supabase/migrations/$MIGRATION" "$NAME:/tmp/migration.sql" >/dev/null
docker cp "$ROOT/supabase/tests/02-token-billing.sql" "$NAME:/tmp/tests.sql" >/dev/null

run_sql() { docker exec "$NAME" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -q "${@:2}"; }
run_sql postgres -f /tmp/bootstrap.sql
for database in postgres canonical; do
  if [ "$database" = canonical ]; then
    run_sql postgres -c 'create database canonical'
    # Roles are cluster-wide and were already created by the first bootstrap.
    docker exec "$NAME" sh -c "sed '/^create role /d' /tmp/bootstrap.sql > /tmp/bootstrap-canonical.sql"
    run_sql canonical -f /tmp/bootstrap-canonical.sql
  fi
  run_sql "$database" -c "insert into auth.users (id, email) values ('aaaaaaaa-1111-1111-1111-111111111111', 'token-a@example.com')"
  if [ "$database" = postgres ]; then
    run_sql "$database" -f /tmp/migration.sql
    run_sql "$database" -f /tmp/migration.sql
  else
    run_sql "$database" -f /tmp/schema.sql
  fi
  run_sql "$database" -f /tmp/tests.sql
done

# Run separate transactions concurrently, not just repeated calls in one session.
run_sql postgres -c "insert into auth.users (id, email) values ('dddddddd-4444-4444-4444-444444444444', 'concurrent@example.com')"
pids=()
for reference in duplicate duplicate duplicate duplicate; do
  run_sql postgres -c "select public.charge_clip_tokens('dddddddd-4444-4444-4444-444444444444', 6, 'clip:$reference')" >/dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
run_sql postgres -c "do \$\$ begin if (select render_minutes_used from public.profiles where id = 'dddddddd-4444-4444-4444-444444444444') <> 6 or (select count(*) from public.clip_token_charges where user_id = 'dddddddd-4444-4444-4444-444444444444') <> 1 then raise exception 'Concurrent retries charged twice'; end if; end \$\$"
pids=()
for reference in next-one next-two next-three; do
  run_sql postgres -c "select public.charge_clip_tokens('dddddddd-4444-4444-4444-444444444444', 2, 'clip:$reference')" >/dev/null &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
run_sql postgres -c "do \$\$ begin if (select render_minutes_used from public.profiles where id = 'dddddddd-4444-4444-4444-444444444444') <> 8 or (select count(*) from public.clip_token_charges where user_id = 'dddddddd-4444-4444-4444-444444444444') <> 2 then raise exception 'Concurrent jobs overdrew balance'; end if; end \$\$"

# Reapplying a migration must preserve the now-charged balances and pack credit.
run_sql postgres -c 'grant update (render_minutes_used, render_minutes_limit) on public.profiles to authenticated'
run_sql postgres -f /tmp/migration.sql
run_sql postgres -c "do \$\$ begin if (select render_minutes_used from public.profiles where id = 'dddddddd-4444-4444-4444-444444444444') <> 8 or (select render_minutes_limit from public.profiles where id = 'aaaaaaaa-1111-1111-1111-111111111111') <> 68 then raise exception 'Migration reset an existing balance'; end if; end \$\$"
run_sql postgres -c "do \$\$ begin if has_column_privilege('authenticated', 'public.profiles', 'render_minutes_used', 'UPDATE') or has_column_privilege('authenticated', 'public.profiles', 'render_minutes_limit', 'UPDATE') then raise exception 'Migration retained unsafe older column grants'; end if; end \$\$"
echo 'Token billing: bootstrap, canonical schema, retries, permissions and concurrent charges passed.'
