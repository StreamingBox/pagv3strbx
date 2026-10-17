const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createServerRelief } = require("../src/services/serverRelief.service");

async function fixture(t) {
    const parent = process.platform === "linux" ? os.homedir() : os.tmpdir();
    const base = await fs.mkdtemp(path.join(parent, "strbx-relief-test-"));
    t.after(() => fs.rm(base, { recursive: true, force: true }));
    const tempRoot = path.join(base, "tmp");
    const archiveRoot = path.join(base, "history");
    await fs.mkdir(tempRoot);
    return { base, tempRoot, archiveRoot, now: () => Date.now() + 2 * 60 * 60 * 1000, reserveBytes: 0, upload: async () => ({ verified: true, driveTarget: "gdrive:fixture" }) };
}

async function build(root, name = "pageV3-provider-renewals-abcdef1") {
    const dir = path.join(root, name);
    await fs.mkdir(path.join(dir, "assets"), { recursive: true });
    await fs.writeFile(path.join(dir, "index.html"), "<html>fictitious QA build</html>");
    await fs.writeFile(path.join(dir, "assets", "index-qa.js"), "console.log('QA');");
    return dir;
}

test("verifies Drive archives before removing originals and local staging", async t => {
    const options = await fixture(t);
    const source = await build(options.tempRoot);
    await fs.writeFile(path.join(options.tempRoot, "pageV3-provider-renewals-abcdef1.tgz"), "fictitious package");
    const uploaded = [];
    options.upload = async (target, { companions }) => {
        assert.equal(companions.length, 1);
        const manifest = JSON.parse(await fs.readFile(companions[0], "utf8"));
        const targetStat = await fs.stat(target);
        const content = targetStat.isDirectory()
            ? await fs.readFile(path.join(target, "assets", "index-qa.js"), "utf8")
            : await fs.readFile(target, "utf8");
        uploaded.push({ content, manifest });
        return { verified: true, driveTarget: "gdrive:fixture" };
    };
    const relieve = createServerRelief(options);
    const result = await relieve();
    assert.equal(result.archived, 2, JSON.stringify(result));
    assert.equal(result.failed, 0);
    assert.equal(result.driveVerified, 2);
    assert.equal(result.localCopiesRemoved, 2);
    assert.ok(result.releasedBytes > 0);
    await assert.rejects(fs.stat(source), { code: "ENOENT" });
    assert.deepEqual(uploaded.map(item => item.content).sort(), ["console.log('QA');", "fictitious package"].sort());
    for (const item of uploaded) for (const file of item.manifest.files) {
        assert.match(file.sha256, /^[a-f0-9]{64}$/);
    }
    assert.deepEqual(await fs.readdir(options.archiveRoot), []);
    assert.equal((await relieve()).status, "cooldown");
});

test("recognizes common extensionless build metadata and stages it for Drive", async t => {
    const options = await fixture(t);
    const source = await build(options.tempRoot);
    const licensePath = path.join(source, "tools", "node_modules", "es-module-lexer", "LICENSE");
    await fs.mkdir(path.dirname(licensePath), { recursive: true });
    await fs.writeFile(licensePath, "Fictitious package license metadata");
    let manifest;
    options.upload = async (target, { companions }) => {
        assert.equal(await fs.readFile(path.join(target, "tools", "node_modules", "es-module-lexer", "LICENSE"), "utf8"), "Fictitious package license metadata");
        manifest = JSON.parse(await fs.readFile(companions[0], "utf8"));
        return { verified: true };
    };

    const result = await createServerRelief(options)();

    assert.equal(result.failed, 0, JSON.stringify(result));
    assert.equal(result.archived, 1);
    assert.equal(result.driveVerified, 1);
    assert.equal(result.localCopiesRemoved, 1);
    assert.ok(manifest.files.some(file => file.path.endsWith("/LICENSE")));
    await assert.rejects(fs.stat(source), { code: "ENOENT" });
    assert.deepEqual(await fs.readdir(options.archiveRoot), []);
});

