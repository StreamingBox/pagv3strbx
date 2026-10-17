const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { execFileSync } = require("node:child_process");
const { createBackupDrive } = require("../src/services/backupDrive.service");

async function fixture(t) {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "backup-drive-test-"));
    t.after(() => fs.rm(base, { recursive: true, force: true }));
    const source = path.join(base, "fictitious-copy");
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, "example.txt"), "fictional recovery content");
    const files = new Map();
    let uploads = 0;
    const options = {
        env: { BACKUP_RCLONE_HOME: base },
        receiptsRoot: path.join(base, "receipts"),
        archiveFactory: () => ({ stream: Readable.from([Buffer.from("fictitious archive")]), done: Promise.resolve(), stop() {} }),
        transport: {
            async upload(target, stream, onChunk) {
                uploads++;
                const chunks = [];
                for await (const chunk of stream) { chunks.push(chunk); onChunk(chunk); }
                files.set(target, Buffer.concat(chunks));
            },
            async download(target, onChunk) { onChunk(files.get(target)); },
        },
    };
    return { base, source, files, options, uploads: () => uploads };
}

test("verifies downloaded bytes before issuing a Drive receipt, and reuses verified copies", async t => {
    const f = await fixture(t);
    const drive = createBackupDrive(f.options);
    const receipt = await drive.uploadBackup(f.source, { kind: "source" });
    assert.equal(receipt.verified, true);
    assert.match(receipt.sha256, /^[a-f0-9]{64}$/);
    assert.match(receipt.driveTarget, /^gdrive:StreamingBoxBackups\/production\/source\//);
    assert.equal(receipt.bytes, f.files.get(receipt.driveTarget).length);
    assert.deepEqual(await drive.uploadBackup(f.source, { kind: "source" }), receipt);
    assert.equal(f.uploads(), 1);
    assert.equal(await fs.readFile(path.join(f.source, "example.txt"), "utf8"), "fictional recovery content");
});

test("upload failures stay queued and retry without removing the local backup", async t => {
    const f = await fixture(t);
    const originalUpload = f.options.transport.upload;
    let offline = true;
    f.options.transport.upload = async (...args) => { if (offline) throw new Error("offline"); return originalUpload(...args); };
    const drive = createBackupDrive(f.options);
    await assert.rejects(drive.uploadBackup(f.source), /backup_drive_failed/);
    const pending = await fs.readdir(f.options.receiptsRoot);
    assert.equal(pending.filter(p => p.endsWith(".pending.json")).length, 1);
    assert.equal(pending.filter(p => p.endsWith(".verified.json")).length, 0);
    offline = false;
    assert.deepEqual(await drive.retryPending(), { verified: 1, failed: 0 });
    assert.deepEqual(await drive.retryPending(), { verified: 0, failed: 0 });
    assert.ok((await fs.stat(f.source)).isDirectory());
});

test("mismatched remote content is never marked verified", async t => {
    const f = await fixture(t);
    f.options.transport.download = async (target, onChunk) => onChunk(Buffer.from("corrupt copy"));
    await assert.rejects(createBackupDrive(f.options).uploadBackup(f.source), /backup_drive_verification_failed/);
    assert.equal((await fs.readdir(f.options.receiptsRoot)).filter(p => p.endsWith(".verified.json")).length, 0);
});

test("new versions receive different immutable Drive destinations", async t => {
    const f = await fixture(t);
    const drive = createBackupDrive(f.options);
    const first = await drive.uploadBackup(f.source);
    await fs.writeFile(path.join(f.source, "example.txt"), "second fictional version with changed size");
    const second = await drive.uploadBackup(f.source);
    assert.notEqual(first.driveTarget, second.driveTarget);
    assert.equal(f.files.size, 2);
});

test("source changes during streaming stop completion", async t => {
    const f = await fixture(t);
    const originalUpload = f.options.transport.upload;
    f.options.transport.upload = async (...args) => {
        await originalUpload(...args);
        await fs.writeFile(path.join(f.source, "example.txt"), "changed during upload");
    };
    await assert.rejects(createBackupDrive(f.options).uploadBackup(f.source), /backup_source_changed/);
});

test("refuses companion files outside the backup directory", async t => {
    const f = await fixture(t);
    await assert.rejects(createBackupDrive(f.options).uploadBackup(f.source, { companions: [path.join(f.source, "example.txt")] }), /backup_companion_outside_root/);
    assert.equal(f.uploads(), 0);
});

test("source changes during readback never issue a verified receipt", async t => {
    const f = await fixture(t);
    const download = f.options.transport.download;
    f.options.transport.download = async (...args) => {
        await download(...args);
        await fs.writeFile(path.join(f.source, "example.txt"), "changed during remote verification");
    };
    await assert.rejects(createBackupDrive(f.options).uploadBackup(f.source), /backup_source_changed/);
    assert.equal((await fs.readdir(f.options.receiptsRoot)).filter(p => p.endsWith(".verified.json")).length, 0);
});

test("Linux recovery archive can be read back as a real tar", { skip: process.platform !== "linux" }, async t => {
    const f = await fixture(t);
    delete f.options.archiveFactory;
    const receipt = await createBackupDrive(f.options).uploadBackup(f.source);
    const listing = execFileSync("tar", ["-tf", "-"], { input: f.files.get(receipt.driveTarget), encoding: "utf8" });
    assert.match(listing, /fictitious-copy\/example.txt/);
    const content = execFileSync("tar", ["-xOf", "-", "fictitious-copy/example.txt"], { input: f.files.get(receipt.driveTarget), encoding: "utf8" });
    assert.equal(content, "fictional recovery content");
});
