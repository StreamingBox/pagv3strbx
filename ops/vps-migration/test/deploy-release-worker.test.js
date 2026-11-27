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
});

test("mixed active releases are validated and rolled back per service", () => {
    assert.match(deploy, /Run the deployment script staged for this release/);
    assert.ok(deploy.includes("cmp -s <(sed 's/\\r$//' \"$STAGE/deploy-release.sh\") <(sed 's/\\r$//' \"$RELEASE/ops/vps-migration/deploy-release.sh\")"));
    assert.match(deploy, /declare -A PREVIOUS_SHA OLD_OVERLAY/);
    assert.match(deploy, /PREVIOUS_SHA\[\$service\]=\$previous/);
    assert.match(deploy, /config --hash "\$service"/);
    assert.match(deploy, /Rollback image for \$service is missing/);
    assert.match(deploy, /for service in web api netflix-tv-worker; do/);
    assert.match(deploy, /up -d --no-deps --no-build --pull never "\$service"/);
    assert.match(deploy, /Previous per-service release set restored and healthy/);
    assert.doesNotMatch(deploy, /\[\[ \$WEB_IMAGE == "pagev3-migration-web:\$PREVIOUS" \]\]/);
});
