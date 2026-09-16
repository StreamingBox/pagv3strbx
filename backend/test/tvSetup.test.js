const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const routeSource = fs.readFileSync(path.join(__dirname, "../src/routes/tvSetup.js"), "utf8");

test("TV setup validates an eight-digit code and an active Netflix subscription", () => {
    assert.match(routeSource, /router\.post\("\/tv-setup\/validate"/);
    assert.match(routeSource, /replace\(\/\\D\/g, ""\)/);
    assert.match(routeSource, /toCodeSlug\(subscription\.platformSlug\) !== "netflix"/);
    assert.match(routeSource, /subscription\.status.*active/);
    assert.match(routeSource, /isStoredDateOnlyExpired\(subscription\.expires_at\)/);
    assert.match(routeSource, /accountEmail: subscription\.accountEmail/);
});

test("TV setup delegates the login code to the existing Inicio counter", () => {
    assert.match(routeSource, /loginCodeAction: "code"/);
    assert.match(routeSource, /sharesLoginCodeCounter: true/);
    assert.match(routeSource, /\/codes\/netflix\/request/);
});

test("TV setup is available to authenticated users and protects ownership", () => {
    assert.match(routeSource, /router\.post\("\/tv-setup\/validate", requireAuth/);
    assert.match(routeSource, /Number\(subscription\.userId\) !== Number\(req\.user\?\.id\)/);
    assert.match(routeSource, /isAdmin\(req\.user\)/);
});
