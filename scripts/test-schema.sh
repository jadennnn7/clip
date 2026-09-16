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

echo
echo "Alle Prüfungen bestanden."
