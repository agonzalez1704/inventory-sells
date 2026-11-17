#!/bin/sh
# The test environment for the WhatsApp agent (Ruli): a throwaway local
# Supabase holding Ruli's SCHEMA and no rows, and the app started against it.
# Nothing here writes to production; `preparar` READS its schema once.
#
#   scripts/agente-test.sh preparar   copy the schema from production (read-only)
#   scripts/agente-test.sh arrancar   start the database and the app on :3111
#   scripts/agente-test.sh detener    stop the database (its data stays in Docker)
#
# Then, in another terminal:  AGENTE_TEST_URL=http://localhost:3111 pnpm test:agente
#
# Needs Docker running, the Supabase CLI, and .env.local with SUPABASE_DB_URL.
# Ports are 5532x so it sits next to another local Supabase project.
set -e
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
SB="$RAIZ/scripts/agente-test"
DB=supabase_db_ruli-test
SIN="studio,imgproxy,edge-runtime,logflare,vector,realtime,supavisor,inbucket,postgres-meta"
cd "$RAIZ"

de_env() { grep "^$1=" .env.local | cut -d= -f2- | sed -e "s/^[\"']//" -e "s/[\"']$//"; }
sql() { docker exec -i "$DB" psql -U postgres -q -At "$@"; }
subir() { supabase start --workdir "$SB" -x "$SIN" >/dev/null; }

case "${1:-}" in
  preparar)
    PROD="$(de_env SUPABASE_DB_URL)"
    [ -n "$PROD" ] || { echo "Falta SUPABASE_DB_URL en .env.local" >&2; exit 1; }
    subir
    if [ "$(sql -c "select to_regclass('public.products') is not null")" = "t" ]; then
      echo "La base de pruebas ya tiene esquema. Para rehacerla: supabase stop --workdir $SB --no-backup, y de nuevo preparar."
      exit 0
    fi
    # pg_dump from inside the container: it must be at least the server's version.
    sql -c "create extension if not exists pg_trgm with schema public"
    echo "Leyendo el esquema de producción (solo lectura, sin filas)…"
    docker exec -e PGURL="$PROD" "$DB" sh -c 'pg_dump "$PGURL" --schema-only --no-owner --schema=public --schema=system' \
      | sql >/dev/null 2>&1 || true
    ULTIMA="$(docker exec -e PGURL="$PROD" "$DB" sh -c 'psql "$PGURL" -X -q -At -c "select max(version) from system.custom_migrations"')"
    # Migrations the repo has and production does not yet.
    for f in migrations/*.sql; do
      v="$(basename "$f" | cut -c1-14)"
      if [ "$v" \> "$ULTIMA" ]; then echo "migración local: $(basename "$f")"; sql -v ON_ERROR_STOP=1 < "$f"; fi
    done
    sql -c "insert into public.config_negocio (id) values (1) on conflict do nothing" -c "notify pgrst, 'reload schema'"
    echo "Tablas en public: $(sql -c "select count(*) from pg_tables where schemaname='public'")"
    ;;
  arrancar)
    subir
    [ "$(sql -c "select to_regclass('public.products') is not null")" = "t" ] || { echo "Base vacía: corre primero  scripts/agente-test.sh preparar" >&2; exit 1; }
    eval "$(supabase status --workdir "$SB" -o env 2>/dev/null | grep -E '^(API_URL|SERVICE_ROLE_KEY|ANON_KEY)=')"
    export SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" SUPABASE_ANON_KEY="$ANON_KEY"
    # Ruli has its own OpenAI key; fall back to the default one.
    K="$(de_env REFACCIONARIA_RULI_OPENAI_KEY)"
    [ -n "$K" ] && export OPENAI_API_KEY="$K"
    # The test route only answers when this names the backend in use.
    export NEXT_PUBLIC_MARCA=ruli AGENTE_TEST_DB="${API_URL#http://}"
    exec pnpm exec next dev -p 3111
    ;;
  detener)
    supabase stop --workdir "$SB"
    ;;
  *)
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
