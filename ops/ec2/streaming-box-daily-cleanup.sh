#!/usr/bin/env bash
set -u

# Keep the cleanup scoped to disposable operational files.
BACKUP_ROOT="/var/backups/streaming-box/scheduled"
PM2_LOG_ROOTS=("/home/ubuntu/.pm2/logs" "/root/.pm2/logs")
RCLONE_BIN="${RCLONE_BIN:-/home/ubuntu/.local/bin/rclone}"
DRIVE_ROOT="${BACKUP_DRIVE_DEST:-gdrive:StreamingBoxBackups/production/scheduled}"

log() {
    logger -t streaming-box-cleanup -- "$*" 2>/dev/null || true
}

rclone_as_ubuntu() {
    runuser -u ubuntu -- env HOME=/home/ubuntu "$RCLONE_BIN" "$@"
}

disk_usage_percent() {
    df -P / | awk 'NR == 2 {gsub(/%/, "", $5); print $5}'
}

remove_old_scheduled_backups() {
    [ -d "$BACKUP_ROOT" ] || return 0

    local backup name target
    while IFS= read -r backup; do
        case "$backup" in
            "$BACKUP_ROOT"/*) ;;
            *) continue ;;
        esac

        if [ ! -s "$backup/database.sql.gz" ] || [ ! -s "$backup/user-assets.tgz" ]; then
            log "Keeping incomplete local backup for recovery: $backup"
            continue
        fi

        name="$(basename "$backup")"
        target="${DRIVE_ROOT%/}/$name"
        if ! rclone_as_ubuntu copy "$backup" "$target" --transfers 1 --checkers 2; then
            log "Drive upload failed; kept local backup: $backup"
            continue
        fi
        if ! rclone_as_ubuntu check "$backup" "$target" --one-way; then
            log "Drive verification failed; kept local backup: $backup"
            continue
        fi

        rm -rf -- "$backup"
        log "Drive copy verified; removed local backup: $backup"
    done < <(
        find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +0 -print
    )
}

clean_temporary_files() {
    find /tmp -xdev -type f -mtime +2 -delete 2>/dev/null || true
    find /var/tmp -xdev -type f -mtime +2 -delete 2>/dev/null || true
}

clean_pm2_logs() {
    local log_root
    for log_root in "${PM2_LOG_ROOTS[@]}"; do
        [ -d "$log_root" ] || continue
        find "$log_root" -xdev -type f -name '*.log' -mtime +7 -delete 2>/dev/null || true
        find "$log_root" -xdev -type f -name '*.log' -size +100M -exec truncate -s 0 {} \; 2>/dev/null || true
    done
}

remove_old_scheduled_backups
clean_temporary_files
clean_pm2_logs
apt-get clean >/dev/null 2>&1 || true
journalctl --vacuum-time=14d >/dev/null 2>&1 || true
log "Daily cleanup completed; filesystem usage is $(disk_usage_percent)%"
