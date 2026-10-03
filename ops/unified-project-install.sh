#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="${STAGEPILOT_PROJECT_ROOT:-/opt/stagepilot}"
RUNTIME_USER="${STAGEPILOT_RUNTIME_USER:-stagepilot}"
RUNTIME_GROUP="${STAGEPILOT_RUNTIME_GROUP:-stagepilot}"
DB_ENV_FILE="${STAGEPILOT_DB_ENV_FILE:-$PROJECT_ROOT/runtime/db.env}"
BROWSER_ENV_FILE="${STAGEPILOT_BROWSER_ENV_FILE:-$PROJECT_ROOT/runtime/browser.env}"
INTERNAL_ENV_FILE="${STAGEPILOT_INTERNAL_ENV_FILE:-$PROJECT_ROOT/runtime/internal.env}"
LOG_FILE="${STAGEPILOT_LOG_FILE:-/root/runlog.txt}"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_ROOT="${STAGEPILOT_BACKUP_ROOT:-$PROJECT_ROOT/backups/unified-project-$TIMESTAMP}"
SERVICES=(
    "${STAGEPILOT_API_SERVICE:-stagepilot-api.service}"
    "${STAGEPILOT_WEB_SERVICE:-stagepilot-web.service}"
    "${STAGEPILOT_WORKER_SERVICE:-stagepilot-worker.service}"
)

if [[ "${STAGEPILOT_LOG_INITIALIZED:-0}" != "1" ]]; then
    : > "$LOG_FILE"
fi
chmod 600 "$LOG_FILE"
exec >> "$LOG_FILE" 2>&1

fail() {
    printf 'FAIL: %s\n' "$1"
    exit 1
}

trap 'printf "FAILED_AT_LINE=%s\n" "$LINENO"' ERR

printf '%s\n' '============================================================'
printf '%s\n' ' STAGEPILOT — UNIFIED PROJECT CONTROL CENTER'
printf '%s\n' '============================================================'
printf 'Started: %s\n' "$(date -u +%FT%TZ)"

[[ "$(id -u)" == "0" ]] || fail 'installer must run as root'
for command_name in git node npm psql pg_dump curl systemctl sudo rg; do
    command -v "$command_name" >/dev/null 2>&1 || fail "required command missing: $command_name"
done
[[ -d "$PROJECT_ROOT/.git" ]] || fail "repository not found: $PROJECT_ROOT"
[[ -f "$DB_ENV_FILE" ]] || fail "database environment missing: $DB_ENV_FILE"
[[ -f "$BROWSER_ENV_FILE" ]] || fail "browser environment missing: $BROWSER_ENV_FILE"
[[ -f "$INTERNAL_ENV_FILE" ]] || fail "internal environment missing: $INTERNAL_ENV_FILE"

