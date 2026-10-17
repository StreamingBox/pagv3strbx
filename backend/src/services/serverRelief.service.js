const fs = require("node:fs/promises");
const { constants, createReadStream } = require("node:fs");
const { createHash, randomUUID } = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const { uploadBackup } = require("./backupDrive.service");

const MiB = 1024 ** 2;
// These are reviewed deployment snapshots, never the running app or its backups.
const LEGACY_BUILD = /^(?:pageV3-(?:frontend-(?:hotfix|recovery-baseline)-\d{8}|module-repair-[a-f0-9]{7,40}-\d{8}|startup-recovery-[a-f0-9]{7,40}-\d{8}-\d{2}|main-alignment-[a-f0-9]{7,40}|provider-renewals-[a-f0-9]{7,40})|codex-frontend-recovery-[a-f0-9]{7,40}|strbx-stale-recovery-[a-f0-9]{7,40}|strbx-frontend-stage-\d{14}-[a-f0-9]{7,40})(?:\.tgz)?$/;
const PROTECTED = /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.git|\.codex[^/]*|backups?|uploads?|storage|topup-proofs|credentials)(?:\/|$)|\.(?:pem|key|sql|sqlite|sqlite3|db|patch)(?:\.[^/]*)?$/i;
const BUILD_FILE = /\.(?:js|mjs|cjs|ts|css|html|json|map|md|txt|sh|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|webmanifest|br|gz|tgz|apk)$/i;

