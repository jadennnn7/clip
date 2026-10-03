#!/usr/bin/env bash
# Spielt supabase/schema.sql in ein frisches Postgres ein und prüft
# Mandantentrennung, Rechte und Constraints.
#
# Läuft gegen ein nacktes Postgres im Container statt gegen Supabase: so
# braucht der Test weder ein Projekt noch die Supabase-CLI und ist in Sekunden
# durch. 00-bootstrap.sql legt die Supabase-Voraussetzungen nach, auf die das
# Schema verweist (Rollen, auth.users, auth.uid()).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME=omegaclip-schema-test

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "Starte Postgres …"
docker run --rm -d --name "$NAME" -e POSTGRES_PASSWORD=postgres postgres:16 >/dev/null
for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

docker cp "$ROOT/supabase/tests/00-bootstrap.sql" "$NAME:/tmp/" >/dev/null
docker cp "$ROOT/supabase/schema.sql"             "$NAME:/tmp/" >/dev/null
docker cp "$ROOT/supabase/tests/01-rls.sql"       "$NAME:/tmp/" >/dev/null

echo "Bootstrap …"
docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -f /tmp/00-bootstrap.sql

echo "Schema einspielen …"
docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -f /tmp/schema.sql

echo "Tests:"
docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -t -A -f /tmp/01-rls.sql 2>&1 \
  | grep -vE "^(INSERT|SET|DO|RESET|SELECT)" | grep -v '^$' \
  | sed 's/^psql:[^ ]* NOTICE:  /  /; s/^/  /'

# Credits: Migration über dem vollen Schema (muss wiederholbar sein) …
docker cp "$ROOT/supabase/migrations/20260930000000_source_minute_credits.sql" "$NAME:/tmp/credits.sql" >/dev/null
docker cp "$ROOT/supabase/migrations/20260930120000_trial_120_credits.sql" "$NAME:/tmp/trial.sql" >/dev/null
docker cp "$ROOT/supabase/tests/02-token-billing.sql" "$NAME:/tmp/" >/dev/null
credit_tests() {
  docker exec "$NAME" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -q -t -A -f /tmp/02-token-billing.sql 2>&1 \
    | grep -vE "^(INSERT|SET|DO|RESET|SELECT|UPDATE|CREATE FUNCTION)" | grep -v '^$' \
    | sed 's/^psql:[^ ]* NOTICE:  /  /; s/^/  /'
}

echo
echo "Credit-Migration über schema.sql …"
docker exec -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -f /tmp/credits.sql
docker exec -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -f /tmp/trial.sql
credit_tests postgres

# Workspace: Migration über dem vollen Schema (muss wiederholbar sein) …
docker cp "$ROOT/supabase/migrations/20260929000000_workspace.sql" "$NAME:/tmp/workspace.sql" >/dev/null
docker cp "$ROOT/supabase/migrations/20260922120000_clip_token_billing.sql" "$NAME:/tmp/token-billing.sql" >/dev/null
docker cp "$ROOT/supabase/tests/03-workspace.sql" "$NAME:/tmp/" >/dev/null
workspace_tests() {
  docker exec "$NAME" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -q -t -A -f /tmp/03-workspace.sql 2>&1 \
    | grep -vE "^(INSERT|SET|DO|RESET|SELECT|UPDATE|DELETE)" | grep -v '^$' \
    | sed 's/^psql:[^ ]* NOTICE:  /  /; s/^/  /'
}

echo
echo "Workspace-Migration über schema.sql …"
docker exec -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -f /tmp/workspace.sql
workspace_tests postgres

# … und auf einer Installation, die nur Profile und Token kennt — wie eine
# Datenbank, die bisher nur die Token- und Publishing-Migrationen hatte.
docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -c 'create database migrated'
docker exec "$NAME" sh -c "sed '/^create role /d' /tmp/00-bootstrap.sql > /tmp/bootstrap-migrated.sql"
docker exec -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -U postgres -d migrated -v ON_ERROR_STOP=1 -q -f /tmp/bootstrap-migrated.sql
docker exec -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -U postgres -d migrated -v ON_ERROR_STOP=1 -q -f /tmp/token-billing.sql

# Stände aus der Token-Zeit, die die Credit-Migration übernehmen muss: ein
# Gratis-Konto mit angebrochenem Nachkauf und ein Pro-Abo.
docker exec -i "$NAME" psql -U postgres -d migrated -v ON_ERROR_STOP=1 -q <<'SQL'
insert into auth.users (id, email) values
  ('dddddddd-4444-4444-4444-444444444444', 'old-free@example.com'),
  ('eeeeeeee-5555-5555-5555-555555555555', 'old-pro@example.com');
