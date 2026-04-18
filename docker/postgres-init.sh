#!/bin/bash
# Create additional databases listed in POSTGRES_MULTIPLE_DATABASES (comma-
# separated). Runs once on first container boot. Safe to re-run — uses IF NOT
# EXISTS via pg_database lookup.

set -e
set -u

if [ -n "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
  IFS=',' read -ra DBS <<< "$POSTGRES_MULTIPLE_DATABASES"
  for db in "${DBS[@]}"; do
    db_trimmed="$(echo -n "$db" | xargs)"
    echo "  [init] ensuring database '$db_trimmed' exists"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
      SELECT 'CREATE DATABASE "$db_trimmed"'
      WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db_trimmed')\gexec
      GRANT ALL PRIVILEGES ON DATABASE "$db_trimmed" TO "$POSTGRES_USER";
EOSQL
  done
fi
