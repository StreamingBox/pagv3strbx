const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const routeSource = fs.readFileSync(
    path.join(__dirname, "../src/routes/admin.support.js"),
    "utf8"
);

test("admin support subscription response exposes the current account data", () => {
    assert.match(routeSource, /a\.password/);
    assert.match(routeSource, /a\.two_factor_secret/);
    assert.match(routeSource, /a\.status AS account_status/);
    assert.match(routeSource, /accountExpiresAt: r\.account_expires_at/);
    assert.match(routeSource, /two_factor_secret: r\.two_factor_secret/);
});
