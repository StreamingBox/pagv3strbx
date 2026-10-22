#!/usr/bin/env bash

set -euo pipefail

BACKUP_ROOT="${PAGEV3_BACKUP_ROOT:-/backups/pending}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)-$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"

mkdir -p -- "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
bash /app/scripts/backup-production.sh "$BACKUP_DIR"
node /app/ops/vps-migration/verify-and-remove-backup.js \
  "$BACKUP_DIR" \
  "$BACKUP_ROOT" \
  "${BACKUP_RCLONE_HOME:-/home/node}/.strbx-drive-receipts"
