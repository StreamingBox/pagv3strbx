const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const routeSource = fs.readFileSync(path.join(__dirname, "../src/routes/tvSetup.js"), "utf8");
const automationSource = fs.readFileSync(path.join(__dirname, "../src/services/netflixTvSetupService.js"), "utf8");
const workerSource = fs.readFileSync(path.join(__dirname, "../../worker/netflix-tv/src/server.js"), "utf8");
const { __test: automationTest } = require("../src/services/netflixTvSetupService");

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
    assert.match(routeSource, /requestCodeForOrder/);
    assert.match(routeSource, /message: "OK:code-tv-setup"/);
});

test("TV setup run accepts the formatted code returned by validation", () => {
    assert.match(routeSource, /if \(!\/\^\\d\{4\}-\\d\{4\}\$\/\.test\(tvCode\) \|\| !subscriptionId\)/);
});

test("TV setup delegates Netflix TV2 automation to the isolated worker", () => {
    assert.match(routeSource, /router\.post\("\/tv-setup\/run", requireAuth/);
    assert.match(automationSource, /https:\/\/www\.netflix\.com\/tv2/);
    assert.match(automationSource, /NETFLIX_TV_SETUP_WORKER_URL/);
    assert.match(automationSource, /\/run\/start/);
    assert.match(automationSource, /\/run\/complete/);
    assert.match(automationSource, /requestLoginCode/);
    assert.doesNotMatch(automationSource, /require\(["']playwright["']\)/);
    assert.match(workerSource, /https:\/\/www\.netflix\.com\/tv2/);
    assert.match(workerSource, /witcher-code-form/);
    assert.match(workerSource, /input\[type='email'\]/);
    assert.match(workerSource, /captcha_required/);
});

test("TV setup client maps worker errors without leaking credentials", () => {
    assert.equal(automationTest.normalizeTvCode("9875-3269"), "98753269");
    assert.equal(automationTest.workerBaseUrl(), "");
    assert.equal(automationTest.mapWorkerError({ response: { status: 401, data: {} } }, "worker_unavailable", "fallback").status, "worker_unauthorized");
});

test("TV setup is available to authenticated users and protects ownership", () => {
    assert.match(routeSource, /router\.post\("\/tv-setup\/validate", requireAuth/);
    assert.match(routeSource, /Number\(subscription\.userId\) !== Number\(req\.user\?\.id\)/);
    assert.match(routeSource, /isAdmin\(req\.user\)/);
});
