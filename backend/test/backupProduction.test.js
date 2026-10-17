const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("deployment keeps data backups separate and requires Drive for rollback files", async () => {
    const script = await fs.readFile(path.join(__dirname, "../../scripts/deploy-on-ec2.sh"), "utf8");
    assert.ok(script.includes('bash scripts/backup-production.sh "$BACKUP_DIR/production"'));
    const upload = script.indexOf('node backend/scripts/upload-backup-drive.js "$BACKUP_DIR" deployment');
    assert.ok(upload > script.indexOf('if [ "${SKIP_DB_BACKUP:-false}"'));
    assert.ok(upload < script.indexOf('echo ">>> updating source"'));
    assert.ok(script.includes('randomUUID()'));
});

test("manual production backup requires Drive and preserves local files on failure", { skip: process.platform !== "linux" }, async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "backup-production-test-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    for (const dir of ["scripts", "backend/scripts", "frontend/public/platform-logos", "bin"]) await fs.mkdir(path.join(root, dir), { recursive: true });
    await fs.copyFile(path.join(__dirname, "../../scripts/backup-production.sh"), path.join(root, "scripts/backup-production.sh"));
    await fs.writeFile(path.join(root, "frontend/public/platform-logos/fictional.txt"), "fictional asset");
    const node = path.join(root, "bin/node");
    await fs.writeFile(node, `#!${process.execPath}
const fs=require('node:fs');const zlib=require('node:zlib');const cp=require('node:child_process');
const [script,...args]=process.argv.slice(2);
if(script==='-e'){const r=cp.spawnSync(process.execPath,[script,...args],{stdio:'inherit'});process.exit(r.status);}
if(script.endsWith('backup-database.js')){fs.writeFileSync(args[0],zlib.gzipSync('fictional database'),{flag:'wx',mode:0o600});}
else if(script.endsWith('upload-backup-drive.js')){if(process.env.TEST_DRIVE_FAIL==='1')process.exit(1);console.log(JSON.stringify({verified:true,driveTarget:'gdrive:fictional-copy'}));}
else if(script.endsWith('notify-backup-telegram.js')){fs.writeFileSync(process.env.TEST_NOTIFY,'sent');}
else process.exit(2);
`, { mode: 0o755 });
    const env = { ...process.env, PATH: `${path.dirname(node)}:${process.env.PATH}`, TEST_NOTIFY: path.join(root, "notified") };
    const run = (destination, extra = {}) => spawnSync("bash", [path.join(root, "scripts/backup-production.sh"), destination], { env: { ...env, ...extra }, encoding: "utf8" });
    const success = path.join(root, "successful-copy");
    const completed = run(success);
    assert.equal(completed.status, 0, completed.stderr);
    assert.match(completed.stdout, /Production backup verified in Drive/);
    assert.equal(await fs.readFile(env.TEST_NOTIFY, "utf8"), "sent");
    const failed = path.join(root, "pending-copy");
    const pending = run(failed, { TEST_DRIVE_FAIL: "1", TEST_NOTIFY: path.join(root, "must-not-notify") });
    assert.notEqual(pending.status, 0);
    assert.doesNotMatch(pending.stdout, /Production backup verified in Drive/);
    assert.ok((await fs.stat(path.join(failed, "database.sql.gz"))).size > 0);
    assert.ok((await fs.stat(path.join(failed, "user-assets.tgz"))).size > 0);
    await assert.rejects(fs.stat(path.join(root, "must-not-notify")), { code: "ENOENT" });
    assert.notEqual(run(success).status, 0);
    assert.ok((await fs.stat(path.join(success, "database.sql.gz"))).size > 0);
});
