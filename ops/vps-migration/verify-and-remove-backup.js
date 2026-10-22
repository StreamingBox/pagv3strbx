const fs = require("node:fs/promises");
const path = require("node:path");

async function removeVerifiedBackup(backupArg, rootArg, receiptsArg, driveRoot = "gdrive:StreamingBoxBackups/production") {
    const root = await fs.realpath(rootArg);
    const backupPath = path.resolve(backupArg);
    if (await fs.realpath(path.dirname(backupPath)) !== root
        || !/^\d{8}T\d{6}Z-[0-9a-f-]{36}$/.test(path.basename(backupPath))) {
        throw new Error("Refusing to remove a backup outside its unique pending directory");
    }

    const stat = await fs.lstat(backupPath);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(backupPath) !== backupPath) {
        throw new Error("Pending backup is not a regular directory");
    }
    const entries = (await fs.readdir(backupPath)).sort();
    if (entries.join("\n") !== "database.sql.gz\nuser-assets.tgz") {
        throw new Error("Unexpected files in pending backup; preserving it");
    }
    for (const entry of entries) {
        const item = await fs.lstat(path.join(backupPath, entry));
        if (!item.isFile() || item.isSymbolicLink() || item.size < 1) {
            throw new Error("Invalid backup file; preserving local copy");
        }
    }

    let verified = false;
    const targetPrefix = `${driveRoot.replace(/\/+$/, "")}/production/`;
    for (const filename of await fs.readdir(receiptsArg)) {
        if (!filename.endsWith(".verified.json")) continue;
        let receipt;
        try { receipt = JSON.parse(await fs.readFile(path.join(receiptsArg, filename), "utf8")); }
        catch { continue; }
        if (receipt.source === backupPath && receipt.kind === "production" && receipt.verified === true
            && String(receipt.driveTarget || "").startsWith(targetPrefix)
            && /^[a-f0-9]{64}$/.test(receipt.sha256 || "") && Number(receipt.bytes) > 0) {
            verified = true;
            break;
        }
    }
    if (!verified) throw new Error("No matching verified Drive receipt; preserving local copy");

    await fs.rm(backupPath, { recursive: true, force: false });
    return { removed: true };
}

if (require.main === module) {
    const [backup, root, receipts] = process.argv.slice(2);
    removeVerifiedBackup(backup, root, receipts)
        .then(() => console.log("Drive receipt verified; removed only this completed pending backup."))
        .catch(error => {
            console.error(`Backup preserved: ${error.message}`);
            process.exitCode = 1;
        });
}

module.exports = { removeVerifiedBackup };
