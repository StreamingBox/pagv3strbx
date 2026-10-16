const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const { __test } = require("../src/server");

const source = fs.readFileSync(require.resolve("../src/server"), "utf8");

test("worker detects Netflix success without treating the informational reCAPTCHA footer as a challenge", () => {
    assert.equal(__test.detectPageFailure("Esta página está protegida por Google reCAPTCHA para comprobar que no eres un robot."), null);
    assert.equal(__test.detectPageFailure("Verifica que eres humano para continuar.")?.status, "captcha_required");
    assert.equal(__test.detectPageFailure("El código no es válido.")?.status, "invalid_tv_code");
    assert.equal(__test.detectPageFailure("El código no es válido.", "login")?.status, "login_code_rejected");
    assert.equal(__test.isSuccessText("¡Tu TV está lista para ver Netflix!"), true);
});

test("worker normalizes the TV code to digits", () => {
    assert.equal(__test.normalizeDigits("9875-3269"), "98753269");
});

test("worker verifies the filled email and records the Netflix submit request safely", () => {
    assert.match(source, /const emailMatches = filledEmail === normalizedEmail/);
    assert.match(source, /if \(!emailMatches\)/);
    assert.match(source, /email_input_mismatch/);
    assert.match(source, /emailInput\.pressSequentially\(normalizedEmail,/);
    assert.match(source, /emailInput\.press\("ControlOrMeta\+A"\)/);
    assert.match(source, /emailInput\.press\("Backspace"\)/);
    assert.match(source, /continueButton\.click\(\)/);
    assert.match(source, /account_email_continue_clicked/);
    assert.doesNotMatch(source, /account_email_enter_fallback|emailInput\.press\("Enter"\)/);
    assert.match(source, /const normalizedLabels = labels\.map\(normalizeText\)/);
    assert.match(source, /nonGetRequestCount: nonGetRequests\.length/);
    assert.match(source, /requestPaths: \[\.\.\.new Set\(nonGetRequests\)\]/);
    assert.match(source, /responseSummaries: responseSummaries/);
    assert.match(source, /hasLoginCodePrompt/);
    assert.match(source, /findVisibleTextAction\(page, \[/);
    assert.match(source, /account_email_code_action/);
    assert.match(source, /\$\{stagePrefix\}_help_opened/);
    assert.match(source, /\$\{stagePrefix\}_help_already_open/);
    assert.match(source, /alreadyExpanded/);
    assert.match(source, /if \(!alreadyExpanded\) \{/);
    assert.match(source, /login_code_action_missing/);
    assert.match(source, /visibleActionSummary\(page\)/);
    assert.match(source, /\[role='menuitem'\]/);
    assert.match(source, /send a sign-in code/);
    assert.match(source, /waitForLoginCodeScreen\(page, 8000\)/);
    assert.match(source, /\}, undefined, \{ timeout \}\)/);
    assert.match(source, /NETFLIX_TV_URL = "https:\/\/www\.netflix\.com\/tv2"/);
    assert.match(source, /async function startRun\(\{ tvCode, accountEmail \}\)/);
    assert.doesNotMatch(source, /NETFLIX_LOGIN_URL/);
    const startRunSource = source.slice(source.indexOf("async function startRun"), source.indexOf("async function completeRun"));
    assert.ok(startRunSource.indexOf("const codeStep = await submitTvCode(page, normalizedTvCode)")
        < startRunSource.indexOf("const emailStep = await submitAccountEmail(page, email)"));
    assert.match(source, /findLoginCodeAction\(page, "account_email"\)/);
    assert.match(source, /account_email_code_action/);
    assert.match(source, /password_required/);
    assert.match(source, /login_code_waiting_for_tv_confirmation/);
    assert.match(source, /async function waitForTvCompletion\(page/);
    assert.match(source, /const tvCompleted = await waitForTvCompletion/);
    assert.doesNotMatch(source, /await submitTvCode\(session\.page/);
    assert.doesNotMatch(source, /submitAccountPassword|accountPassword|passwordInput\.fill/);
    assert.doesNotMatch(source, /account_password_submitted/);
    assert.match(source, /if \(!hasLoginCodePrompt && hasPasswordInput && !hasValidationError\)/);
    assert.match(source, /buildEmailDiagnostics/);
    assert.match(source, /key: "continue_clicked", state: continueClicked \? "completed"/);
    assert.equal(__test.detectPageFailure("La contraseña es incorrecta.")?.status, "account_password_rejected");
    assert.match(source, /email_flow_not_advanced/);
});

test("worker reports safe, ordered diagnostics without exposing the email or TV code", () => {
    assert.deepEqual(__test.buildEmailDiagnostics({
        emailMatches: true,
        continueClicked: true,
        hasLoginCodePrompt: false,
        hasPasswordInput: true,
        helpExpanded: true,
        loginCodeActionVisible: false,
    }), {
        steps: [
            { key: "tv_code_submitted", state: "completed" },
            { key: "account_email_filled", state: "completed" },
            { key: "continue_clicked", state: "completed" },
            { key: "login_code_screen", state: "not_detected" },
            { key: "password_form", state: "visible" },
            { key: "login_code_action", state: "missing" },
        ],
    });
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

test("worker closes its per-run isolated context without explicitly clearing its browser state", () => {
    assert.doesNotMatch(source, /Network\.clearBrowserCache/);
    assert.doesNotMatch(source, /Network\.clearBrowserCookies/);
    assert.doesNotMatch(source, /clearCookies\(\)/);
    assert.doesNotMatch(source, /window\.localStorage\.clear\(\)/);
    assert.doesNotMatch(source, /window\.sessionStorage\.clear\(\)/);
    assert.match(source, /activeSessions\.set\(sessionId, \{ browser, context, page, timer: null \}\)/);
    assert.match(source, /if \(!keepSession\) await closeBrowserSession\(\{ browser, context, page \}\)/);
});

test("TV setup submits the TV code before the provider sign-in code and never sends the password", () => {
    const setupService = fs.readFileSync(require.resolve("../../../backend/src/services/netflixTvSetupService"), "utf8");
    assert.doesNotMatch(setupService, /accountPassword/);
    assert.doesNotMatch(source, /accountPassword|passwordInput\.fill/);
    assert.match(setupService, /await requestLoginCode\(\)/);
    assert.match(source, /login_code_typed/);
    const startRunSource = source.slice(source.indexOf("async function startRun"), source.indexOf("async function completeRun"));
    assert.ok(startRunSource.indexOf("submitTvCode(page, normalizedTvCode)")
        < startRunSource.indexOf("submitAccountEmail(page, email)"));
    assert.match(source, /login_code_waiting_for_tv_confirmation/);
});
