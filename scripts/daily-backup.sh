#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/streaming-box/scheduled}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

exec bash "$SCRIPT_DIR/backup-production.sh" "$BACKUP_ROOT/$TIMESTAMP"
