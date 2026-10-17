#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/streaming-box/scheduled}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)-$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"

if [[ "${BACKUP_DRIVE_UPLOAD:-true}" != "true" ]]; then
  echo "Drive upload is mandatory for every backup; local-only mode is disabled" >&2
  exit 1
fi

RCLONE_BIN="${RCLONE_BIN:-/home/ubuntu/.local/bin/rclone}"
DRIVE_ROOT="${BACKUP_DRIVE_DEST:-gdrive:StreamingBoxBackups/production/scheduled}"
DRIVE_TARGET="${DRIVE_ROOT%/}/$TIMESTAMP"

notify_drive_backup() {
  if node "$PROJECT_DIR/backend/scripts/notify-backup-telegram.js" "$TIMESTAMP" "$DRIVE_TARGET"; then
    return 0
  fi

  echo "WARNING: Drive backup is verified, but Telegram notification could not be delivered" >&2
}

if [[ -n "${MYSQLDUMP_BIN:-}" ]]; then
  command -v "$MYSQLDUMP_BIN" >/dev/null || {
    echo "Configured database dump client is not executable: $MYSQLDUMP_BIN" >&2
    exit 127
  }
elif command -v mysqldump >/dev/null; then
  MYSQLDUMP_BIN="$(command -v mysqldump)"
elif command -v mariadb-dump >/dev/null; then
  MYSQLDUMP_BIN="$(command -v mariadb-dump)"
else
  echo "No mysqldump-compatible database client is installed; backup not started" >&2
  exit 127
fi
export MYSQLDUMP_BIN

VERIFY_DIR="$(mktemp -d "${TMPDIR:-/tmp}/streaming-box-backup.XXXXXX")"
chmod 700 "$VERIFY_DIR"
finish_backup() {
  local status=$?
  if (( status != 0 )); then
    node "$PROJECT_DIR/backend/scripts/notify-backup-telegram.js" --pending 1 || echo "WARNING: backup failure notification pending" >&2
  fi
  rm -rf -- "$VERIFY_DIR"
  return "$status"
}
trap finish_backup EXIT

if [[ "${BACKUP_REMOVE_LOCAL_AFTER_DRIVE_VERIFY:-true}" != "true" ]]; then
  bash "$SCRIPT_DIR/backup-production.sh" "$BACKUP_DIR"
  exit 0
fi

"$RCLONE_BIN" mkdir "$DRIVE_TARGET"
declare -A VERIFIED_HASHES=()

upload_and_verify_stream() {
  local name="$1"
  local remote_path="$2"
  local fifo="$VERIFY_DIR/$name.fifo"
  local checksum_file="$VERIFY_DIR/$name.md5"
  local checksum_pid upload_status local_hash remote_hash
  shift 2

  rm -f -- "$fifo" "$checksum_file"
  mkfifo "$fifo"
  md5sum < "$fifo" > "$checksum_file" &
  checksum_pid=$!

  if "$@" | tee "$fifo" | "$RCLONE_BIN" rcat --drive-chunk-size 8M "$remote_path"; then
    upload_status=0
  else
    upload_status=$?
  fi

  if ! wait "$checksum_pid"; then
    echo "Could not calculate local MD5 for $name" >&2
    return 1
  fi
  rm -f -- "$fifo"

  if (( upload_status != 0 )); then
    echo "Drive upload failed for $name; no local archive was created" >&2
    return "$upload_status"
  fi

  local_hash="$(awk '{print $1}' "$checksum_file")"
  remote_hash="$("$RCLONE_BIN" md5sum "$remote_path" | awk 'NR == 1 {print $1}')"
  if [[ ! "$local_hash" =~ ^[[:xdigit:]]{32}$ || "$local_hash" != "$remote_hash" ]]; then
    echo "Drive MD5 verification failed for $name" >&2
    return 1
  fi

  VERIFIED_HASHES["$name"]="$local_hash"
  echo "Drive verified: $name ($local_hash)"
}

stream_user_assets() {
  local asset_paths=()
  local asset_path
  for asset_path in backend/storage frontend/public/platform-logos frontend/public/downloads; do
    if [[ -e "$PROJECT_DIR/$asset_path" ]]; then
      asset_paths+=("$asset_path")
    fi
  done

  if (( ${#asset_paths[@]} == 0 )); then
    tar -czf - --files-from /dev/null
  else
    tar -C "$PROJECT_DIR" -czf - "${asset_paths[@]}"
  fi
}

upload_and_verify_stream \
  "database.sql.gz" \
  "$DRIVE_TARGET/database.sql.gz" \
  node "$PROJECT_DIR/backend/scripts/backup-database.js" -

upload_and_verify_stream \
  "user-assets.tgz" \
  "$DRIVE_TARGET/user-assets.tgz" \
  stream_user_assets

MANIFEST="$VERIFY_DIR/BACKUP-COMPLETE.txt"
{
  printf 'format=streaming-box-backup-v1\n'
  printf 'created_utc=%s\n' "$TIMESTAMP"
  printf 'database.sql.gz.md5=%s\n' "${VERIFIED_HASHES[database.sql.gz]}"
  printf 'user-assets.tgz.md5=%s\n' "${VERIFIED_HASHES[user-assets.tgz]}"
} > "$MANIFEST"

upload_and_verify_stream \
  "BACKUP-COMPLETE.txt" \
  "$DRIVE_TARGET/BACKUP-COMPLETE.txt" \
  cat "$MANIFEST"

echo "Completed Drive backup: $DRIVE_TARGET"
notify_drive_backup
