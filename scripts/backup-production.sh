#!/usr/bin/env bash
# Creates one private production backup containing the database and user assets.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${1:?Usage: backup-production.sh /absolute/backup-directory}"
[[ "$BACKUP_DIR" = /* && ! -e "$BACKUP_DIR" ]] || { echo "Use a new absolute backup directory; existing backups are preserved" >&2; exit 1; }
mkdir -p "$(dirname "$BACKUP_DIR")"
mkdir "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

node "$PROJECT_DIR/backend/scripts/backup-database.js" "$BACKUP_DIR/database.sql.gz"

# Credentials and configuration never belong in this archive. Keep only data
# that cannot be rebuilt from Git: proofs, support evidence and uploaded logos.
asset_paths=()
for asset_path in backend/storage frontend/public/platform-logos frontend/public/downloads; do
  if [ -e "$PROJECT_DIR/$asset_path" ]; then
    asset_paths+=("$asset_path")
  fi
done
if [ "${#asset_paths[@]}" -eq 0 ]; then
  tar -czf "$BACKUP_DIR/user-assets.tgz" --files-from /dev/null
else
  tar -C "$PROJECT_DIR" -czf "$BACKUP_DIR/user-assets.tgz" "${asset_paths[@]}"
fi

chmod 600 "$BACKUP_DIR/database.sql.gz" "$BACKUP_DIR/user-assets.tgz"
gzip -t "$BACKUP_DIR/database.sql.gz"
tar -tzf "$BACKUP_DIR/user-assets.tgz" >/dev/null

RECEIPT="$(node "$PROJECT_DIR/backend/scripts/upload-backup-drive.js" "$BACKUP_DIR" production)"
DRIVE_TARGET="$(printf '%s' "$RECEIPT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(!r.verified)process.exit(1);console.log(r.driveTarget);})')"

echo "Production backup verified in Drive: $DRIVE_TARGET (local copy preserved: $BACKUP_DIR)"
node "$PROJECT_DIR/backend/scripts/notify-backup-telegram.js" "$(date -u +%Y%m%dT%H%M%SZ)" "$DRIVE_TARGET" || echo "WARNING: Drive verified; Telegram notification pending" >&2