update public.profiles set render_minutes_limit = 68, render_minutes_used = 10 where id = 'dddddddd-4444-4444-4444-444444444444';
insert into public.token_credit_events (user_id, reference, tokens) values ('dddddddd-4444-4444-4444-444444444444', 'stripe:old', 60);
update public.profiles set subscription_tier = 'pro', render_minutes_limit = 500, render_minutes_used = 20 where id = 'eeeeeeee-5555-5555-5555-555555555555';
SQL
echo
echo "Credit-Migration auf einer Datenbank aus der Token-Zeit (zweimal) …"
docker exec -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -U postgres -d migrated -v ON_ERROR_STOP=1 -q -f /tmp/credits.sql
docker exec -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -U postgres -d migrated -v ON_ERROR_STOP=1 -q -f /tmp/credits.sql
docker exec -i "$NAME" psql -U postgres -d migrated -v ON_ERROR_STOP=1 -q -t -A <<'SQL'
do $$
begin
  if not exists (select 1 from public.profiles where id = 'dddddddd-4444-4444-4444-444444444444'
                 and plan_credits = 30 and pack_credits = 58 and monthly_credits = 0) then
    raise exception 'Free account: trial or unused pack credits not taken over';
  end if;
  if not exists (select 1 from public.profiles where id = 'eeeeeeee-5555-5555-5555-555555555555'
                 and plan_credits = 450 and pack_credits = 0 and monthly_credits = 450 and trial_ended_at is not null) then
    raise exception 'Paid account: allotment of the new plan not granted';
  end if;
end;
$$;
select '  Übernahme der alten Token-Stände: ok';
SQL

echo
echo "Gratis-Test auf 120 Credits anheben (zweimal) …"
docker exec -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -U postgres -d migrated -v ON_ERROR_STOP=1 -q -f /tmp/trial.sql
docker exec -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -U postgres -d migrated -v ON_ERROR_STOP=1 -q -f /tmp/trial.sql
docker exec -i "$NAME" psql -U postgres -d migrated -v ON_ERROR_STOP=1 -q -t -A <<'SQL'
do $$
begin
  if not exists (select 1 from public.profiles where id = 'dddddddd-4444-4444-4444-444444444444'
                 and plan_credits = 120 and pack_credits = 58) then
    raise exception 'Trial account: difference to 120 credits not granted exactly once';
  end if;
  if not exists (select 1 from public.profiles where id = 'eeeeeeee-5555-5555-5555-555555555555'
                 and plan_credits = 450) then
    raise exception 'Paid account must not receive trial credits';
  end if;
end;
$$;
select '  Bestehende Test-Konten angehoben: ok';
SQL
credit_tests migrated

echo
echo "Workspace-Migration auf einer Datenbank ohne projects/clips (zweimal) …"
docker exec -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -U postgres -d migrated -v ON_ERROR_STOP=1 -q -f /tmp/workspace.sql
docker exec -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -U postgres -d migrated -v ON_ERROR_STOP=1 -q -f /tmp/workspace.sql
workspace_tests migrated

# Rate-Limits: im vollen Schema und als Migration auf der migrierten Datenbank.
docker cp "$ROOT/supabase/migrations/20260930200000_rate_limits.sql" "$NAME:/tmp/rate-limits.sql" >/dev/null
docker cp "$ROOT/supabase/tests/04-rate-limit.sql" "$NAME:/tmp/" >/dev/null
rate_limit_tests() {
  docker exec "$NAME" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -q -t -A -f /tmp/04-rate-limit.sql 2>&1 \
    | grep -vE "^(INSERT|SET|DO|RESET|SELECT|t|f)$" | grep -v '^$' \
    | sed 's/^psql:[^ ]* NOTICE:  /  /; s/^/  /'
}
echo
echo "Rate-Limits im vollen Schema …"
rate_limit_tests postgres
echo
echo "Rate-Limit-Migration auf der migrierten Datenbank (zweimal) …"
docker exec -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -U postgres -d migrated -v ON_ERROR_STOP=1 -q -f /tmp/rate-limits.sql
docker exec -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -U postgres -d migrated -v ON_ERROR_STOP=1 -q -f /tmp/rate-limits.sql
rate_limit_tests migrated

# Kontolöschung: Nach dem Löschen des Auth-Nutzers bleibt keine Zeile übrig.
docker cp "$ROOT/supabase/tests/05-account-deletion.sql" "$NAME:/tmp/" >/dev/null
echo
echo "Kontolöschung im vollen Schema …"
docker exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q -t -A -f /tmp/05-account-deletion.sql 2>&1 \
  | grep -vE "^(INSERT|SET|DO|RESET|SELECT|DELETE)" | grep -v '^$' \
  | sed 's/^psql:[^ ]* NOTICE:  /  /; s/^/  /'

echo
echo "Alle Prüfungen bestanden."
