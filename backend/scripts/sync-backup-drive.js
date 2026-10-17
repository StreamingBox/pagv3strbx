#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { uploadBackup, retryPending } = require("../src/services/backupDrive.service");
const { notifyBackupFailure } = require("./notify-backup-telegram");

const roots = [
    ["/home/ubuntu/.strbx-source-history", "source-history"],
    ["/home/ubuntu/.strbx-server-relief", "server-relief-history"],
    ["/var/backups/streaming-box", "historical"],
    ["/var/www/pageV3/.deploy-backups", "deployment-history"],
    ["/var/www/pageV3/frontend/releases", "frontend-release"],
];

async function syncBackups({ backfill = false } = {}) {
    const result = { verified: 0, failed: 0 };
    const retried = await retryPending({ includeFailures: true });
    result.verified += retried.verified;
    const failed = new Set(retried.failedSources);
    if (backfill) for (const [root, kind] of roots) {
        let entries;
        try { entries = await fs.readdir(root); }
        catch (error) { if (error.code === "ENOENT") continue; throw error; }
        for (const name of entries.sort()) {
            if (name.startsWith(".")) continue;
            const source = path.join(root, name);
            try {
                if ((await fs.lstat(source)).mtimeMs > Date.now() - 120000) continue;
                const receipt = await uploadBackup(source, { kind });
                result.verified++;
                failed.delete(source);
                console.log(JSON.stringify({ verified: true, kind, name, driveTarget: receipt.driveTarget, sha256: receipt.sha256 }));
            } catch (error) {
                if (error.code === "ENOENT") continue;
                failed.add(source);
                console.error(JSON.stringify({ pending: true, kind, name }));
            }
        }
    }
    result.failed = failed.size;
    return result;
}

async function main() {
    const result = await syncBackups({ backfill: process.argv.includes("--backfill") });
    console.log(JSON.stringify({ backupDriveSync: result }));
    const statePath = path.join(process.env.BACKUP_RCLONE_HOME || "/home/ubuntu", ".strbx-drive-sync-status.json");
    let previous = {};
    try { previous = JSON.parse(await fs.readFile(statePath, "utf8")); } catch { /* Initial run. */ }
    if (result.failed > 0 && previous.failed !== result.failed) await notifyBackupFailure({ count: result.failed });
    await fs.writeFile(statePath, `${JSON.stringify({ ...result, checkedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
    if (process.getuid?.() === 0) {
        const owner = await fs.stat(process.env.BACKUP_RCLONE_HOME || "/home/ubuntu");
        await fs.chown(statePath, owner.uid, owner.gid);
    }
    if (result.failed) process.exitCode = 1;
}

if (require.main === module) main().catch(() => {
    console.error("Backup Drive sync failed; local files and Drive history preserved.");
    process.exitCode = 1;
});

module.exports = { syncBackups };
