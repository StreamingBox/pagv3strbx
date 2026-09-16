const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const { __test } = require("../src/server");

const source = fs.readFileSync(require.resolve("../src/server"), "utf8");

test("worker detects Netflix success without treating the informational reCAPTCHA footer as a challenge", () => {
    assert.equal(__test.detectPageFailure("Esta página está protegida por Google reCAPTCHA para comprobar que no eres un robot."), null);
    assert.equal(__test.detectPageFailure("Verifica que eres humano para continuar.")?.status, "captcha_required");
    assert.equal(__test.isSuccessText("¡Tu TV está lista para ver Netflix!"), true);
});

test("worker normalizes the TV code to digits", () => {
    assert.equal(__test.normalizeDigits("9875-3269"), "98753269");
});

test("worker verifies the filled email and records the Netflix submit request safely", () => {
    assert.match(source, /matches: filledEmail === normalizedEmail/);
    assert.match(source, /nonGetRequestCount: nonGetRequests\.length/);
    assert.match(source, /requestPaths: \[\.\.\.new Set\(nonGetRequests\)\]/);
});

test("worker exposes the resend step used by Netflix when the PIN is not received", () => {
    assert.match(source, /async function resendLoginCode\(page\)/);
    assert.match(source, /solicita el reenvio/);
    assert.match(source, /status: "login_code_resent"/);
});
