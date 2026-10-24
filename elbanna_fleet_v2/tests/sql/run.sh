#!/usr/bin/env bash
# تشغيل اختبارات SQL على Postgres محلي مؤقت (بيحتاج postgres 14+ مثبّت). الاستخدام: bash tests/sql/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN="${PGBIN:-$(dirname "$(ls /usr/lib/postgresql/*/bin/postgres | sort -V | tail -1)")}"
DIR="$(mktemp -d)"; PORT="${PGPORT:-54330}"
trap '"$PGBIN/pg_ctl" -D "$DIR" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"$PGBIN/initdb" -D "$DIR" -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR -c listen_addresses=''" -w start >/dev/null
P="psql -h $DIR -p $PORT -d postgres -v ON_ERROR_STOP=1 -q"
$P -f tests/sql/supabase-shim.sql -f tests/sql/legacy-app-tables.sql -f sql/security-01-schema.sql >/dev/null
$P -f tests/sql/security.test.sql
