import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const { uploadBackup } = createRequire(import.meta.url)("../../backend/src/services/backupDrive.service.js");

const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const normalize = (value) => value.includes(0) ? value : Buffer.from(value.toString("utf8").replace(/\r\n/g, "\n"));
const git = (root, args) => execFileSync("git", ["-C", root, ...args], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
const text = (root, args) => git(root, args).toString("utf8").trim();
function sourceStat(filename) {
    try {
        const stat = fs.lstatSync(filename);
        if (!stat.isFile()) throw new Error(`Source destination is not a regular file: ${filename}`);
        return stat;
    } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
}
const currentHash = (filename) => sourceStat(filename) ? digest(fs.readFileSync(filename)) : null;

function assertSourcePath(filename) {
    if (path.isAbsolute(filename) || filename.split("/").includes("..")
        || /(?:^|\/)(?:node_modules|releases|backups|storage|\.git|\.runtime|\.deploy-backups)(?:\/|$)/.test(filename)
        || /(?:^|\/)\.env(?:$|\.(?!example$))/.test(filename)
        || /\.(?:pem|key|tgz|gz|patch)$/.test(filename)) {
        throw new Error(`Refusing a protected or operational path: ${filename}`);
    }
}

function assertRepository(root, expectedHead) {
    if (text(root, ["branch", "--show-current"]) !== "main") throw new Error("The production checkout must be on main.");
    if (text(root, ["diff", "--cached", "--name-only"])) throw new Error("Preserve the staged changes before reconciling.");
    if (expectedHead && text(root, ["rev-parse", "HEAD"]) !== expectedHead) throw new Error("The checkout HEAD changed after the plan was created.");
}

function createPlan(rootDirectory, target, planPath) {
    const root = fs.realpathSync(rootDirectory);
    if (!/^[a-f0-9]{40}$/.test(target)) throw new Error("Use an exact 40-character target commit.");
    assertRepository(root);
    if (target !== text(root, ["rev-parse", "refs/remotes/origin/main"])) throw new Error("The target must equal the fetched origin/main.");
    const previousHead = text(root, ["rev-parse", "HEAD"]);
    git(root, ["merge-base", "--is-ancestor", previousHead, target]);
    const tree = git(root, ["ls-tree", "-rz", target]).toString("utf8").split("\0").filter(Boolean);
    const writes = [];
    for (const record of tree) {
        const [header, filename] = record.split("\t");
        if (path.isAbsolute(filename) || filename.split("/").includes("..")) throw new Error(`Invalid repository path: ${filename}`);
        const [mode, type, object] = header.split(" ");
        if (type !== "blob" || !["100644", "100755"].includes(mode)) throw new Error(`Unsupported source entry: ${filename}`);
        const destination = path.join(root, filename);
        const stat = sourceStat(destination);
        const desired = git(root, ["cat-file", "blob", object]);
        const modeMatches = process.platform === "win32" || !stat || Boolean(stat.mode & 0o111) === (mode === "100755");
        if (stat && modeMatches && digest(normalize(fs.readFileSync(destination))) === digest(normalize(desired))) continue;
        assertSourcePath(filename);
        writes.push({ path: filename, object, mode, before: currentHash(destination), after: digest(desired) });
    }
    const plan = { root, target, previousHead, createdAt: new Date().toISOString(), writes };
    fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ target, previousHead, writes: writes.map((item) => ({ path: item.path, action: item.before ? "update" : "create" })) }, null, 2));
}

async function applyPlan(planPath, backupDirectory, { upload = uploadBackup } = {}) {
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    assertRepository(plan.root, plan.previousHead);
    if (plan.target !== text(plan.root, ["rev-parse", "refs/remotes/origin/main"])) throw new Error("origin/main changed after review.");
    if (fs.existsSync(backupDirectory)) throw new Error("The backup destination already exists.");
    const backup = path.resolve(backupDirectory);
    const relative = path.relative(plan.root, backup);
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) throw new Error("The backup must be outside the checkout.");
    const objects = new Map();
    for (const item of plan.writes) {
        assertSourcePath(item.path);
        if (currentHash(path.join(plan.root, item.path)) !== item.before) throw new Error(`Source changed after review: ${item.path}`);
        const value = git(plan.root, ["cat-file", "blob", item.object]);
        if (digest(value) !== item.after) throw new Error(`Target object checksum mismatch: ${item.path}`);
        objects.set(item.path, value);
    }
    fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
    fs.chmodSync(backup, 0o700);
    fs.copyFileSync(planPath, path.join(backup, "plan.json"), fs.constants.COPYFILE_EXCL);
    const index = path.resolve(plan.root, text(plan.root, ["rev-parse", "--git-path", "index"]));
    fs.copyFileSync(index, path.join(backup, "index"), fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(path.join(backup, "tracked.patch"), git(plan.root, ["diff", "--binary", "HEAD"]), { mode: 0o600, flag: "wx" });
    git(plan.root, ["bundle", "create", path.join(backup, "history.bundle"), "--all"]);
    git(plan.root, ["bundle", "verify", path.join(backup, "history.bundle")]);
    for (const item of plan.writes) {
        if (!item.before) continue;
        const saved = path.join(backup, "files", item.path);
        fs.mkdirSync(path.dirname(saved), { recursive: true, mode: 0o700 });
        fs.copyFileSync(path.join(plan.root, item.path), saved, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(saved, 0o600);
        if (currentHash(saved) !== item.before) throw new Error(`Backup verification failed: ${item.path}`);
    }
    const receipt = await upload(backup, { kind: "source" });
    if (!receipt?.verified) throw new Error("Source backup is not verified in Drive; checkout preserved.");
    assertRepository(plan.root, plan.previousHead);
    if (plan.target !== text(plan.root, ["rev-parse", "refs/remotes/origin/main"])) throw new Error("origin/main changed during backup upload.");
    for (const item of plan.writes) {
        if (currentHash(path.join(plan.root, item.path)) !== item.before) throw new Error(`Source changed during backup upload: ${item.path}`);
    }
    for (const item of plan.writes) {
        const destination = path.join(plan.root, item.path);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        const temporary = `${destination}.align-${process.pid}.tmp`;
        fs.writeFileSync(temporary, objects.get(item.path), { flag: "wx", mode: item.mode === "100755" ? 0o755 : 0o644 });
        fs.chmodSync(temporary, item.mode === "100755" ? 0o755 : 0o644);
        fs.renameSync(temporary, destination);
    }
    git(plan.root, ["update-ref", `refs/heads/codex/archive-before-alignment-${Date.now()}`, plan.previousHead]);
    git(plan.root, ["config", "core.autocrlf", "input"]);
    git(plan.root, ["read-tree", plan.target]);
    git(plan.root, ["update-ref", "refs/heads/main", plan.target, plan.previousHead]);
    git(plan.root, ["diff", "--exit-code"]);
    git(plan.root, ["diff", "--cached", "--exit-code"]);
    const result = { commit: plan.target, updatedFiles: plan.writes.length, backup, driveTarget: receipt.driveTarget };
    console.log(JSON.stringify(result));
    return result;
}

export { createPlan, applyPlan };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const [mode, ...args] = process.argv.slice(2);
        if (mode === "plan" && args.length === 3) createPlan(...args);
        else if (mode === "apply" && args.length === 2) await applyPlan(...args);
        else throw new Error("Usage: node reconcile-checkout.mjs plan <checkout> <target-sha> <new-plan.json> | apply <reviewed-plan.json> <new-backup-directory>");
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
