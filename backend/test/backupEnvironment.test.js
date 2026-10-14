const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

test("backup environment loading does not pollute a streamed archive", (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "backup-env-test-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

    const envPath = path.join(directory, ".env");
    fs.writeFileSync(envPath, "BACKUP_TEST_VALUE=fictional\n");
    const helperPath = path.resolve(__dirname, "../src/utils/backupEnvironment.js");
    const probe = [
        `require(${JSON.stringify(helperPath)}).loadBackupEnvironment(${JSON.stringify(envPath)});`,
        "process.stdout.write(Buffer.from([0x1f, 0x8b]));",
    ].join("\n");
    const result = spawnSync(process.execPath, ["-e", probe], { encoding: "buffer" });

    assert.equal(result.status, 0, result.stderr.toString());
    assert.deepEqual(result.stdout, Buffer.from([0x1f, 0x8b]));
});
