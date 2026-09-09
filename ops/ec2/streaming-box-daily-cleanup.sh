#!/usr/bin/env bash
set -u

# Keep the cleanup scoped to disposable operational files.
BACKUP_ROOT="/var/backups/streaming-box/scheduled"
PM2_LOG_ROOTS=("/home/ubuntu/.pm2/logs" "/root/.pm2/logs")

log() {
    logger -t streaming-box-cleanup -- "$*" 2>/dev/null || true
}

disk_usage_percent() {
    df -P / | awk 'NR == 2 {gsub(/%/, "", $5); print $5}'
}

remove_old_scheduled_backups() {
    [ -d "$BACKUP_ROOT" ] || return 0

    # Normal retention is three days. The name guard prevents this job from
    # ever traversing outside the scheduled-backup directory.
    find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +3 -exec rm -rf -- {} +

    # If the root filesystem is still tight, keep only the three newest
    # scheduled snapshots. Manual backups and application data are untouched.
    local usage
    usage="$(disk_usage_percent)"
    if [ "${usage:-0}" -ge 85 ]; then
        while IFS= read -r backup; do
            case "$backup" in
                "$BACKUP_ROOT"/*) rm -rf -- "$backup"; log "Removed old scheduled backup: $backup" ;;
            esac
        done < <(
            find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' -printf '%T@ %p\n' \
                | sort -nr \
                | awk 'NR > 3 {sub(/^[^ ]+ /, ""); print}'
        )
    fi
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
journalctl --vacuum-time=14d >/dev/null 2>&1 || true
log "Daily cleanup completed; filesystem usage is $(disk_usage_percent)%"
