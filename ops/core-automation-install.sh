#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="${STAGEPILOT_PROJECT_ROOT:-/opt/stagepilot}"
TARGET_REF="${STAGEPILOT_TARGET_REF:-main}"
SKIP_GIT_FETCH="${STAGEPILOT_SKIP_GIT_FETCH:-0}"
RUNTIME_USER="${STAGEPILOT_RUNTIME_USER:-stagepilot}"
RUNTIME_GROUP="${STAGEPILOT_RUNTIME_GROUP:-stagepilot}"
DB_ENV_FILE="${STAGEPILOT_DB_ENV_FILE:-$PROJECT_ROOT/runtime/db.env}"
BROWSER_ENV_FILE="${STAGEPILOT_BROWSER_ENV_FILE:-$PROJECT_ROOT/runtime/browser.env}"
INTERNAL_ENV_FILE="${STAGEPILOT_INTERNAL_ENV_FILE:-$PROJECT_ROOT/runtime/internal.env}"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
REPORT_ROOT="${STAGEPILOT_REPORT_ROOT:-$PROJECT_ROOT/runtime/acceptance}"
REPORT_FILE="$REPORT_ROOT/core-automation-$TIMESTAMP.log"
BACKUP_ROOT="${STAGEPILOT_BACKUP_ROOT:-$PROJECT_ROOT/backups/core-automation-$TIMESTAMP}"
SERVICES=(
    "${STAGEPILOT_API_SERVICE:-stagepilot-api.service}"
    "${STAGEPILOT_WEB_SERVICE:-stagepilot-web.service}"
    "${STAGEPILOT_WORKER_SERVICE:-stagepilot-worker.service}"
)

fail() {
    printf 'FAIL: %s\n' "$1" >&2
    exit 1
}

for command_name in git node npm psql pg_dump curl systemctl sudo; do
    command -v "$command_name" >/dev/null 2>&1 || fail "required command missing: $command_name"
done

[[ -d "$PROJECT_ROOT/.git" ]] || fail "repository not found: $PROJECT_ROOT"
[[ -f "$DB_ENV_FILE" ]] || fail "database env missing: $DB_ENV_FILE"
[[ -f "$BROWSER_ENV_FILE" ]] || fail "browser env missing: $BROWSER_ENV_FILE"
[[ -f "$INTERNAL_ENV_FILE" ]] || fail "internal env missing: $INTERNAL_ENV_FILE"

mkdir -p "$REPORT_ROOT" "$BACKUP_ROOT"
chmod 700 "$REPORT_ROOT" "$BACKUP_ROOT"
exec > >(tee -a "$REPORT_FILE") 2>&1

printf 'StagePilot core automation installation\n'
printf 'Started: %s\n' "$(date -u +%FT%TZ)"
printf 'Project root: %s\n' "$PROJECT_ROOT"

cd "$PROJECT_ROOT"
git config --global --add safe.directory "$PROJECT_ROOT" 2>/dev/null || true

if ! git diff --quiet || ! git diff --cached --quiet; then
    fail 'tracked working tree changes detected; nothing was overwritten'
fi

if [[ "$SKIP_GIT_FETCH" != "1" ]]; then
    git fetch --prune origin "$TARGET_REF"
    git merge-base --is-ancestor HEAD "origin/$TARGET_REF" \
        || fail "local history is not an ancestor of origin/$TARGET_REF"
    git merge --ff-only "origin/$TARGET_REF"
fi

DEPLOY_SHA="$(git rev-parse HEAD)"
printf 'Deploy SHA: %s\n' "$DEPLOY_SHA"

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

install -d -o "$RUNTIME_USER" -g "$RUNTIME_GROUP" -m 0700 \
    "$PROJECT_ROOT/runtime/browser-adapter" \
    "$PROJECT_ROOT/runtime/browser-responses" \
    "$PROJECT_ROOT/runtime/executions" \
    "$PROJECT_ROOT/runtime/github" \
    "$PROJECT_ROOT/storage/project-workspaces"

npm ci
npm run build
npm run manager:plan-test --workspace @stagepilot/worker
npm run automation:selftest --workspace @stagepilot/worker

SELFTEST_ROOT="$(mktemp -d)"
export STAGEPILOT_BROWSER_PROFILE_ROOT="$SELFTEST_ROOT/browser-profiles"
export STAGEPILOT_BROWSER_LOCK_ROOT="$SELFTEST_ROOT/browser-locks"
export STAGEPILOT_BROWSER_CAPACITY_ROOT="$SELFTEST_ROOT/browser-capacity"
install -d -o "$RUNTIME_USER" -g "$RUNTIME_GROUP" -m 0700 \
    "$SELFTEST_ROOT" \
    "$STAGEPILOT_BROWSER_PROFILE_ROOT" \
    "$STAGEPILOT_BROWSER_LOCK_ROOT" \
    "$STAGEPILOT_BROWSER_CAPACITY_ROOT"

