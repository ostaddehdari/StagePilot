#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="${STAGEPILOT_PROJECT_ROOT:-/opt/stagepilot}"
ROLLBACK_REF="${STAGEPILOT_ROLLBACK_REF:-}"
SERVICES=(stagepilot-api.service stagepilot-web.service stagepilot-worker.service)

[[ -n "$ROLLBACK_REF" ]] || {
    printf 'Set STAGEPILOT_ROLLBACK_REF to the previous accepted commit.\n' >&2
    exit 1
}

cd "$PROJECT_ROOT"
git config --global --add safe.directory "$PROJECT_ROOT" 2>/dev/null || true
git diff --quiet && git diff --cached --quiet || {
    printf 'Tracked working tree changes detected; rollback stopped.\n' >&2
    exit 1
}
git cat-file -e "$ROLLBACK_REF^{commit}"
git switch --detach "$ROLLBACK_REF"
npm ci
npm run build
for service_name in "${SERVICES[@]}"; do
    systemctl restart "$service_name"
    systemctl is-active --quiet "$service_name"
done
printf 'STAGEPILOT_CORE_AUTOMATION_ROLLBACK=PASS\n'
printf 'Migration 013 is additive and intentionally remains installed.\n'
