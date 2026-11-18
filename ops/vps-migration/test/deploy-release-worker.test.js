const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const deploy = fs.readFileSync(path.join(root, "deploy-release.sh"), "utf8");
const overlay = fs.readFileSync(path.join(root, "compose.release-images.template.yaml"), "utf8");

test("versioned releases build, activate, health-check, and roll back the worker", () => {
    assert.match(overlay, /netflix-tv-worker:[\s\S]*?pagev3-migration-netflix-tv-worker:\$\{PAGEV3_RELEASE_SHA/);
    assert.match(deploy, /build api web netflix-tv-worker/);
    assert.match(deploy, /for service in api web netflix-tv-worker/);
    assert.match(deploy, /up -d --no-deps --no-build --pull never netflix-tv-worker/);
    assert.match(deploy, /wait_healthy pagev3-migration-netflix-tv-worker-1/);
    assert.match(deploy, /up -d --no-deps --no-build --pull never api web netflix-tv-worker/);
});