function contains(root, filename) {
    const relative = path.relative(root, filename);
    return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function signature(stat) {
    return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.mode}`;
}

async function hashFile(filename) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(filename, { highWaterMark: 64 * 1024 })) hash.update(chunk);
    return hash.digest("hex");
}

async function durableWrite(filename, content) {
    const handle = await fs.open(filename, "wx", 0o600);
    try {
        await handle.writeFile(content);
        await handle.sync();
    } finally { await handle.close(); }
}

async function syncDirectory(directory) {
    if (process.platform === "win32") return;
    const handle = await fs.open(directory, "r");
    try { await handle.sync(); } finally { await handle.close(); }
}

async function hasOpenReferences(source) {
    if (process.platform !== "linux") return false;
    for (const pid of (await fs.readdir("/proc")).filter(name => /^\d+$/.test(name))) {
        const processRoot = `/proc/${pid}`;
        try {
            if ((await fs.stat(processRoot)).uid !== process.getuid()) continue;
            const references = [await fs.readlink(`${processRoot}/cwd`)];
            for (const fd of await fs.readdir(`${processRoot}/fd`)) {
                try { references.push(await fs.readlink(`${processRoot}/fd/${fd}`)); } catch { /* The descriptor may close while sampling. */ }
            }
            if (references.some(filename => filename === source || contains(source, filename))) return true;
        } catch { /* Processes may exit while sampling procfs. */ }
    }
    return false;
}

async function inventory(root, uid, maxBytes) {
    const files = [];
    const directories = [];
    let bytes = 0;
    async function visit(filename, relative) {
        if (files.length + directories.length >= 5000) throw new Error("too_many_files");
        const stat = await fs.lstat(filename);
        if (stat.isSymbolicLink() || (uid !== undefined && stat.uid !== uid) || PROTECTED.test(relative)) {
            throw new Error("protected_entry");
        }
        if (stat.isDirectory()) {
            directories.push(relative);
            for (const name of (await fs.readdir(filename)).sort()) await visit(path.join(filename, name), relative ? `${relative}/${name}` : name);
        } else if (stat.isFile() && stat.nlink === 1 && BUILD_FILE.test(relative || path.basename(root))) {
            bytes += stat.size;
            if (bytes > maxBytes) throw new Error("size_limit");
            files.push({ relative, size: stat.size, mtimeMs: stat.mtimeMs, signature: signature(stat) });
        } else { throw new Error("unrecognized_entry"); }
    }
    await visit(root, "");
    return { files, directories, bytes };
}

function createServerRelief({
    tempRoot = "/tmp",
    archiveRoot = path.join(os.homedir(), ".strbx-server-relief"),
    minimumAgeMs = 60 * 60 * 1000,
    cooldownMs = 5 * 60 * 1000,
    reserveBytes = 512 * MiB,
    maxBytes = 256 * MiB,
    now = Date.now,
    hash = hashFile,
    inUse = hasOpenReferences,
    upload = uploadBackup,
} = {}) {
    let running = false;
    let lastRun = null;
    return async function relieveServer() {
        if (running) return { status: "busy" };
        if (lastRun !== null && now() - lastRun < cooldownMs) return { status: "cooldown" };
        running = true;
        lastRun = now();
        const result = { status: "completed", archived: 0, releasedBytes: 0, skipped: 0, failed: 0, diskLimited: false, failureCodes: {}, driveVerified: 0 };
        try {
            const temp = await fs.realpath(tempRoot);
            const archive = path.resolve(archiveRoot);
            if (contains(temp, archive) || archive === temp || temp !== path.resolve(tempRoot)) throw new Error("unsafe_archive_root");
            await fs.mkdir(archive, { recursive: true, mode: 0o700 });
            if ((await fs.realpath(archive)) !== archive || (process.getuid && (await fs.stat(archive)).uid !== process.getuid())) throw new Error("unsafe_archive_root");
            await fs.chmod(archive, 0o700);
            await syncDirectory(path.dirname(archive));
            const disk = await fs.statfs(archive);
            if (Number(disk.type) === 0x01021994 || Number(disk.type) === 0x858458f6) throw new Error("archive_must_use_disk");
            const runId = `${new Date(now()).toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
            const destination = path.join(archive, runId);
            const uid = process.getuid?.();
            const deadline = now() + 60000;
            for (const name of (await fs.readdir(temp)).sort()) {
                if (!LEGACY_BUILD.test(name)) continue;
                if (now() >= deadline) { result.skipped++; break; }
                const source = path.join(temp, name);
                let candidate;
                try {
                    const rootStat = await fs.lstat(source);
                    candidate = await inventory(source, uid, maxBytes - result.releasedBytes);
                    if (!candidate.files.length || Math.max(rootStat.mtimeMs, ...candidate.files.map(f => f.mtimeMs)) > now() - minimumAgeMs) {
                        result.skipped++; continue;
                    }
                    if (await inUse(source)) { result.skipped++; continue; }
                    const capacity = await fs.statfs(archive);
                    if (Number(capacity.bavail) * Number(capacity.bsize) < candidate.bytes + reserveBytes) {
                        result.skipped++; result.diskLimited = true; continue;
                    }
                    await fs.mkdir(destination, { recursive: true, mode: 0o700 });
                    const targetRoot = path.join(destination, name);
                    const manifest = [];
                    for (const dir of candidate.directories) await fs.mkdir(path.join(targetRoot, dir), { recursive: true, mode: 0o700 });
                    for (const item of candidate.files) {
                        const original = item.relative ? path.join(source, item.relative) : source;
                        const saved = item.relative ? path.join(targetRoot, item.relative) : targetRoot;
                        if (signature(await fs.lstat(original)) !== item.signature) throw new Error("source_changed");
                        await fs.copyFile(original, saved, constants.COPYFILE_EXCL);
                        await fs.chmod(saved, 0o600);
                        const copiedHash = await hash(saved);
                        if (copiedHash !== await hash(original) || signature(await fs.lstat(original)) !== item.signature) throw new Error("copy_verification_failed");
                        const handle = await fs.open(saved, "r+");
                        try { await handle.sync(); } finally { await handle.close(); }
                        manifest.push({ path: item.relative || name, bytes: item.size, sha256: copiedHash });
                    }
                    const current = await inventory(source, uid, maxBytes);
                    if (JSON.stringify(candidate) !== JSON.stringify(current)) throw new Error("source_changed");
                    if (await inUse(source)) throw new Error("source_in_use");
                    await durableWrite(`${targetRoot}.manifest.json`, `${JSON.stringify({ source, createdAt: new Date(now()).toISOString(), files: manifest }, null, 2)}\n`);
                    for (const dir of [...candidate.directories].reverse()) await syncDirectory(path.join(targetRoot, dir));
                    await syncDirectory(destination);
                    await syncDirectory(archive);
                    const receipt = await upload(targetRoot, { kind: "server-relief", companions: [`${targetRoot}.manifest.json`] });
                    if (!receipt?.verified) throw new Error("backup_drive_verification_failed");
                    result.driveVerified++;
                    const afterUpload = await inventory(source, uid, maxBytes);
                    if (JSON.stringify(candidate) !== JSON.stringify(afterUpload) || await inUse(source)) throw new Error("source_changed");
                    // Only verified, unchanged individual files may leave tmpfs. Unknown files are never recursively removed.
                    for (const item of candidate.files) {
                        const original = item.relative ? path.join(source, item.relative) : source;
                        if (signature(await fs.lstat(original)) !== item.signature) throw new Error("source_changed");
                        await fs.unlink(original);
                        result.releasedBytes += item.size;
                    }
                    for (const dir of [...candidate.directories].reverse()) await fs.rmdir(path.join(source, dir));
                    result.archived++;
                } catch (error) {
                    result.failed++;
                    const reason = /^[A-Z][A-Z0-9_]+$/.test(error.code || "") ? error.code
                        : /^(?:backup_[a-z_]+|too_many_files|protected_entry|size_limit|unrecognized_entry|source_changed|source_in_use|copy_verification_failed)$/.test(error.code || error.message) ? (error.code || error.message) : "io_error";
                    result.failureCodes[reason] = (result.failureCodes[reason] || 0) + 1;
                    // Keep both the original and any partial archive for inspection/recovery.
                }
            }
            if (result.archived || result.releasedBytes) result.archiveId = runId;
            return result;
        } finally { running = false; }
    };
}

const relieveServer = createServerRelief();

module.exports = { relieveServer, createServerRelief };
