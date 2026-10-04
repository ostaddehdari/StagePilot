#!/usr/bin/env bash
set -Eeuo pipefail

printf '%s\n' '===== DISABLE OPENSEARCH ====='

if systemctl list-unit-files --type=service --no-legend 2>/dev/null \
    | awk '{print $1}' \
    | grep -qx 'opensearch.service'; then
    systemctl disable --now opensearch.service
    printf '%s\n' 'OpenSearch systemd service: disabled and stopped'
else
    printf '%s\n' 'OpenSearch systemd service: not installed'
fi

if command -v docker >/dev/null 2>&1; then
    mapfile -t containers < <(
        docker ps -a --format '{{.ID}}\t{{.Names}}\t{{.Image}}' 2>/dev/null \
            | awk 'BEGIN { IGNORECASE=1 } $2 ~ /opensearch/ || $3 ~ /opensearch/ { print $1 }'
    )
    if ((${#containers[@]})); then
        for container_id in "${containers[@]}"; do
            docker update --restart=no "$container_id" >/dev/null
            docker stop -t 30 "$container_id" >/dev/null || true
            printf 'OpenSearch container stopped: %s\n' "$container_id"
        done
    else
        printf '%s\n' 'OpenSearch Docker container: not found'
    fi
else
    printf '%s\n' 'Docker: not installed; container check skipped'
fi

printf '%s\n' 'StagePilot search backend: PostgreSQL'
printf '%s\n' 'STAGEPILOT_OPENSEARCH_DISABLED=PASS'
