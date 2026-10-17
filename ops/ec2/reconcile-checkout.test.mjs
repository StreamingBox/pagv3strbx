import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";

const script = fileURLToPath(new URL("./reconcile-checkout.mjs", import.meta.url));
const fixtures = [];
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function repository() {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "strbx-reconcile-test-"));
    fixtures.push(temporary);
    const root = path.join(temporary, "repository");
    fs.mkdirSync(root);
    git(root, "init", "--initial-branch=main");
    git(root, "config", "user.name", "Source alignment test");
    git(root, "config", "user.email", "test@example.test");
    git(root, "config", "core.autocrlf", "false");
    fs.writeFileSync(path.join(root, ".gitignore"), ".env\nprivate-backup/\n");
    fs.writeFileSync(path.join(root, "app.js"), "export const version = 1;\n");
    git(root, "add", "--", ".gitignore", "app.js");
    git(root, "commit", "-m", "initial source");
    const previous = git(root, "rev-parse", "HEAD");
    git(root, "switch", "-c", "target");
    fs.writeFileSync(path.join(root, "app.js"), "export const version = 2;\n");
    fs.writeFileSync(path.join(root, "new.js"), "export const added = true;\n");
    git(root, "add", "--", "app.js", "new.js");
    git(root, "commit", "-m", "reviewed target");
    const target = git(root, "rev-parse", "HEAD");
    git(root, "update-ref", "refs/remotes/origin/main", target);
    git(root, "switch", "main");
    return { temporary, root, previous, target, plan: path.join(temporary, "plan.json"), backup: path.join(temporary, "backup") };
}
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
afterEach(() => fixtures.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })));

test("archives local source and Git before aligning, preserving private files", () => {
    const fixture = repository();
    fs.writeFileSync(path.join(fixture.root, "app.js"), "// production-only edit\n");
    fs.writeFileSync(path.join(fixture.root, ".env"), "FICTIONAL_SECRET=test-only\n");
    assert.equal(run("plan", fixture.root, fixture.target, fixture.plan).status, 0);
    assert.equal(git(fixture.root, "rev-parse", "HEAD"), fixture.previous);
    const applied = run("apply", fixture.plan, fixture.backup);
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(git(fixture.root, "rev-parse", "HEAD"), fixture.target);
    assert.equal(git(fixture.root, "status", "--porcelain"), "");
    assert.equal(fs.readFileSync(path.join(fixture.backup, "files/app.js"), "utf8"), "// production-only edit\n");
    assert.equal(fs.readFileSync(path.join(fixture.root, ".env"), "utf8"), "FICTIONAL_SECRET=test-only\n");
    assert.equal(fs.existsSync(path.join(fixture.backup, "index")), true);
    git(fixture.root, "bundle", "verify", path.join(fixture.backup, "history.bundle"));
});

test("refuses concurrent source edits before making a backup or updating the checkout", () => {
    const fixture = repository();
    assert.equal(run("plan", fixture.root, fixture.target, fixture.plan).status, 0);
    fs.writeFileSync(path.join(fixture.root, "app.js"), "// a new user edit\n");
    const applied = run("apply", fixture.plan, fixture.backup);
    assert.notEqual(applied.status, 0);
    assert.match(applied.stderr, /Source changed after review/);
    assert.equal(git(fixture.root, "rev-parse", "HEAD"), fixture.previous);
    assert.equal(fs.existsSync(fixture.backup), false);
});