test("removes read-only build directories only after verifying Drive", async t => {
    const options = await fixture(t);
    const source = await build(options.tempRoot);
    await fs.chmod(path.join(source, "assets"), 0o500);
    options.upload = async () => ({ verified: true });

    const result = await createServerRelief(options)();

    assert.equal(result.archived, 1, JSON.stringify(result));
    assert.equal(result.failed, 0);
    assert.equal(result.releasedBytes, Buffer.byteLength("<html>fictitious QA build</html>") + Buffer.byteLength("console.log('QA');"));
    await assert.rejects(fs.stat(source), { code: "ENOENT" });
});

test("archives and removes empty stale build directories", async t => {
    const options = await fixture(t);
    const source = await build(options.tempRoot);
    await fs.unlink(path.join(source, "index.html"));
    await fs.unlink(path.join(source, "assets", "index-qa.js"));
    let manifest;
    options.upload = async (_target, { companions }) => {
        manifest = JSON.parse(await fs.readFile(companions[0], "utf8"));
        return { verified: true };
    };

    const result = await createServerRelief(options)();

    assert.equal(result.archived, 1, JSON.stringify(result));
    assert.equal(result.failed, 0);
    assert.equal(result.releasedBytes, 0);
    assert.deepEqual(manifest.files, []);
    await assert.rejects(fs.stat(source), { code: "ENOENT" });
});

test("keeps secrets, unknown snapshots and fresh builds untouched", async t => {
    const options = await fixture(t);
    const protectedBuild = await build(options.tempRoot);
    await fs.writeFile(path.join(protectedBuild, ".env"), "QA_ONLY=true");
    const unknown = await build(options.tempRoot, "unreviewed-directory");
    const fresh = await build(options.tempRoot, "pageV3-main-alignment-abcdef2");
    const timestamp = new Date(options.now());
    await fs.utimes(fresh, timestamp, timestamp);
    const result = await createServerRelief(options)();
    assert.equal(result.archived, 0);
    assert.equal(result.failed, 1);
    assert.equal(result.skipped, 1);
    for (const filename of [path.join(protectedBuild, ".env"), path.join(unknown, "index.html"), path.join(fresh, "index.html")]) {
        assert.ok((await fs.stat(filename)).isFile());
    }
});

test("does not remove files when destination verification fails", async t => {
    const options = await fixture(t);
    const source = await build(options.tempRoot);
    const result = await createServerRelief({ ...options, hash: async filename => filename.startsWith(options.archiveRoot) ? "wrong-copy" : "original" })();
    assert.equal(result.archived, 0);
    assert.equal(result.releasedBytes, 0);
    assert.equal(result.failed, 1);
    assert.ok((await fs.stat(path.join(source, "index.html"))).isFile());
    assert.equal((await fs.readdir(options.archiveRoot)).length, 1);
});

test("Drive upload failure preserves originals and the local recovery copy", async t => {
    const options = await fixture(t);
    const source = await build(options.tempRoot);
    const readOnlyDirectory = path.join(source, "assets");
    const originalMode = (await fs.stat(readOnlyDirectory)).mode & 0o7777;
    await fs.chmod(readOnlyDirectory, 0o500);
    const readOnlyMode = (await fs.stat(readOnlyDirectory)).mode & 0o7777;
    try {
        const result = await createServerRelief({ ...options, upload: async () => { throw Object.assign(new Error("offline"), { code: "backup_drive_upload_failed" }); } })();
        assert.equal(result.releasedBytes, 0);
        assert.equal(result.driveVerified, 0);
        assert.equal(result.failed, 1);
        assert.ok((await fs.stat(path.join(source, "index.html"))).isFile());
        assert.equal((await fs.stat(readOnlyDirectory)).mode & 0o7777, readOnlyMode);
        assert.equal((await fs.readdir(options.archiveRoot)).length, 1);
    } finally {
        await fs.chmod(readOnlyDirectory, originalMode);
    }
});

