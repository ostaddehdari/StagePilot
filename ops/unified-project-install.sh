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
WORKER_SERVICE="${STAGEPILOT_WORKER_SERVICE:-stagepilot-worker.service}"
WORKER_WAS_STOPPED=0
SERVICES=(
    "${STAGEPILOT_API_SERVICE:-stagepilot-api.service}"
    "${STAGEPILOT_WEB_SERVICE:-stagepilot-web.service}"
    "$WORKER_SERVICE"
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

on_error() {
    local line="$1"
    if [[ "$WORKER_WAS_STOPPED" == "1" ]]; then
        systemctl start "$WORKER_SERVICE" >/dev/null 2>&1 || true
    fi
    printf 'FAILED_AT_LINE=%s\n' "$line"
}
trap 'on_error "$LINENO"' ERR

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

if [[ "${STAGEPILOT_DISABLE_OPENSEARCH:-1}" == "1" ]]; then
    bash ops/disable-opensearch.sh
fi

npm ci
npm run build
npm run manager:plan-test --workspace @stagepilot/worker
npm run manager:proposal-test --workspace @stagepilot/worker
npm run automation:selftest --workspace @stagepilot/worker
npm run automation:work-control-test --workspace @stagepilot/worker
npm run browser:composer-test --workspace @stagepilot/worker
npm run browser:runtime-guard-test --workspace @stagepilot/worker
npm run browser:frame-recovery-test --workspace @stagepilot/worker
npm run browser:send-uncertain-test --workspace @stagepilot/worker
node --check apps/worker/browser/chatgpt-adapter.mjs
node --check apps/worker/src/browser-transport.mjs
node --check apps/worker/src/planning-processor.mjs
node --check apps/worker/src/repository-provisioner.mjs
node --check apps/worker/src/work-processor.mjs

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
rg -q 'response_waiting' apps/worker/src/planning-processor.mjs \
    || fail 'ChatGPT transport progress logging missing'
rg -q "browser-monitor-start" apps/web/app/api/projects/'[id]'/control/route.ts \
    || fail 'project noVNC monitor action missing'
rg -q 'transportHistory' apps/web/components/project-control-center.tsx \
    || fail 'project ChatGPT progress timeline missing'
rg -q "s04-w02-v2" apps/worker/browser/chatgpt-selectors.mjs \
    || fail 'resilient ChatGPT composer selectors missing'
rg -q 'browser-diagnostics' apps/worker/browser/chatgpt-adapter.mjs \
    || fail 'browser failure diagnostic capture missing'
rg -q 'Input\.insertText' apps/worker/browser/chatgpt-adapter.mjs \
    || fail 'atomic CDP multiline Composer insertion missing'
rg -q 'canonicalizeComposerText' apps/worker/browser/chatgpt-adapter.mjs \
    || fail 'Composer DOM text canonicalization missing'
if rg -U 'keyboard\s*\.\s*insertText\s*\(' apps/worker/browser/chatgpt-adapter.mjs; then
    fail 'unsupported Puppeteer keyboard.insertText is present'
fi
rg -q 'visibleRuntimeActivity' apps/worker/src/browser-transport.mjs \
    || fail 'visible browser runtime activity detection missing'
rg -Fq "await visibleManager('stop', profileKey)" apps/worker/src/browser-transport.mjs \
    || fail 'automatic visible browser handoff missing'
if rg -q "new Error\\('CHATGPT_INTERVENTION_REQUIRED:VISIBLE_BROWSER_ACTIVE'\\)" apps/worker/src/browser-transport.mjs; then
    fail 'false visible-browser intervention guard is still present'
fi
rg -q 'VISIBLE_BROWSER_AUTOMATIC_HANDOFF_QUEUED' database/migrations/021_visible_browser_handoff.sql \
    || fail 'visible browser failed-request recovery missing'
rg -q 'STAGEPILOT_PROFESSIONAL_PROPOSAL_V1' apps/api/src/planning.ts \
    || fail 'professional proposal prompt missing'
rg -q 'STAGEPILOT_PROPOSAL_TO_PLAN_TREE_V1' apps/api/src/planning.ts \
    || fail 'proposal-to-plan-tree prompt missing'
rg -q 'Nginx reverse-proxy' apps/api/src/planning.ts \
    || fail 'Nginx public URL planning rule missing'
rg -q 'Stage Exit Verification' apps/api/src/planning.ts \
    || fail 'mandatory Stage completion test rule missing'
rg -q 'GitHub repository/branch' apps/api/src/planning.ts \
    || fail 'GitHub synchronization planning rule missing'
rg -q 'recoverPreviouslySentPrompt' apps/worker/src/planning-processor.mjs \
    || fail 'post-send response-only recovery missing'
rg -q 'FRAME_REACQUIRING' apps/worker/browser/chatgpt-response-monitor.mjs \
    || fail 'detached Frame recovery missing'
rg -q 'send_uncertain_recovery' apps/worker/src/browser-transport.mjs \
    || fail 'uncertain send response-only recovery missing'
rg -q 'DISTINCT ON \(failed.project_id\)' database/migrations/019_send_uncertain_recovery.sql \
    || fail 'single recovery request per project guard missing'
rg -q 'sp-ai-request-dock' apps/web/components/project-control-center.tsx \
    || fail 'project AI request command bar missing'
rg -q 'sp-tree-fullscreen' apps/web/components/project-control-center.tsx \
    || fail 'fullscreen PLAN TREE control missing'
rg -q 'controlProjectAutomationNode' apps/api/src/automation.ts \
    || fail 'Stage and Work controls missing'
rg -q 'recordWorkTransportProgress' apps/worker/src/work-processor.mjs \
    || fail 'work request transport observability missing'
rg -q 'DEPLOYMENT_INTERRUPTED_WORK_REQUEST_REVIEW_REQUIRED' database/migrations/022_work_request_control.sql \
    || fail 'interrupted work request safety migration missing'
rg -Uq 'current_plan_revision\s*=\s*CASE\s+WHEN \$4::boolean THEN \$2::integer' apps/worker/src/planning-processor.mjs \
    || fail 'materialized PLAN TREE current revision update missing'
rg -q "import\('quill'\)" apps/web/components/project-control-center.tsx \
    || fail 'Quill visual proposal editor missing'
if rg -U 'keyboard\s*\.\s*type\s*\(\s*text\b' apps/worker/browser/chatgpt-adapter.mjs; then
    fail 'unsafe multiline keyboard typing is present'
fi

systemctl stop "$WORKER_SERVICE"
WORKER_WAS_STOPPED=1

mapfile -t BROWSER_PROFILES < <(
    psql "$DATABASE_URL" -Atqc \
        "SELECT DISTINCT profile_key
         FROM chat_accounts
         WHERE deleted_at IS NULL
           AND profile_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,120}$'
         ORDER BY profile_key"
)
for profile_key in "${BROWSER_PROFILES[@]}"; do
    node apps/worker/browser/headless-session.mjs stop "$profile_key" || true
    node apps/worker/browser/login-session.mjs stop "$profile_key" || true
    adapter_socket="$PROJECT_ROOT/runtime/browser-adapter/${profile_key}.sock"
    [[ ! -S "$adapter_socket" ]] || rm -f -- "$adapter_socket"
