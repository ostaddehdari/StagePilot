#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="${STAGEPILOT_PROJECT_ROOT:-/opt/stagepilot}"
ROLLBACK_REF="${STAGEPILOT_ROLLBACK_REF:-}"
SERVICES=(
    "${STAGEPILOT_API_SERVICE:-stagepilot-api.service}"
    "${STAGEPILOT_WEB_SERVICE:-stagepilot-web.service}"
    "${STAGEPILOT_WORKER_SERVICE:-stagepilot-worker.service}"
)

[[ -n "$ROLLBACK_REF" ]] || {
    printf 'Set STAGEPILOT_ROLLBACK_REF to an existing earlier commit.\n' >&2
    exit 1
}

cd "$PROJECT_ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
    printf 'Working tree has local changes; rollback stopped without changing them.\n' >&2
    exit 1
fi

git cat-file -e "$ROLLBACK_REF^{commit}"
git switch --detach "$ROLLBACK_REF"
npm ci
npm run build

for service_name in "${SERVICES[@]}"; do
    systemctl restart "$service_name"
    systemctl is-active --quiet "$service_name"
done

printf 'STAGEPILOT_ROLLBACK=PASS\n'
printf 'Current SHA: %s\n' "$(git rev-parse HEAD)"
printf 'Database migration 012 is additive and intentionally remains installed.\n'
