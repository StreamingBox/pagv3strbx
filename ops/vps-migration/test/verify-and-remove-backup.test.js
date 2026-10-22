const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { removeVerifiedBackup } = require("../verify-and-remove-backup");

const driveRoot = "gdrive:StreamingBoxBackups/production";

async function fixture(t, { verified = true, sourceMatches = true, extraFile = false } = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pagev3-backup-test-"));
    const backup = path.join(root, "20261022T000000Z-12345678-1234-4234-8234-123456789abc");
    const receipts = path.join(root, "receipts");
    await fs.mkdir(backup);
    await fs.mkdir(receipts);
    await fs.writeFile(path.join(backup, "database.sql.gz"), "fake database");
    await fs.writeFile(path.join(backup, "user-assets.tgz"), "fake assets");
    if (extraFile) await fs.writeFile(path.join(backup, "unexpected.txt"), "keep");
    await fs.writeFile(path.join(receipts, "backup.verified.json"), JSON.stringify({
        source: sourceMatches ? backup : path.join(root, "another-backup"),
        kind: "production",
        verified,
        driveTarget: `${driveRoot}/production/test-backup.tar`,
        sha256: "a".repeat(64),
        bytes: 100,
    }));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    return { root, backup, receipts };
}

test("removes only the exact backup with a matching verified Drive receipt", async t => {
    const item = await fixture(t);
    await removeVerifiedBackup(item.backup, item.root, item.receipts, driveRoot);
    await assert.rejects(fs.stat(item.backup), { code: "ENOENT" });
});

for (const scenario of [
    ["keeps a backup without Drive verification", { verified: false }],
    ["keeps a backup when the receipt names another source", { sourceMatches: false }],
    ["keeps a backup with unexpected files", { extraFile: true }],
]) {
    test(scenario[0], async t => {
        const item = await fixture(t, scenario[1]);
        await assert.rejects(removeVerifiedBackup(item.backup, item.root, item.receipts, driveRoot));
        await fs.access(item.backup);
    });
}