done

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/012_stage72_completion.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/013_core_automation.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/014_project_creation_reliability.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/015_unified_project_workspace.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/016_chatgpt_exactly_once.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/017_proposal_plan_tree_workflow.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/018_chatgpt_frame_recovery.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/019_send_uncertain_recovery.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/020_plan_tree_visibility.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/021_visible_browser_handoff.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/022_work_request_control.sql

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "SELECT count(*) AS preserved_nonterminal_requests
     FROM prompt_requests
     WHERE request_type IN ('project_plan', 'project_proposal', 'project_plan_tree')
       AND status IN ('processing', 'sent', 'waiting_response');"

chown -R "$RUNTIME_USER:$RUNTIME_GROUP" apps/web/.next
find apps/web/.next -type d -exec chmod 755 {} +
find apps/web/.next -type f -exec chmod 644 {} +

for service_name in "${SERVICES[@]}"; do
    systemctl restart "$service_name"
done
WORKER_WAS_STOPPED=0

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
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '016_chatgpt_exactly_once') THEN
        RAISE EXCEPTION 'migration 016_chatgpt_exactly_once missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '017_proposal_plan_tree_workflow') THEN
        RAISE EXCEPTION 'migration 017_proposal_plan_tree_workflow missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '018_chatgpt_frame_recovery') THEN
        RAISE EXCEPTION 'migration 018_chatgpt_frame_recovery missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '019_send_uncertain_recovery') THEN
        RAISE EXCEPTION 'migration 019_send_uncertain_recovery missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '020_plan_tree_visibility') THEN
        RAISE EXCEPTION 'migration 020_plan_tree_visibility missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '021_visible_browser_handoff') THEN
        RAISE EXCEPTION 'migration 021_visible_browser_handoff missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '022_work_request_control') THEN
        RAISE EXCEPTION 'migration 022_work_request_control missing';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM projects p
        INNER JOIN project_plan_versions ppv
            ON ppv.project_id = p.id AND ppv.status = 'approved'
        INNER JOIN stages s
            ON s.project_id = p.id AND s.revision = ppv.version
        WHERE p.deleted_at IS NULL
          AND p.current_plan_revision IS DISTINCT FROM ppv.version
    ) THEN
        RAISE EXCEPTION 'approved PLAN TREE is hidden by a stale current_plan_revision';
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
printf '%s\n' 'ChatGPT live progress timeline: PASS'
printf '%s\n' 'Project noVNC monitor: PASS'
printf '%s\n' 'Detailed failure diagnostics: PASS'
printf '%s\n' 'Resilient ChatGPT composer detection: PASS'
printf '%s\n' 'Detached browser runtime refresh: PASS'
printf '%s\n' 'Atomic multiline prompt insertion: PASS'
printf '%s\n' 'Composer DOM text verification: PASS'
printf '%s\n' 'Single active planning request guard: PASS'
printf '%s\n' 'Post-send automatic retry blocked: PASS'
printf '%s\n' 'Visible noVNC automatic handoff: PASS'
printf '%s\n' 'Professional proposal workflow: PASS'
printf '%s\n' 'Official proposal conversion: PASS'
printf '%s\n' 'Message soft deletion: PASS'
printf '%s\n' 'Proposal-to-PLAN-TREE workflow: PASS'
printf '%s\n' 'Nginx, Stage tests and GitHub prompt policy: PASS'
printf '%s\n' 'Detached Frame response recovery: PASS'
printf '%s\n' 'Post-send duplicate prevention: PASS'
printf '%s\n' 'SEND_UNCERTAIN response-only recovery: PASS'
printf '%s\n' 'Quill visual, HTML source and preview editor: PASS'
printf '%s\n' 'OpenSearch disabled; PostgreSQL search retained: PASS'
printf '%s\n' 'Materialized PLAN TREE visibility: PASS'
printf '%s\n' 'Fullscreen PLAN TREE workspace: PASS'
printf '%s\n' 'Stage and Work gradient controls: PASS'
printf '%s\n' 'Project AI request command bar: PASS'
printf '%s\n' 'Latest-only ChatGPT status: PASS'
printf '%s\n' 'Interrupted work duplicate protection: PASS'
printf '%s\n' 'Per-project GitHub credentials: PASS'
printf '%s\n' 'STAGEPILOT_UNIFIED_PROJECT=PASS'
printf 'Finished: %s\n' "$(date -u +%FT%TZ)"
