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
    if (normalized.includes("ese codigo no es correcto") || normalized.includes("that code wasnt right")) {
        return result("invalid_tv_code", "Netflix rechazó el código del TV. Verifica los 8 dígitos e inténtalo nuevamente.");
    }
    if (normalized.includes("no pudimos verificar") || normalized.includes("something went wrong")) {
        return result("netflix_flow_error", "Netflix no permitió continuar con la conexión del TV.");
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
    await waitForNavigationAfter(page, () => page.locator("form[data-uia='witcher-code-form']").evaluate((form, code) => {
        const codeInput = form.querySelector("input[name='code']");
        const rendezvousInput = form.querySelector("input[name='tvLoginRendezvousCode']");
        if (!codeInput || !rendezvousInput) throw new Error("Netflix cambió el formulario del código TV.");
        codeInput.value = code;
        rendezvousInput.value = code;
        form.submit();
    }, tvCode));
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

async function submitAccountEmail(page, accountEmail) {
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
    await emailInput.fill(normalizedEmail);
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
    const requestListener = (request) => {
        if (request.method() === "GET") return;
        const path = safeNetflixPath(request.url());
        if (path) nonGetRequests.push(`${request.method()} ${path}`);
    };
    page.on("request", requestListener);
    try {
        await waitForNavigationAfter(page, () => continueButton.click());
    } finally {
        page.off("request", requestListener);
    }
    logStage("account_email_submitted", {
        path: safePath(page.url()),
        nonGetRequestCount: nonGetRequests.length,
        requestPaths: [...new Set(nonGetRequests)].slice(0, 6),
    });
    const text = await bodyText(page);
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

async function waitForLoginCodeScreen(page) {
    await page.waitForFunction(() => {
        const text = String(document.body?.innerText || "").toLowerCase();
        const inputs = Array.from(document.querySelectorAll("input")).filter((input) => {
            const rect = input.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && input.type !== "hidden" && !input.disabled;
        });
        return /code.*email|codigo.*correo|codigo.*email|enviamos.*correo|sent.*email/i.test(text)
            || inputs.filter((input) => input.maxLength === 1).length >= 4;
    }, { timeout: 12000 }).catch(() => {});
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
    await page.evaluate(({ code, inputIndexes }) => {
        const elements = Array.from(document.querySelectorAll("input"));
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        inputIndexes.slice(0, 4).forEach((index, position) => {
            const element = elements[index];
            if (!element) return;
            const value = inputIndexes.length === 1 ? code : code[position];
            setter?.call(element, value);
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
        });
    }, { code, inputIndexes: inputs.map((input) => input.index) });
    const submit = await findVisibleInput(page, [
        "button[data-uia*='continue' i]",
        "button[data-uia*='submit' i]",
        "button[type='submit']",
        "input[type='submit']",
    ]);
    if (submit && await submit.isEnabled().catch(() => false)) await waitForNavigationAfter(page, () => submit.click());
    else await page.waitForTimeout(900);
    return null;
}

async function closeSession(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session) return;
    activeSessions.delete(sessionId);
    clearTimeout(session.timer);
    await session.browser.close().catch(() => {});
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

async function startRun({ tvCode, accountEmail }) {
    const normalizedTvCode = normalizeDigits(tvCode);
    const email = String(accountEmail || "").trim();
    if (!/^\d{8}$/.test(normalizedTvCode)) return result("invalid_tv_code", "El código del TV debe tener 8 dígitos.");
    if (!email) return result("account_email_missing", "El pedido no tiene un correo de cuenta asignado.");

    let browser;
    try {
        browser = await launchBrowser();
        const context = await browser.newContext({
            locale: "es-CO",
            timezoneId: "America/Bogota",
            viewport: { width: 1365, height: 900 },
        });
        const page = await context.newPage();
        page.setDefaultTimeout(12000);
        const codeStep = await submitTvCode(page, normalizedTvCode);
        if (codeStep) {
            await browser.close().catch(() => {});
            return codeStep;
        }
        const emailStep = await submitAccountEmail(page, email);
        if (emailStep) {
            await browser.close().catch(() => {});
            return emailStep;
        }
        await waitForLoginCodeScreen(page);
        const loginInputs = await visibleCodeInputs(page);
        logStage("login_code_screen_checked", {
            inputCount: loginInputs.length,
            path: safePath(page.url()),
        });
        if (loginInputs.length < 1) {
            const failure = detectPageFailure(await bodyText(page));
            await browser.close().catch(() => {});
            return failure || result("login_code_input_missing", "Netflix no mostró el campo para ingresar el código de Inicio.");
        }
        const sessionId = crypto.randomUUID();
        activeSessions.set(sessionId, { browser, page, timer: null });
        scheduleSessionExpiry(sessionId);
        browser = null;
        return { ok: true, status: "awaiting_login_code", sessionId };
    } catch (error) {
        await browser?.close().catch(() => {});
        const message = String(error?.message || error || "");
        if (/Executable doesn't exist|browserType\.launch|libatk|playwright.*browser/i.test(message)) {
            return result("browser_unavailable", "La automatización de Netflix no está disponible en el worker.");
        }
        if (/timeout|timed out/i.test(message)) return result("automation_timeout", "Netflix tardó demasiado en responder. Intenta nuevamente.");
        console.error("[netflix-tv-worker] start error", { message });
        return result("automation_error", "No fue posible iniciar la conexión automática con Netflix.");
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
