const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const { __test } = require("../src/server");

const source = fs.readFileSync(require.resolve("../src/server"), "utf8");

test("worker detects Netflix success without treating the informational reCAPTCHA footer as a challenge", () => {
    assert.equal(__test.detectPageFailure("Esta página está protegida por Google reCAPTCHA para comprobar que no eres un robot."), null);
    assert.equal(__test.detectPageFailure("Verifica que eres humano para continuar.")?.status, "captcha_required");
    assert.equal(__test.detectPageFailure("El código no es válido.")?.status, "invalid_tv_code");
    assert.equal(__test.isSuccessText("¡Tu TV está lista para ver Netflix!"), true);
});

test("worker normalizes the TV code to digits", () => {
    assert.equal(__test.normalizeDigits("9875-3269"), "98753269");
});

test("worker verifies the filled email and records the Netflix submit request safely", () => {
    assert.match(source, /matches: filledEmail === normalizedEmail/);
    assert.match(source, /emailInput\.pressSequentially\(normalizedEmail,/);
    assert.match(source, /emailInput\.press\("ControlOrMeta\+A"\)/);
    assert.match(source, /emailInput\.press\("Backspace"\)/);
    assert.match(source, /emailInput\.press\("Tab"\)/);
    assert.match(source, /continueButton\.click\(\)/);
    assert.match(source, /nonGetRequestCount: nonGetRequests\.length/);
    assert.match(source, /requestPaths: \[\.\.\.new Set\(nonGetRequests\)\]/);
    assert.match(source, /responseSummaries: responseSummaries/);
    assert.match(source, /hasLoginCodePrompt/);
    assert.match(source, /findVisibleTextAction\(page, \[/);
    assert.match(source, /account_email_code_action/);
    assert.match(source, /account_email_help_opened/);
    assert.match(source, /password_required/);
    assert.match(source, /submitAccountPassword/);
    assert.match(source, /account_password_filled/);
    assert.match(source, /password_flow_not_advanced/);
    assert.equal(__test.detectPageFailure("La contraseña es incorrecta.")?.status, "account_password_rejected");
    assert.match(source, /email_flow_not_advanced/);
});

test("worker exposes the resend step used by Netflix when the PIN is not received", () => {
    assert.match(source, /async function resendLoginCode\(page\)/);
    assert.match(source, /solicita el reenvio/);
    assert.match(source, /status: "login_code_resent"/);
});

test("worker normalizes accented Spanish text before detecting the PIN screen", () => {
    assert.match(source, /normalize\("NFD"\)/);
    assert.match(source, /login_code_screen_missing/);
});

test("worker enters the TV code through the visible Netflix PIN fields", () => {
    assert.match(source, /input\[type='tel'\]/);
    assert.match(source, /field\.pressSequentially\(tvCode\[index\]\)/);
    assert.match(source, /tv_code_submit_disabled/);
    assert.match(source, /detectedFailure: failure\?\.status/);
});

test("worker enters the Netflix login code through keyboard events", () => {
    assert.match(source, /field\.pressSequentially\(code\[position\]\)/);
    assert.match(source, /field\.pressSequentially\(code, \{ delay: 50 \}\)/);
});

test("worker clears browser state and closes every failed or completed attempt", () => {
    assert.match(source, /context\.newCDPSession\(page\)/);
    assert.match(source, /Network\.clearBrowserCache/);
    assert.match(source, /Network\.clearBrowserCookies/);
    assert.match(source, /window\.localStorage\.clear\(\)/);
    assert.match(source, /window\.sessionStorage\.clear\(\)/);
    assert.match(source, /activeSessions\.set\(sessionId, \{ browser, context, page, timer: null \}\)/);
    assert.match(source, /if \(!keepSession\) await closeBrowserSession\(\{ browser, context, page \}\)/);
});