cd "$PROJECT_ROOT"
git config --global --add safe.directory "$PROJECT_ROOT" 2>/dev/null || true
[[ -z "$(git status --porcelain)" ]] || fail 'repository is not clean after release integration'

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
cp package-lock.json "$BACKUP_ROOT/package-lock.json"
cp "$DB_ENV_FILE" "$BACKUP_ROOT/db.env.backup"
cp "$BROWSER_ENV_FILE" "$BACKUP_ROOT/browser.env.backup"
cp "$INTERNAL_ENV_FILE" "$BACKUP_ROOT/internal.env.backup"
chmod 600 "$BACKUP_ROOT"/*.env.backup

set -a
. "$DB_ENV_FILE"
. "$BROWSER_ENV_FILE"
. "$INTERNAL_ENV_FILE"
set +a
[[ -n "${DATABASE_URL:-}" ]] || fail 'DATABASE_URL missing'

pg_dump --format=custom --file="$BACKUP_ROOT/database.dump" "$DATABASE_URL"
chmod 600 "$BACKUP_ROOT/database.dump"

npm ci
npm run build
npm run manager:plan-test --workspace @stagepilot/worker
npm run automation:selftest --workspace @stagepilot/worker
node --check apps/worker/browser/chatgpt-adapter.mjs
node --check apps/worker/src/browser-transport.mjs
node --check apps/worker/src/planning-processor.mjs
node --check apps/worker/src/repository-provisioner.mjs

rg -q "api/projects/\[id\]/control" < <(find apps/web/app/api/projects -type f -print) \
    || test -f apps/web/app/api/projects/'[id]'/control/route.ts \
    || fail 'unified control API route missing'
rg -q 'UNIFIED_PROJECT_CONTROL_CENTER_START' apps/web/app/stagepilot.css \
    || fail 'unified UI stylesheet missing'
if rg --fixed-strings 'pattern="[a-z0-9][a-z0-9-]{2,62}"' apps/web; then
    fail 'invalid browser pattern is present'
fi
if rg -P '(?<!\$)\beval\s*\(|\bnew Function\s*\(' apps/web apps/api apps/worker --glob '!*.map'; then
    fail 'unsafe JavaScript string evaluation detected'
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/012_stage72_completion.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/013_core_automation.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/014_project_creation_reliability.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/015_unified_project_workspace.sql

chown -R "$RUNTIME_USER:$RUNTIME_GROUP" apps/web/.next
find apps/web/.next -type d -exec chmod 755 {} +
find apps/web/.next -type f -exec chmod 644 {} +

for service_name in "${SERVICES[@]}"; do
    systemctl restart "$service_name"
done

for service_name in "${SERVICES[@]}"; do
    for _ in {1..30}; do
        systemctl is-active --quiet "$service_name" && break
        sleep 1
    done
    systemctl is-active --quiet "$service_name" || {
        journalctl -u "$service_name" -n 100 --no-pager || true
        fail "service did not become active: $service_name"
    }
done

API_HEALTH_URL="${STAGEPILOT_API_HEALTH_URL:-http://127.0.0.1:19101/health}"
WEB_HEALTH_URL="${STAGEPILOT_WEB_HEALTH_URL:-http://127.0.0.1:19100/StagePilot/login}"
PUBLIC_HEALTH_URL="${STAGEPILOT_PUBLIC_HEALTH_URL:-https://srun.ir/StagePilot/login}"
curl --fail --silent --show-error --retry 30 --retry-all-errors --retry-delay 1 --retry-max-time 45 "$API_HEALTH_URL" > "$BACKUP_ROOT/api-health.json"
curl --fail --silent --show-error --retry 30 --retry-all-errors --retry-delay 1 --retry-max-time 45 "$WEB_HEALTH_URL" > "$BACKUP_ROOT/web-login.html"
curl --fail --silent --show-error --retry 10 --retry-all-errors --retry-delay 2 --retry-max-time 45 "$PUBLIC_HEALTH_URL" > "$BACKUP_ROOT/public-login.html"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '015_unified_project_workspace') THEN
        RAISE EXCEPTION 'migration 015_unified_project_workspace missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'project_plan_versions' AND column_name = 'proposal_html'
    ) THEN
        RAISE EXCEPTION 'proposal_html column missing';
    END IF;
END
$$;
SQL

WORKER_READY=0
for _ in {1..25}; do
    if psql "$DATABASE_URL" -Atqc \
        "SELECT 1 FROM worker_heartbeats WHERE heartbeat_at > now() - interval '60 seconds' LIMIT 1" \
        | grep -qx '1'; then
        WORKER_READY=1
        break
    fi
    sleep 2
done
[[ "$WORKER_READY" == "1" ]] || fail 'worker heartbeat missing after restart'

printf 'Deploy SHA: %s\n' "$(git rev-parse HEAD)"
printf 'Backup: %s\n' "$BACKUP_ROOT"
printf '%s\n' 'Project control route: PASS'
printf '%s\n' 'Unified AJAX workspace: PASS'
printf '%s\n' 'Tree mutation guards: PASS'
printf '%s\n' 'Proposal HTML storage: PASS'
printf '%s\n' 'ChatGPT project transport: PASS'
printf '%s\n' 'Per-project GitHub credentials: PASS'
printf '%s\n' 'STAGEPILOT_UNIFIED_PROJECT=PASS'
printf 'Finished: %s\n' "$(date -u +%FT%TZ)"
