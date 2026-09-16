require("dotenv").config();

const crypto = require("node:crypto");
const express = require("express");
const { chromium } = require("playwright");

const NETFLIX_TV_URL = "https://www.netflix.com/tv2";
const PORT = Number(process.env.TV_SETUP_WORKER_PORT || 4100);
const HOST = String(process.env.TV_SETUP_WORKER_HOST || "127.0.0.1").trim();
const SESSION_TTL_MS = Number(process.env.TV_SETUP_WORKER_SESSION_TTL_MS || 90000);
const activeSessions = new Map();

function normalizeDigits(value) {
    return String(value || "").replace(/\D/g, "");
}

function normalizeText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function result(status, message, extra = {}) {
    return { ok: false, status, message, ...extra };
}

function safeEmailDomain(value) {
    const email = String(value || "").trim().toLowerCase();
    const at = email.lastIndexOf("@");
    return at > 0 ? email.slice(at + 1) : "invalid";
}

function safePath(value) {
    try {
        return new URL(String(value || "")).pathname || "/";
    } catch {
        return "";
    }
}

function safeNetflixPath(value) {
    try {
        const url = new URL(String(value || ""));
        return /(^|\.)netflix\.com$/i.test(url.hostname) ? url.pathname || "/" : "";
    } catch {
        return "";
    }
}

function logStage(stage, details = {}) {
    const fields = Object.entries(details)
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(" ");
    console.log(`[netflix-tv-worker] stage=${stage}${fields ? ` ${fields}` : ""}`);
}

function authorized(req) {
    const expected = String(process.env.TV_SETUP_WORKER_TOKEN || "").trim();
    const received = String(req.get("x-tv-setup-token") || "").trim();
    if (!expected || !received) return false;
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);
    return expectedBuffer.length === receivedBuffer.length
        && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function detectPageFailure(text) {
    const normalized = normalizeText(text);
    if (/(captcha required|complete the captcha|completa el captcha|verify you are human|verifica que eres humano|i'?m not a robot|no soy un robot)/i.test(normalized)) {
        return result("captcha_required", "Netflix solicitó una verificación manual. No se puede omitir esa protección automáticamente.");
    }
    if (normalized.includes("ese codigo no es correcto")
        || normalized.includes("ese codigo no es valido")
        || normalized.includes("el codigo no es valido")
        || normalized.includes("el codigo ha caducado")
        || normalized.includes("codigo expirado")
        || normalized.includes("that code wasnt right")
        || normalized.includes("this code is invalid")
        || normalized.includes("code expired")) {
        return result("invalid_tv_code", "Netflix rechazó el código del TV. Verifica los 8 dígitos e inténtalo nuevamente.");
    }
    if (normalized.includes("no pudimos verificar") || normalized.includes("something went wrong")) {
        return result("netflix_flow_error", "Netflix no permitió continuar con la conexión del TV.");
    }
    if (normalized.includes("contrasena incorrecta")
        || normalized.includes("contrasena es incorrecta")
        || normalized.includes("correo o contrasena incorrectos")
        || normalized.includes("incorrect password")
        || normalized.includes("email or password incorrect")) {
        return result("account_password_rejected", "Netflix rechazó la contraseña almacenada para esta cuenta.");
    }
    if (normalized.includes("codigo incorrecto") || normalized.includes("codigo no valido")) {
        return result("login_code_rejected", "Netflix rechazó el código de Inicio recibido por correo.");
    }
    return null;
}

function isSuccessText(text) {
    const normalized = normalizeText(text);
    return [
        "tu tv esta lista para ver netflix",
        "your tv is ready for netflix",
        "ir a netflix",
        "go to netflix",
    ].some((needle) => normalized.includes(needle));
}

async function bodyText(page) {
    return String(await page.locator("body").innerText().catch(() => ""));
}

async function visibleControlSummary(page) {
    return page.locator("a,button").evaluateAll((elements) => elements
        .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && !element.disabled;
        })
        .slice(0, 20)
        .map((element) => ({
            tag: element.tagName.toLowerCase(),
            text: String(element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
            dataUia: element.getAttribute("data-uia") || "",
            type: element.getAttribute("type") || "",
        }))
        .filter((control) => control.text || control.dataUia));
}