run_browser_selftest() {
    sudo -u "$RUNTIME_USER" -H env \
        "STAGEPILOT_BROWSER_EXECUTABLE=${STAGEPILOT_BROWSER_EXECUTABLE:-/usr/bin/google-chrome-stable}" \
        "STAGEPILOT_BROWSER_PROFILE_ROOT=$STAGEPILOT_BROWSER_PROFILE_ROOT" \
        "STAGEPILOT_BROWSER_LOCK_ROOT=$STAGEPILOT_BROWSER_LOCK_ROOT" \
        "STAGEPILOT_BROWSER_CAPACITY_ROOT=$STAGEPILOT_BROWSER_CAPACITY_ROOT" \
        node "$1"
}

run_browser_selftest apps/worker/browser/lock-selftest.mjs
run_browser_selftest apps/worker/browser/browser-capacity-selftest.mjs
run_browser_selftest apps/worker/browser/validator-selftest.mjs

while IFS= read -r test_file; do
    node "$test_file"
done < <(
    find apps/worker/github apps/worker/manager apps/worker/runner \
        -name '*selftest.mjs' -print | sort
)

node --check apps/worker/src/worker.mjs
node --check apps/worker/src/planning-processor.mjs
node --check apps/worker/src/work-processor.mjs
node --check apps/worker/src/repository-provisioner.mjs

if grep -R --line-number --fixed-strings 'pattern="[a-z0-9][a-z0-9-]{2,62}"' apps/web; then
    fail 'invalid HTML slug pattern is still present'
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/012_stage72_completion.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/013_core_automation.sql

for service_name in "${SERVICES[@]}"; do
    systemctl restart "$service_name"
    systemctl is-active --quiet "$service_name" \
        || fail "service is not active: $service_name"
done

API_HEALTH_URL="${STAGEPILOT_API_HEALTH_URL:-http://127.0.0.1:19101/health}"
WEB_HEALTH_URL="${STAGEPILOT_WEB_HEALTH_URL:-http://127.0.0.1:19100/StagePilot/login}"
PUBLIC_HEALTH_URL="${STAGEPILOT_PUBLIC_HEALTH_URL:-https://srun.ir/StagePilot/login}"

curl --fail --silent --show-error --retry 30 --retry-all-errors --retry-delay 1 \
    --retry-max-time 45 "$API_HEALTH_URL" > "$BACKUP_ROOT/api-health.json"
curl --fail --silent --show-error --retry 30 --retry-all-errors --retry-delay 1 \
    --retry-max-time 45 "$WEB_HEALTH_URL" > "$BACKUP_ROOT/web-login.html"
curl --fail --silent --show-error --retry 10 --retry-all-errors --retry-delay 2 \
    --retry-max-time 45 "$PUBLIC_HEALTH_URL" > "$BACKUP_ROOT/public-login.html"

WORKER_READY=0
for _ in {1..20}; do
    if psql "$DATABASE_URL" -Atqc \
        "SELECT 1 FROM worker_heartbeats WHERE heartbeat_at > now() - interval '45 seconds' LIMIT 1" \
        | grep -qx '1'; then
        WORKER_READY=1
        break
    fi
    sleep 2
done

if [[ "$WORKER_READY" != "1" ]]; then
    journalctl -u "${STAGEPILOT_WORKER_SERVICE:-stagepilot-worker.service}" -n 120 --no-pager || true
    fail 'worker heartbeat was not recorded after restart'
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version='013_core_automation') THEN
        RAISE EXCEPTION 'migration 013_core_automation missing';
    END IF;
END
\$\$;

INSERT INTO events (
    entity_type, entity_id, event_type, severity,
    actor_type, actor_id, message, data
) VALUES (
    'release', 'core-automation-$TIMESTAMP',
    'stagepilot.core_automation.live_acceptance.passed', 'info',
    'system', 'core-automation-install',
    'Core planning and autonomous Work loop passed deployment gates.',
    jsonb_build_object('commitSha', '$DEPLOY_SHA', 'reportFile', '$REPORT_FILE')
);
SQL

printf 'STAGEPILOT_CORE_AUTOMATION=PASS\n'
printf 'Commit: %s\n' "$DEPLOY_SHA"
printf 'Report: %s\n' "$REPORT_FILE"
printf 'Backup: %s\n' "$BACKUP_ROOT"
printf 'Finished: %s\n' "$(date -u +%FT%TZ)"
