#!/usr/bin/env node
const { uploadBackup } = require("../src/services/backupDrive.service");

const [source, kind = "manual"] = process.argv.slice(2);
if (!source) {
    console.error("Usage: upload-backup-drive.js <backup-path> [kind]");
    process.exitCode = 2;
} else {
    uploadBackup(source, { kind }).then(receipt => console.log(JSON.stringify(receipt))).catch(error => {
        console.error(`Backup pending in Drive: ${/^backup_[a-z_]+$/.test(error.code || "") ? error.code : "backup_drive_failed"}. Local files preserved.`);
        process.exitCode = 1;
    });
}