async function visibleInputSummary(page) {
    return page.locator("input").evaluateAll((elements) => elements
        .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && !element.disabled && element.type !== "hidden";
        })
        .slice(0, 12)
        .map((element) => ({
            type: element.type || "",
            name: element.name || "",
            autocomplete: element.autocomplete || "",
            dataUia: element.getAttribute("data-uia") || "",
            maxLength: element.maxLength || 0,
        })));
}

async function waitForNavigationAfter(page, action) {
    const navigation = page
        .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 3000 })
        .catch(() => null);
    await action();
    await Promise.race([navigation, page.waitForTimeout(3000)]);
    await page.waitForTimeout(350);
}

async function submitTvCode(page, tvCode) {
    await page.goto(NETFLIX_TV_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForSelector("form[data-uia='witcher-code-form']", { state: "visible", timeout: 12000 });
    logStage("tv_page_loaded");
    const form = page.locator("form[data-uia='witcher-code-form']");
    const fields = form.locator("input[type='tel']");
    const fieldCount = await fields.count();
    if (fieldCount < tvCode.length) {
        logStage("tv_code_inputs_missing", { inputCount: fieldCount });
        return result("tv_code_input_missing", "Netflix no mostró los 8 campos para ingresar el código del TV.");
    }
    for (let index = 0; index < tvCode.length; index += 1) {
        const field = fields.nth(index);
        await field.click();
        await field.pressSequentially(tvCode[index]);
    }
    logStage("tv_code_typed", { inputCount: fieldCount });
    await page.waitForTimeout(350);
    const submit = await findVisibleInput(page, [
        "button[data-uia*='continue' i]",
        "button[type='submit']",
        "input[type='submit']",
    ]);
    if (!submit) {
        const failure = detectPageFailure(await bodyText(page));
        logStage("tv_code_continue_missing", { path: safePath(page.url()), detectedFailure: failure?.status });
        if (failure) return failure;
        return result("tv_code_submit_missing", "Netflix no mostró el botón para continuar con el código del TV.");
    }
    await page.waitForTimeout(300);
    if (!await submit.isEnabled().catch(() => false)) {
        logStage("tv_code_continue_disabled", { inputCount: fieldCount });
        return result("tv_code_submit_disabled", "Netflix no habilitó el botón. Verifica que el código del TV tenga 8 dígitos.");
    }
    await waitForNavigationAfter(page, () => submit.click());
    logStage("tv_code_submitted");
    const text = await bodyText(page);
    const failure = detectPageFailure(text);
    if (failure) {
        logStage("tv_code_rejected", { status: failure.status });
        return failure;
    }
    if (isSuccessText(text)) {
        logStage("tv_setup_completed", { path: safePath(page.url()) });
        return { ok: true, status: "completed", finalUrl: page.url() };
    }
    logStage("tv_step_advanced", { path: safePath(page.url()) });
    return null;
}

async function findVisibleInput(page, selectors) {
    for (const selector of selectors) {
        const matches = page.locator(selector);
        const count = await matches.count();
        for (let index = 0; index < count; index += 1) {
            const candidate = matches.nth(index);
            if (await candidate.isVisible().catch(() => false)) return candidate;
        }
    }
    return null;
}

async function findVisibleTextAction(page, labels) {
    const candidates = page.locator("a,button");
    const count = await candidates.count();
    for (let index = 0; index < count; index += 1) {
        const candidate = candidates.nth(index);
        if (!await candidate.isVisible().catch(() => false)) continue;
        const text = normalizeText(await candidate.innerText().catch(() => ""));
        if (labels.some((label) => text.includes(label))) return candidate;
    }
    return null;
}

async function submitAccountEmail(page, accountEmail, accountPassword) {
    const normalizedEmail = String(accountEmail || "").trim().toLowerCase();
    const emailInput = await findVisibleInput(page, [
        "input[type='email']",
        "input[name='email']",
        "input[name='emailAddress']",
        "input[autocomplete='email']",
        "input[data-uia*='email' i]",
    ]);
    if (!emailInput) {
        logStage("account_email_input_missing", { path: safePath(page.url()) });
        return result("email_input_missing", "Netflix no mostró el campo para ingresar el correo de la cuenta.");
    }
    await emailInput.click();
    await emailInput.press("ControlOrMeta+A");
    await emailInput.press("Backspace");
    await emailInput.pressSequentially(normalizedEmail, { delay: 25 });
    const filledEmail = String(await emailInput.inputValue().catch(() => "")).trim().toLowerCase();
    logStage("account_email_filled", {
        domain: safeEmailDomain(normalizedEmail),
        matches: filledEmail === normalizedEmail,
        valueLength: filledEmail.length,
    });
    const continueButton = await findVisibleInput(page, [
        "button[data-uia*='continue' i]",
        "button[type='submit']",
        "input[type='submit']",
    ]);
    if (!continueButton) {
        logStage("account_email_continue_missing", { path: safePath(page.url()) });
        return result("continue_button_missing", "Netflix no mostró el botón para continuar con el correo.");
    }
    const nonGetRequests = [];
    const responseRecords = [];
    const requestListener = (request) => {
        if (request.method() === "GET") return;
        const path = safeNetflixPath(request.url());
        if (path) nonGetRequests.push(`${request.method()} ${path}`);
    };
    const responseListener = (response) => {
        const request = response.request();
        if (request.method() === "GET") return;
        const path = safeNetflixPath(response.url());
        if (path) responseRecords.push({ response, method: request.method(), path });
    };
    page.on("request", requestListener);
    page.on("response", responseListener);
    try {
        await page.waitForTimeout(250);
        await emailInput.press("Tab");
        await page.waitForTimeout(250);
        await waitForNavigationAfter(page, () => continueButton.click());
    } finally {
        page.off("request", requestListener);
        page.off("response", responseListener);
    }
    const responseSummaries = [];
    for (const record of responseRecords) {
        const summary = {
            method: record.method,
            status: record.response.status(),
            path: record.path,
        };
        if (record.path === "/graphql") {
            const payload = await record.response.json().catch(() => null);
            summary.topLevelKeys = payload && typeof payload === "object" ? Object.keys(payload).slice(0, 8) : [];
            summary.errorCount = Array.isArray(payload?.errors) ? payload.errors.length : 0;
        }
        responseSummaries.push(summary);
    }
    logStage("account_email_submitted", {
        path: safePath(page.url()),
        nonGetRequestCount: nonGetRequests.length,
        requestPaths: [...new Set(nonGetRequests)].slice(0, 6),
        responseSummaries: responseSummaries.slice(0, 6),
    });
    const text = await bodyText(page);
    const normalizedText = normalizeText(text);
    logStage("account_email_state", {
        path: safePath(page.url()),
        hasLoginCodePrompt: /(?:ingresa el codigo.*(?:email|correo)|codigo.*(?:email|correo)|enviamos.*(?:email|correo)|enter.*code.*email|code.*sent.*email)/i.test(normalizedText),
        hasResendText: /(?:solicita el reenvio|reenviar codigo|resend code)/i.test(normalizedText),
        hasEmailInput: Boolean(await findVisibleInput(page, ["input[name='userLoginId']"])),
        hasPasswordInput: Boolean(await findVisibleInput(page, ["input[name='password']"])),
        hasConnectedNotice: normalizedText.includes("tu tv ahora esta conectada"),
        hasValidationError: /(?:correo.*incorrecto|email.*invalid|introduce.*correo|ingresa.*correo.*valido|something went wrong|no pudimos verificar)/i.test(normalizedText),
        visibleControls: await visibleControlSummary(page),
        visibleInputs: await visibleInputSummary(page),
    });
    const hasLoginCodePrompt = /(?:ingresa el codigo.*(?:email|correo)|codigo.*(?:email|correo)|enviamos.*(?:email|correo)|enter.*code.*email|code.*sent.*email)/i.test(normalizedText);
    const hasEmailInput = Boolean(await findVisibleInput(page, ["input[name='userLoginId']"]));
    const hasPasswordInput = Boolean(await findVisibleInput(page, ["input[name='password']"]));
    const hasValidationError = /(?:correo.*incorrecto|email.*invalid|introduce.*correo|ingresa.*correo.*valido|something went wrong|no pudimos verificar)/i.test(normalizedText);
    if (!hasLoginCodePrompt && hasEmailInput && hasPasswordInput && !hasValidationError) {
        let loginCodeAction = await findVisibleTextAction(page, [
            "usar un codigo de inicio",
            "usar codigo de inicio",
            "iniciar sesion con un codigo",
            "enviar enlace de inicio",
            "use a sign-in code",
            "use login code",
        ]);
        if (!loginCodeAction) {
            const helpAction = await findVisibleTextAction(page, ["obtener ayuda", "get help"]);
            if (helpAction) {
                logStage("account_email_help_opened", { path: safePath(page.url()) });
                await helpAction.click();
                await page.waitForTimeout(350);
                loginCodeAction = await findVisibleTextAction(page, [
                    "usar un codigo de inicio",
                    "usar codigo de inicio",
                    "iniciar sesion con un codigo",
                    "enviar enlace de inicio",
                    "use a sign-in code",
                    "use login code",
                ]);
            }
        }
        if (loginCodeAction) {
            logStage("account_email_code_action", { path: safePath(page.url()) });
            await waitForNavigationAfter(page, () => loginCodeAction.click());
            if (!await waitForLoginCodeScreen(page, 8000)) {
                logStage("email_flow_not_advanced", { path: safePath(page.url()) });
                return result("email_flow_not_advanced", "Netflix recibió el correo, pero no avanzó a la pantalla del código de Inicio.");
            }
            return null;
        }
        if (String(accountPassword || "")) return submitAccountPassword(page, accountPassword);
        logStage("password_required", { path: safePath(page.url()) });
        return result("password_required", "Netflix mostró el formulario de contraseña y no ofreció el código de Inicio para esta cuenta.");
    }
    const failure = detectPageFailure(text);
    if (failure) {
        logStage("account_email_rejected", { status: failure.status });
        return failure;
    }
    if (isSuccessText(text)) {
        logStage("tv_setup_completed", { path: safePath(page.url()) });
        return { ok: true, status: "completed", finalUrl: page.url() };
    }
    return null;
}

async function waitForLoginCodeScreen(page, timeout = 12000) {
    return page.waitForFunction(() => {
        const text = String(document.body?.innerText || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
        const inputs = Array.from(document.querySelectorAll("input")).filter((input) => {
            const rect = input.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && input.type !== "hidden" && !input.disabled;
        });
        return /code.*email|codigo.*correo|codigo.*email|enviamos.*correo|sent.*email/i.test(text)
            || inputs.filter((input) => input.maxLength === 1).length >= 4;
    }, { timeout }).then(() => true).catch(() => false);
}

async function submitAccountPassword(page, accountPassword) {
    const password = String(accountPassword || "");
    const passwordInput = await findVisibleInput(page, [
        "input[name='password']",
        "input[type='password']",
    ]);
    if (!passwordInput) {
        logStage("account_password_input_missing", { path: safePath(page.url()) });
        return result("password_input_missing", "Netflix pidió la contraseña, pero no mostró el campo para ingresarla.");
    }
    await passwordInput.click();
    await passwordInput.press("ControlOrMeta+A");
    await passwordInput.press("Backspace");
    await passwordInput.pressSequentially(password, { delay: 25 });
    const filledPassword = String(await passwordInput.inputValue().catch(() => ""));
    logStage("account_password_filled", {
        matches: filledPassword === password,
        valueLength: filledPassword.length,
    });
    const submit = await findVisibleInput(page, [
        "button[data-uia*='login' i]",
        "button[data-uia*='continue' i]",
        "button[type='submit']",
        "input[type='submit']",
    ]);
    if (!submit) {
        logStage("account_password_submit_missing", { path: safePath(page.url()) });
        return result("password_submit_missing", "Netflix no mostró el botón para continuar con la contraseña.");
    }
    await waitForNavigationAfter(page, () => submit.click());
    logStage("account_password_submitted", { path: safePath(page.url()) });
    const text = await bodyText(page);
    const failure = detectPageFailure(text);
    if (failure) return failure;
    if (isSuccessText(text)) {
        logStage("tv_setup_completed", { path: safePath(page.url()) });
        return { ok: true, status: "completed", finalUrl: page.url() };
    }
    if (await waitForLoginCodeScreen(page)) return null;
    const finalText = await bodyText(page);
    const finalFailure = detectPageFailure(finalText);
    if (finalFailure) return finalFailure;
    logStage("password_flow_not_advanced", { path: safePath(page.url()) });
    return result("password_flow_not_advanced", "Netflix no confirmó la conexión después de ingresar la contraseña.");
}

async function resendLoginCode(page) {
    const resend = await findVisibleTextAction(page, [
        "solicita el reenvio",
        "reenviar codigo",
        "resend code",
    ]);
    if (!resend) {
        logStage("login_code_resend_missing", { path: safePath(page.url()) });
        return result("resend_unavailable", "Netflix no mostró la opción para reenviar el código de Inicio.");
    }

    const nonGetRequests = [];
    const requestListener = (request) => {
        if (request.method() === "GET") return;
        const path = safeNetflixPath(request.url());
        if (path) nonGetRequests.push(`${request.method()} ${path}`);
    };
    page.on("request", requestListener);
    try {
        await waitForNavigationAfter(page, () => resend.click());
    } finally {
        page.off("request", requestListener);
    }
    await waitForLoginCodeScreen(page);
    const failure = detectPageFailure(await bodyText(page));
    if (failure) {
        logStage("login_code_resend_rejected", { status: failure.status });
        return failure;
    }
    logStage("login_code_resent", {
        path: safePath(page.url()),
        nonGetRequestCount: nonGetRequests.length,
        requestPaths: [...new Set(nonGetRequests)].slice(0, 6),
    });
    return { ok: true, status: "login_code_resent" };
}

async function visibleCodeInputs(page) {
    return page.locator("input").evaluateAll((elements) => elements
        .map((element, index) => {
            const rect = element.getBoundingClientRect();
            const value = [
                element.getAttribute("aria-label"),
                element.getAttribute("autocomplete"),
                element.getAttribute("data-uia"),
                element.getAttribute("name"),
                element.getAttribute("placeholder"),
            ].join(" ").toLowerCase();
            const maxLength = Number(element.getAttribute("maxlength") || 0);
            const visible = rect.width > 0 && rect.height > 0 && !element.disabled && element.type !== "hidden";
            const excluded = /(cookie|vendor|search|language|country|phone)/i.test(value);
            const relevant = maxLength === 1 || /one-time|otp|verification|codigo|code|pin|login/i.test(value) || element.type === "tel";
            return { index, visible, excluded, relevant, maxLength, value };
        })
        .filter((item) => item.visible && !item.excluded && item.relevant)
        .sort((a, b) => {
            const aScore = (a.maxLength === 1 ? 4 : 0) + (/code|codigo|otp|verification|pin/i.test(a.value) ? 3 : 0);
            const bScore = (b.maxLength === 1 ? 4 : 0) + (/code|codigo|otp|verification|pin/i.test(b.value) ? 3 : 0);
            return bScore - aScore || a.index - b.index;
        }));
}

async function fillLoginCode(page, loginCode) {
    const inputs = await visibleCodeInputs(page);
    const code = normalizeDigits(loginCode).slice(0, 4);
    if (code.length !== 4) return result("invalid_login_code", "El código de Inicio recibido no tiene 4 dígitos.");
    if (inputs.length < 1) return result("login_code_input_missing", "Netflix no mostró el campo para ingresar el código de Inicio.");
    const allInputs = page.locator("input");
    const separateFields = inputs.filter((input) => input.maxLength === 1).slice(0, 4);
    if (separateFields.length >= 4) {
        for (let position = 0; position < 4; position += 1) {
            const field = allInputs.nth(separateFields[position].index);
            await field.click();
            await field.pressSequentially(code[position]);
        }
    } else {
        const field = allInputs.nth(inputs[0].index);
        await field.click();
        await field.pressSequentially(code, { delay: 50 });
    }
    logStage("login_code_typed", { inputCount: separateFields.length >= 4 ? 4 : 1 });
    await page.waitForTimeout(900);
    return null;
}

async function clearBrowserState(context, page) {
    await context?.clearCookies().catch(() => {});
    await page?.evaluate(() => {
        try {
            window.localStorage.clear();
            window.sessionStorage.clear();
        } catch {
            // Some Netflix documents do not expose storage to the page.
        }
    }).catch(() => {});

    // A fresh incognito context already isolates the run, but clear the
    // Chromium cache too so retries cannot inherit a partial browser state.
    if (context && page) {
        const cdp = await context.newCDPSession(page).catch(() => null);
        if (cdp) {
            await cdp.send("Network.clearBrowserCache").catch(() => {});
            await cdp.send("Network.clearBrowserCookies").catch(() => {});
            await cdp.detach().catch(() => {});
        }
    }
    logStage("browser_state_cleared");
}

async function closeBrowserSession(session) {
    if (!session) return;
    await clearBrowserState(session.context, session.page);
    await session.page?.close().catch(() => {});
    await session.context?.close().catch(() => {});
    await session.browser?.close().catch(() => {});
}

async function closeSession(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session) return;
    activeSessions.delete(sessionId);
    clearTimeout(session.timer);
    await closeBrowserSession(session);
}

function scheduleSessionExpiry(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session) return;
    session.timer = setTimeout(() => { void closeSession(sessionId); }, SESSION_TTL_MS);
    session.timer.unref?.();
}

