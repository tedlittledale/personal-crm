#!/usr/bin/env bash
set -euo pipefail

# Sync production database to staging
# Dumps public + drizzle schemas from prod, restores to staging

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Use Homebrew libpq if pg_dump/psql aren't on PATH
if ! command -v pg_dump &>/dev/null; then
  LIBPQ_BIN="/opt/homebrew/opt/libpq/bin"
  if [[ -d "$LIBPQ_BIN" ]]; then
    export PATH="$LIBPQ_BIN:$PATH"
  else
    echo "Error: pg_dump not found. Install with: brew install libpq"
    exit 1
  fi
fi

# Load prod direct URL from .env.local
PROD_DATABASE_URL_DIRECT=""
if [[ -f "$PROJECT_DIR/.env.local" ]]; then
  PROD_DATABASE_URL_DIRECT=$(grep -E '^PROD_DATABASE_URL_DIRECT=' "$PROJECT_DIR/.env.local" | cut -d'=' -f2- | tr -d '"')
fi

if [[ -z "$PROD_DATABASE_URL_DIRECT" ]]; then
  echo "Error: PROD_DATABASE_URL_DIRECT not found in .env.local"
  echo "Add your production direct connection string (port 5432) to .env.local"
  exit 1
fi

# Load staging direct URL from .env.staging
STAGING_DATABASE_URL_DIRECT=""
if [[ -f "$PROJECT_DIR/.env.staging" ]]; then
  STAGING_DATABASE_URL_DIRECT=$(grep -E '^STAGING_DATABASE_URL_DIRECT=' "$PROJECT_DIR/.env.staging" | cut -d'=' -f2- | tr -d '"')
fi

if [[ -z "$STAGING_DATABASE_URL_DIRECT" ]]; then
  echo "Error: STAGING_DATABASE_URL_DIRECT not found in .env.staging"
  echo "Copy .env.staging.template to .env.staging and fill in the values"
  exit 1
fi

DUMP_FILE=$(mktemp /tmp/crm-staging-sync.XXXXXX.sql)
trap 'rm -f "$DUMP_FILE"' EXIT

echo "==> Dumping production database (public + drizzle schemas)..."
pg_dump "$PROD_DATABASE_URL_DIRECT" \
  --schema=public \
  --schema=drizzle \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  > "$DUMP_FILE"

DUMP_SIZE=$(wc -c < "$DUMP_FILE" | tr -d ' ')
echo "    Dump size: ${DUMP_SIZE} bytes"

echo "==> Restoring to staging database..."
psql "$STAGING_DATABASE_URL_DIRECT" \
  --single-transaction \
  --quiet \
  -f "$DUMP_FILE"

echo "==> Verifying staging tables..."
psql "$STAGING_DATABASE_URL_DIRECT" --quiet --tuples-only -c "
  SELECT schemaname || '.' || relname || ' (' || n_live_tup || ' rows)'
  FROM pg_stat_user_tables
  WHERE schemaname IN ('public', 'drizzle')
  ORDER BY schemaname, relname;
"

echo "==> Staging sync complete!"
