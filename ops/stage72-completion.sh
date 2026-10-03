#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="${STAGEPILOT_PROJECT_ROOT:-/opt/stagepilot}"
TARGET_REF="${STAGEPILOT_TARGET_REF:-main}"
SKIP_GIT_FETCH="${STAGEPILOT_SKIP_GIT_FETCH:-0}"
ENV_FILE="${STAGEPILOT_ENV_FILE:-$PROJECT_ROOT/runtime/internal.env}"
DB_ENV_FILE="${STAGEPILOT_DB_ENV_FILE:-$PROJECT_ROOT/runtime/db.env}"
REPORT_ROOT="${STAGEPILOT_REPORT_ROOT:-$PROJECT_ROOT/runtime/acceptance}"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
REPORT_FILE="$REPORT_ROOT/stage72-$TIMESTAMP.log"
BACKUP_ROOT="${STAGEPILOT_BACKUP_ROOT:-$PROJECT_ROOT/backups/stage72-$TIMESTAMP}"
SERVICES=(
    "${STAGEPILOT_API_SERVICE:-stagepilot-api.service}"
    "${STAGEPILOT_WEB_SERVICE:-stagepilot-web.service}"
    "${STAGEPILOT_WORKER_SERVICE:-stagepilot-worker.service}"
)
RUNTIME_USER="${STAGEPILOT_RUNTIME_USER:-stagepilot}"
RUNTIME_GROUP="${STAGEPILOT_RUNTIME_GROUP:-stagepilot}"
PUBLIC_HEALTH_URL="${STAGEPILOT_PUBLIC_HEALTH_URL:-https://srun.ir/StagePilot/login}"


fail() {
    printf 'FAIL: %s\n' "$1" >&2
    exit 1
}


require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "required command missing: $1"
}


mkdir -p "$REPORT_ROOT" "$BACKUP_ROOT"
chmod 700 "$REPORT_ROOT" "$BACKUP_ROOT"
exec > >(tee -a "$REPORT_FILE") 2>&1

printf 'StagePilot Stage 7.2 completion deployment\n'
printf 'Started: %s\n' "$(date -u +%FT%TZ)"
printf 'Project root: %s\n' "$PROJECT_ROOT"
printf 'Target ref: %s\n' "$TARGET_REF"

for command_name in git node npm psql curl systemctl ss; do
    require_command "$command_name"
done

[[ -d "$PROJECT_ROOT/.git" ]] || fail "project repository not found"
[[ -f "$ENV_FILE" ]] || fail "environment file not found: $ENV_FILE"
[[ -f "$DB_ENV_FILE" ]] || fail "database environment file not found: $DB_ENV_FILE"

cd "$PROJECT_ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
    fail "working tree has local changes; they were preserved"
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ -z "$CURRENT_BRANCH" ]]; then
    fail "repository is in detached HEAD state"
fi

if [[ "$SKIP_GIT_FETCH" == "1" ]]; then
    printf 'Git fetch skipped; validating current checked-out commit.\n'
else
    git fetch --prune origin "$TARGET_REF"
    git merge-base --is-ancestor HEAD "origin/$TARGET_REF" \
        || fail "local branch cannot be fast-forwarded to origin/$TARGET_REF"
    git merge --ff-only "origin/$TARGET_REF"
fi
DEPLOY_SHA="$(git rev-parse HEAD)"
printf 'Deploy SHA: %s\n' "$DEPLOY_SHA"

cp package-lock.json "$BACKUP_ROOT/package-lock.json"
cp "$ENV_FILE" "$BACKUP_ROOT/internal.env.backup"
cp "$DB_ENV_FILE" "$BACKUP_ROOT/db.env.backup"
chmod 600 "$BACKUP_ROOT/internal.env.backup" "$BACKUP_ROOT/db.env.backup"

ss -ltnp > "$BACKUP_ROOT/listening-ports.txt"
df -h > "$BACKUP_ROOT/disk-usage.txt"
free -h > "$BACKUP_ROOT/memory-usage.txt"

if command -v nginx >/dev/null 2>&1; then
    nginx -t
    nginx -T > "$BACKUP_ROOT/nginx-effective.conf" 2>&1
    chmod 600 "$BACKUP_ROOT/nginx-effective.conf"
else
    printf 'WARN: nginx command not found; reverse-proxy syntax check skipped\n'
fi

set -a
. "$DB_ENV_FILE"
. "$ENV_FILE"
set +a

[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL missing from environment"

if command -v pg_dump >/dev/null 2>&1; then
    pg_dump --format=custom --file="$BACKUP_ROOT/database.dump" "$DATABASE_URL"
    chmod 600 "$BACKUP_ROOT/database.dump"
else
    printf 'WARN: pg_dump not installed; database backup skipped\n'
fi

install -d -o "$RUNTIME_USER" -g "$RUNTIME_GROUP" -m 0700 \
    "$PROJECT_ROOT/runtime/github"

npm ci
npm run build
npm run manager:plan-test --workspace @stagepilot/worker

SELFTEST_ROOT="$(mktemp -d)"
export STAGEPILOT_BROWSER_LOCK_ROOT="$SELFTEST_ROOT/browser-locks"
export STAGEPILOT_BROWSER_CAPACITY_ROOT="$SELFTEST_ROOT/browser-capacity"

node apps/worker/browser/lock-selftest.mjs
node apps/worker/browser/browser-capacity-selftest.mjs
node apps/worker/browser/validator-selftest.mjs

while IFS= read -r test_file; do
    node "$test_file"
done < <(
    find apps/worker/github apps/worker/manager apps/worker/runner \
        -name '*selftest.mjs' -print | sort
)

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -f database/migrations/012_stage72_completion.sql

for service_name in "${SERVICES[@]}"; do
    systemctl restart "$service_name"
    systemctl is-active --quiet "$service_name" \
        || fail "service did not become active: $service_name"
done

API_HEALTH_URL="${STAGEPILOT_API_HEALTH_URL:-http://127.0.0.1:19101/health}"
WEB_HEALTH_URL="${STAGEPILOT_WEB_HEALTH_URL:-http://127.0.0.1:19100/StagePilot/login}"

curl --fail --silent --show-error --max-time 15 "$API_HEALTH_URL" \
    > "$BACKUP_ROOT/api-health.json"
curl --fail --silent --show-error --max-time 15 "$WEB_HEALTH_URL" \
    > "$BACKUP_ROOT/web-login.html"
curl --fail --silent --show-error --max-time 20 "$PUBLIC_HEALTH_URL" \
    > "$BACKUP_ROOT/public-login.html"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO events (
    entity_type,
    entity_id,
    event_type,
    severity,
    actor_type,
    actor_id,
    message,
    data
)
VALUES (
    'release',
    'stage72-$TIMESTAMP',
    'stagepilot.stage72.live_acceptance.passed',
    'info',
    'system',
    'stage72-completion-script',
    'Stage 1 through Stage 7 Work 2 completion package passed build, self-tests, migration, service and health gates.',
    jsonb_build_object(
        'commitSha', '$DEPLOY_SHA',
        'reportFile', '$REPORT_FILE',
        'acceptedAt', now()
    )
);
SQL

printf 'STAGEPILOT_STAGE72_COMPLETION=PASS\n'
printf 'Commit: %s\n' "$DEPLOY_SHA"
printf 'Report: %s\n' "$REPORT_FILE"
printf 'Backup: %s\n' "$BACKUP_ROOT"
printf 'Finished: %s\n' "$(date -u +%FT%TZ)"