async function launchBrowser() {
    const launchOptions = {
        headless: String(process.env.NETFLIX_TV_SETUP_HEADLESS || "true").toLowerCase() !== "false",
    };
    if (process.env.NETFLIX_TV_SETUP_BROWSER_PATH) launchOptions.executablePath = process.env.NETFLIX_TV_SETUP_BROWSER_PATH;
    return chromium.launch(launchOptions);
}

async function startRun({ tvCode, accountEmail, accountPassword }) {
    const normalizedTvCode = normalizeDigits(tvCode);
    const email = String(accountEmail || "").trim();
    if (!/^\d{8}$/.test(normalizedTvCode)) return result("invalid_tv_code", "El código del TV debe tener 8 dígitos.");
    if (!email) return result("account_email_missing", "El pedido no tiene un correo de cuenta asignado.");

    let browser;
    let context;
    let page;
    let keepSession = false;
    try {
        browser = await launchBrowser();
        context = await browser.newContext({
            locale: "es-CO",
            timezoneId: "America/Bogota",
            viewport: { width: 1365, height: 900 },
        });
        page = await context.newPage();
        page.setDefaultTimeout(12000);
        const codeStep = await submitTvCode(page, normalizedTvCode);
        if (codeStep) return codeStep;
        const emailStep = await submitAccountEmail(page, email, accountPassword);
        if (emailStep) return emailStep;
        const loginCodeScreenDetected = await waitForLoginCodeScreen(page);
        const loginInputs = await visibleCodeInputs(page);
        const loginText = normalizeText(await bodyText(page));
        logStage("login_code_screen_checked", {
            inputCount: loginInputs.length,
            path: safePath(page.url()),
            detected: loginCodeScreenDetected,
            hasCodePrompt: /(?:ingresa el codigo.*(?:email|correo)|codigo.*(?:email|correo)|enviamos.*(?:email|correo)|enter.*code.*email|code.*sent.*email)/i.test(loginText),
            hasResendText: /(?:solicita el reenvio|reenviar codigo|resend code)/i.test(loginText),
        });
        if (!loginCodeScreenDetected) {
            const failure = detectPageFailure(loginText);
            return failure || result("login_code_screen_missing", "Netflix no confirmó la pantalla para ingresar el código de Inicio.");
        }
        if (loginInputs.length < 1) {
            const failure = detectPageFailure(await bodyText(page));
            return failure || result("login_code_input_missing", "Netflix no mostró el campo para ingresar el código de Inicio.");
        }
        const sessionId = crypto.randomUUID();
        activeSessions.set(sessionId, { browser, context, page, timer: null });
        scheduleSessionExpiry(sessionId);
        keepSession = true;
        browser = null;
        context = null;
        page = null;
        return { ok: true, status: "awaiting_login_code", sessionId };
    } catch (error) {
        const message = String(error?.message || error || "");
        if (/Executable doesn't exist|browserType\.launch|libatk|playwright.*browser/i.test(message)) {
            return result("browser_unavailable", "La automatización de Netflix no está disponible en el worker.");
        }
        if (/timeout|timed out/i.test(message)) return result("automation_timeout", "Netflix tardó demasiado en responder. Intenta nuevamente.");
        console.error("[netflix-tv-worker] start error", { message });
        return result("automation_error", "No fue posible iniciar la conexión automática con Netflix.");
    } finally {
        if (!keepSession) await closeBrowserSession({ browser, context, page });
    }
}