test("keeps originals when disk reserve would be breached", async t => {
    const options = await fixture(t);
    const source = await build(options.tempRoot);
    const result = await createServerRelief({ ...options, reserveBytes: Number.MAX_SAFE_INTEGER })();
    assert.equal(result.diskLimited, true);
    assert.equal(result.archived, 0);
    assert.equal(result.skipped, 1);
    assert.ok((await fs.stat(source)).isDirectory());
});

test("keeps active deployment snapshots and oversized candidates", async t => {
    const options = await fixture(t);
    const source = await build(options.tempRoot);
    const active = await createServerRelief({ ...options, inUse: async () => true })();
    assert.equal(active.skipped, 1);
    assert.equal(active.releasedBytes, 0);
    const oversized = await createServerRelief({ ...options, maxBytes: 1 })();
    assert.equal(oversized.failureCodes.size_limit, 1);
    assert.ok((await fs.stat(path.join(source, "index.html"))).isFile());
});

test("Linux detects a deployment file currently open by a process", { skip: process.platform !== "linux" }, async t => {
    const options = await fixture(t);
    const source = await build(options.tempRoot);
    const handle = await fs.open(path.join(source, "index.html"), "r");
    try {
        const result = await createServerRelief(options)();
        assert.equal(result.skipped, 1);
        assert.equal(result.releasedBytes, 0);
    } finally { await handle.close(); }
});

test("rejects source changes during verification", async t => {
    const options = await fixture(t);
    const source = await build(options.tempRoot);
    let changed = false;
    const result = await createServerRelief({ ...options, hash: async filename => {
        const digest = createHash("sha256").update(await fs.readFile(filename)).digest("hex");
        if (!changed && filename.startsWith(options.archiveRoot)) {
            changed = true;
            await fs.writeFile(path.join(source, "assets", "index-qa.js"), "console.log('changed');");
        }
        return digest;
    } })();
    assert.equal(result.failed, 1);
    assert.equal(result.releasedBytes, 0);
    assert.equal(await fs.readFile(path.join(source, "assets", "index-qa.js"), "utf8"), "console.log('changed');");
});

test("blocks overlapping executions", async t => {
    const options = await fixture(t);
    await build(options.tempRoot);
    let release;
    let started;
    const paused = new Promise(resolve => { started = resolve; });
    const proceed = new Promise(resolve => { release = resolve; });
    const relieve = createServerRelief({ ...options, hash: async filename => {
        started();
        await proceed;
        return createHash("sha256").update(await fs.readFile(filename)).digest("hex");
    } });
    const first = relieve();
    await paused;
    assert.equal((await relieve()).status, "busy");
    release();
    const result = await first;
    assert.equal(result.archived, 1, JSON.stringify(result));
});

test("rejects symlinked snapshots and archive roots", async t => {
    const options = await fixture(t);
    const outside = path.join(options.base, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "index.html"), "must remain");
    const link = path.join(options.tempRoot, "pageV3-provider-renewals-abcdef1");
    try { await fs.symlink(outside, link, "junction"); }
    catch (error) { if (error.code === "EPERM") { t.skip("Creating symlinks requires OS permission"); return; } throw error; }
    const result = await createServerRelief(options)();
    assert.equal(result.failed, 1);
    assert.equal(await fs.readFile(path.join(outside, "index.html"), "utf8"), "must remain");
    await fs.symlink(outside, options.archiveRoot, "junction").catch(async error => {
        if (error.code !== "EEXIST") throw error;
        await fs.rmdir(options.archiveRoot);
        await fs.symlink(outside, options.archiveRoot, "junction");
    });
    await assert.rejects(createServerRelief(options)(), /unsafe_archive_root/);
});
