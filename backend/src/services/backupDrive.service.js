const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createHash, randomUUID } = require("node:crypto");
const { Transform, Writable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const digest = value => createHash("sha256").update(value).digest("hex");
const failure = code => Object.assign(new Error(code), { code });

function completion(child, code) {
    child.stderr?.resume();
    const done = new Promise((resolve, reject) => {
        child.once("error", () => reject(failure(code)));
        child.once("close", status => status === 0 ? resolve() : reject(failure(code)));
    });
    done.catch(() => {});
    return done;
}

function archiveFiles(root, entries) {
    const child = spawn("tar", ["--format=gnu", "-cf", "-", "-C", root, "--", ...entries], {
        stdio: ["ignore", "pipe", "pipe"], timeout: 15 * 60 * 1000,
    });
    return { stream: child.stdout, done: completion(child, "backup_archive_failed"), stop: () => child.kill() };
}

function createRcloneTransport(env = process.env) {
    const home = env.BACKUP_RCLONE_HOME || "/home/ubuntu";
    const binary = env.RCLONE_BIN || path.join(home, ".local/bin/rclone");
    const user = env.BACKUP_RCLONE_USER || "ubuntu";
    if (!path.isAbsolute(binary) || !path.isAbsolute(home) || !/^[a-z_][a-z0-9_-]*$/i.test(user)) throw failure("backup_drive_configuration_invalid");
    function start(args) {
        if (process.platform !== "linux") throw failure("backup_drive_requires_linux");
        const root = process.getuid() === 0;
        return spawn(root ? "/usr/sbin/runuser" : binary, root ? ["-u", user, "--", "/usr/bin/env", `HOME=${home}`, binary, ...args] : args, {
            stdio: ["pipe", "pipe", "pipe"], timeout: 15 * 60 * 1000,
        });
    }
    return {
        async upload(target, input, onChunk) {
            const child = start(["rcat", target, "--drive-chunk-size", "8M", "--buffer-size", "1M", "--streaming-upload-cutoff", "64K"]);
            child.stdout.resume();
            const done = completion(child, "backup_drive_upload_failed");
            const observer = new Transform({ transform(chunk, encoding, callback) { onChunk(chunk); callback(null, chunk); } });
            try { await Promise.all([pipeline(input, observer, child.stdin), done]); }
            catch { child.kill(); throw failure("backup_drive_upload_failed"); }
        },
        async download(target, onChunk) {
            const child = start(["cat", target, "--buffer-size", "1M"]);
            child.stdin.end();
            const done = completion(child, "backup_drive_download_failed");
            const sink = new Writable({ write(chunk, encoding, callback) { onChunk(chunk); callback(); } });
            try { await Promise.all([pipeline(child.stdout, sink), done]); }
            catch { child.kill(); throw failure("backup_drive_download_failed"); }
        },
    };
}

async function snapshot(root, entries) {
    const files = [];
    async function visit(filename, relative) {
        if (files.length >= 30000) throw failure("backup_too_many_entries");
        const stat = await fs.lstat(filename);
        const item = { path: relative, size: stat.size, modified: stat.mtimeMs, mode: stat.mode };
        if (stat.isSymbolicLink()) item.link = await fs.readlink(filename);
        else if (!stat.isFile() && !stat.isDirectory()) throw failure("backup_special_file");
        files.push(item);
        if (stat.isDirectory()) for (const name of (await fs.readdir(filename)).sort()) await visit(path.join(filename, name), `${relative}/${name}`);
    }
    for (const name of entries) await visit(path.join(root, name), name);
    return digest(JSON.stringify(files));
}

function createBackupDrive({
    env = process.env,
    receiptsRoot = path.join(env.BACKUP_RCLONE_HOME || "/home/ubuntu", ".strbx-drive-receipts"),
    driveRoot = env.BACKUP_DRIVE_ROOT || "gdrive:StreamingBoxBackups/production",
    transport,
    archiveFactory = archiveFiles,
} = {}) {
    if (!/^gdrive:[^\r\n]+$/.test(driveRoot)) throw failure("backup_drive_configuration_invalid");
    let owner;
    async function prepareReceipts() {
        const root = path.resolve(receiptsRoot);
        await fs.mkdir(root, { recursive: true, mode: 0o700 });
        if (await fs.realpath(root) !== root) throw failure("backup_receipts_symlink");
        if (process.getuid?.() === 0) {
            owner = await fs.stat(env.BACKUP_RCLONE_HOME || "/home/ubuntu");
            await fs.chown(root, owner.uid, owner.gid);
        }
        await fs.chmod(root, 0o700);
        return root;
    }
    async function writeRecord(filename, record) {
        const handle = await fs.open(filename, "wx", 0o600);
        try {
            await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`);
            await handle.sync();
            if (owner) await handle.chown(owner.uid, owner.gid);
        } finally { await handle.close(); }
    }
    async function readRecord(filename) {
        try { return JSON.parse(await fs.readFile(filename, "utf8")); }
        catch (error) { if (error.code === "ENOENT") return null; throw error; }
    }
    async function uploadBackup(source, { kind = "manual", companions = [] } = {}) {
        if (!/^[a-z][a-z0-9-]{0,39}$/.test(kind)) throw failure("backup_kind_invalid");
        const absolute = path.resolve(source);
        if ((await fs.lstat(absolute)).isSymbolicLink()) throw failure("backup_source_symlink");
        const root = path.dirname(absolute);
        const entries = [absolute, ...companions.map(p => path.resolve(p))].map(filename => {
            if (path.dirname(filename) !== root) throw failure("backup_companion_outside_root");
            return path.basename(filename);
        }).sort();
        const before = await snapshot(root, entries);
        const key = digest(JSON.stringify({ absolute, entries, kind, fingerprint: before }));
        const receipts = await prepareReceipts();
        const verifiedPath = path.join(receipts, `${key}.verified.json`);
        const existing = await readRecord(verifiedPath);
        if (existing?.verified === true && existing.fingerprint === before) return existing;
        const request = { source: absolute, companions, kind, fingerprint: before, createdAt: new Date().toISOString() };
        try { await writeRecord(path.join(receipts, `${key}.pending.json`), request); }
        catch (error) { if (error.code !== "EEXIST") throw error; }
        const name = path.basename(absolute).replace(/[^a-z0-9_.-]/gi, "_").slice(0, 100) || "backup";
        const target = `${driveRoot.replace(/\/+$/, "")}/${kind}/${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}-${name}.tar`;
        const remote = transport || createRcloneTransport(env);
        const archive = archiveFactory(root, entries);
        const localHash = createHash("sha256");
        let bytes = 0;
        try {
            await Promise.all([
                remote.upload(target, archive.stream, chunk => { localHash.update(chunk); bytes += chunk.length; }),
                archive.done,
            ]);
            if (before !== await snapshot(root, entries)) throw failure("backup_source_changed");
            const expectedHash = localHash.digest("hex");
            const downloadedHash = createHash("sha256");
            let downloadedBytes = 0;
            await remote.download(target, chunk => { downloadedHash.update(chunk); downloadedBytes += chunk.length; });
            if (downloadedBytes !== bytes || downloadedHash.digest("hex") !== expectedHash) throw failure("backup_drive_verification_failed");
            if (before !== await snapshot(root, entries)) throw failure("backup_source_changed");
            const receipt = { ...request, verified: true, driveTarget: target, bytes, sha256: expectedHash, verifiedAt: new Date().toISOString() };
            try { await writeRecord(verifiedPath, receipt); }
            catch (error) { if (error.code !== "EEXIST") throw error; }
            return receipt;
        } catch (error) {
            archive.stop();
            if (/^backup_[a-z_]+$/.test(error.code || "")) throw error;
            throw failure("backup_drive_failed");
        }
    }
    async function retryPending({ includeFailures = false } = {}) {
        const receipts = await prepareReceipts();
        const result = { verified: 0, failed: 0 };
        if (includeFailures) result.failedSources = [];
        for (const filename of (await fs.readdir(receipts)).filter(name => name.endsWith(".pending.json")).sort()) {
            if (await readRecord(path.join(receipts, filename.replace(/\.pending\.json$/, ".verified.json")))) continue;
            let item;
            try {
                item = await readRecord(path.join(receipts, filename));
                await uploadBackup(item.source, { kind: item.kind, companions: item.companions });
                result.verified++;
            } catch { result.failed++; if (includeFailures) result.failedSources.push(item?.source || filename); }
        }
        return result;
    }
    return { uploadBackup, retryPending };
}

const defaultDrive = createBackupDrive();
module.exports = { createBackupDrive, ...defaultDrive };
