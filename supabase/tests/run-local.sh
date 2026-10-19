#!/usr/bin/env bash
# Esegue migrazioni + test SQL su un Postgres usa-e-getta (nessun Docker/Supabase richiesto).
# Uso: bash supabase/tests/run-local.sh   (richiede initdb/pg_ctl/psql nel PATH o in /usr/lib/postgresql/*/bin)
set -euo pipefail
# initdb rifiuta root: in container/CI ci si ri-esegue come utente postgres.
if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
  exec runuser -u postgres -- bash "$(readlink -f "$0")" "$@"
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
SOCK="$DATA"
cleanup() { "$PGBIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

"$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $SOCK -c listen_addresses=''" -w start >/dev/null
PSQL=(psql -h "$SOCK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f "$ROOT/tests/supabase-stub.sql"
for f in "$ROOT"/migrations/*.sql; do
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$ROOT/tests/db.test.sql"
