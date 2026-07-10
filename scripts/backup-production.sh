#!/usr/bin/env bash
# Creates one private production backup containing the database and user assets.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${1:?Usage: backup-production.sh /absolute/backup-directory}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-21}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

node "$PROJECT_DIR/backend/scripts/backup-database.js" "$BACKUP_DIR/database.sql.gz"

# Credentials and configuration never belong in this archive. Keep only data
# that cannot be rebuilt from Git: proofs, support evidence and uploaded logos.
tar -C "$PROJECT_DIR" \
  --ignore-failed-read \
  -czf "$BACKUP_DIR/user-assets.tgz" \
  backend/storage \
  frontend/public/platform-logos \
  frontend/public/downloads

chmod 600 "$BACKUP_DIR/database.sql.gz" "$BACKUP_DIR/user-assets.tgz"

BACKUP_ROOT="$(dirname "$BACKUP_DIR")"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETENTION_DAYS" -exec rm -rf {} +

echo "Production backup complete: $BACKUP_DIR"