async function completeRun({ sessionId, loginCode }) {
    const normalizedSessionId = String(sessionId || "").trim();
    const session = activeSessions.get(normalizedSessionId);
    if (!session) return result("session_missing", "La sesión de Netflix venció. Inicia el proceso nuevamente.");
    try {
        const loginStep = await fillLoginCode(session.page, loginCode);
        if (loginStep) return loginStep;
        await session.page.waitForFunction(() => /tu tv esta lista para ver netflix|your tv is ready for netflix|ir a netflix|go to netflix/i.test(String(document.body?.innerText || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")), { timeout: 12000 }).catch(() => {});
        const finalText = await bodyText(session.page);
        const failure = detectPageFailure(finalText);
        if (failure) return failure;
        if (!isSuccessText(finalText)) return result("completion_not_confirmed", "Netflix no confirmó que el TV quedara conectado.");
        return { ok: true, status: "completed", finalUrl: session.page.url() };
    } catch (error) {
        const message = String(error?.message || error || "");
        if (/timeout|timed out/i.test(message)) return result("automation_timeout", "Netflix tardó demasiado en confirmar la conexión.");
        console.error("[netflix-tv-worker] complete error", { message });
        return result("automation_error", "No fue posible confirmar la conexión automática con Netflix.");
    } finally {
        await closeSession(normalizedSessionId);
    }
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.get("/health", (req, res) => res.json({
    ok: true,
    service: "netflix-tv-worker",
    activeSessions: activeSessions.size,
}));

app.use((req, res, next) => {
    if (!authorized(req)) return res.status(401).json({ ok: false, status: "unauthorized", message: "No autorizado." });
    return next();
});

app.post("/run/start", async (req, res) => {
    const flow = await startRun(req.body || {});
    return res.status(flow.ok ? 200 : 400).json(flow);
});

app.post("/run/resend", async (req, res) => {
    const sessionId = String(req.body?.sessionId || "").trim();
    const session = activeSessions.get(sessionId);
    if (!session) return res.status(400).json(result("session_missing", "La sesión de Netflix venció. Inicia el proceso nuevamente."));
    const flow = await resendLoginCode(session.page);
    return res.status(flow.ok ? 200 : 400).json(flow);
});

app.post("/run/complete", async (req, res) => {
    const flow = await completeRun(req.body || {});
    return res.status(flow.ok ? 200 : 400).json(flow);
});

app.post("/run/cancel", async (req, res) => {
    await closeSession(String(req.body?.sessionId || "").trim());
    return res.json({ ok: true, status: "cancelled" });
});

if (require.main === module) {
    app.listen(PORT, HOST, () => {
        console.log(`[netflix-tv-worker] listening on ${HOST}:${PORT}`);
    });
}

module.exports = {
    app,
    __test: { detectPageFailure, isSuccessText, normalizeDigits, resendLoginCode },
};
