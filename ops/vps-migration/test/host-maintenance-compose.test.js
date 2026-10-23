const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const compose = fs.readFileSync(path.join(root, "compose.yaml"), "utf8");
const service = fs.readFileSync(path.join(root, "pagev3-host-maintenance.service"), "utf8");

test("API gets only the allowlisted maintenance socket, never Docker's host socket", () => {
    assert.match(compose, /\/run\/pagev3-maintenance:\/run\/pagev3-maintenance:ro/);
    assert.match(compose, /group_add:\s*\n\s+- "1000"/);
    assert.doesNotMatch(compose, /\/var\/run\/docker\.sock/);
    assert.match(service, /CapabilityBoundingSet=CAP_CHOWN/);
    assert.match(service, /RuntimeDirectoryPreserve=yes/);
    assert.match(service, /ProtectSystem=strict/);
    assert.match(service, /RestrictAddressFamilies=AF_UNIX/);
});
