const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const routeSource = fs.readFileSync(path.join(__dirname, "../src/routes/tvSetup.js"), "utf8");
const automationSource = fs.readFileSync(path.join(__dirname, "../src/services/netflixTvSetupService.js"), "utf8");
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

test("TV setup automates Netflix TV2 without bypassing CAPTCHA", () => {
    assert.match(routeSource, /router\.post\("\/tv-setup\/run", requireAuth/);
    assert.match(automationSource, /https:\/\/www\.netflix\.com\/tv2/);
    assert.match(automationSource, /witcher-code-form/);
    assert.match(automationSource, /input\[name='email'\]/);
    assert.match(automationSource, /requestLoginCode/);
    assert.match(automationSource, /captcha_required/);
});

test("TV setup does not confuse Netflix's informational reCAPTCHA text with a challenge", () => {
    assert.equal(automationTest.detectPageFailure("Esta página está protegida por Google reCAPTCHA para comprobar que no eres un robot."), null);
    assert.equal(automationTest.detectPageFailure("Verifica que eres humano para continuar.")?.status, "captcha_required");
    assert.equal(automationTest.isSuccessText("¡Tu TV está lista para ver Netflix!"), true);
});

test("TV setup is available to authenticated users and protects ownership", () => {
    assert.match(routeSource, /router\.post\("\/tv-setup\/validate", requireAuth/);
    assert.match(routeSource, /Number\(subscription\.userId\) !== Number\(req\.user\?\.id\)/);
    assert.match(routeSource, /isAdmin\(req\.user\)/);
});
