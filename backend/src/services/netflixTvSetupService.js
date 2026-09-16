const { chromium } = require("playwright");

const NETFLIX_TV_URL = "https://www.netflix.com/tv2";

function normalizeDigits(value) {
    return String(value || "").replace(/\D/g, "");
}

function normalizeTvCode(value) {
    const digits = normalizeDigits(value);
    return digits.length === 8 ? digits : "";
}

function normalizeText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function envBool(name, fallback) {
    const raw = String(process.env[name] || "").trim().toLowerCase();
    if (!raw) return fallback;
    return ["1", "true", "yes", "on"].includes(raw);
}

function result(status, message, extra = {}) {
    return { ok: false, status, message, ...extra };
}

async function bodyText(page) {
    return String(await page.locator("body").innerText().catch(() => ""));
}

function detectPageFailure(text) {
    const normalized = normalizeText(text);
    if (/(captcha required|complete the captcha|completa el captcha|verify you are human|verifica que eres humano|i'?m not a robot|no soy un robot)/i.test(normalized)) {
        return result(
            "captcha_required",
            "Netflix solicitó una verificación manual. No se puede omitir esa protección automáticamente.",
        );
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

    // Netflix mantiene el valor real en campos ocultos. Enviar el formulario
    // nativo evita depender de la implementación cambiante de sus ocho inputs.
    await waitForNavigationAfter(page, () => page.locator("form[data-uia='witcher-code-form']").evaluate((form, code) => {
        const codeInput = form.querySelector("input[name='code']");
        const rendezvousInput = form.querySelector("input[name='tvLoginRendezvousCode']");
        if (!codeInput || !rendezvousInput) throw new Error("Netflix cambió el formulario del código TV.");
        codeInput.value = code;
        rendezvousInput.value = code;
        form.submit();
    }, tvCode));

    const text = await bodyText(page);
    const failure = detectPageFailure(text);
    if (failure) return failure;
    if (isSuccessText(text)) return { ok: true, status: "completed", finalUrl: page.url() };
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

async function submitAccountEmail(page, accountEmail) {
    const emailInput = await findVisibleInput(page, [
        "input[type='email']",
        "input[name='email']",
        "input[name='emailAddress']",
        "input[autocomplete='email']",
        "input[data-uia*='email' i]",
    ]);
    if (!emailInput) return result("email_input_missing", "Netflix no mostró el campo para ingresar el correo de la cuenta.");

    await emailInput.fill(accountEmail);
    const continueButton = await findVisibleInput(page, [
        "button[data-uia*='continue' i]",
        "button[type='submit']",
        "input[type='submit']",
    ]);
    if (!continueButton) return result("continue_button_missing", "Netflix no mostró el botón para continuar con el correo.");

    await waitForNavigationAfter(page, () => continueButton.click());
    const text = await bodyText(page);
    const failure = detectPageFailure(text);
    if (failure) return failure;
    if (isSuccessText(text)) return { ok: true, status: "completed", finalUrl: page.url() };
    return null;
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
            const relevant = maxLength === 1
                || /one-time|otp|verification|codigo|code|pin|login/i.test(value)
                || element.type === "tel";
            return { index, visible, excluded, relevant, maxLength, value };
        })
        .filter((item) => item.visible && !item.excluded && item.relevant)
        .sort((a, b) => {
            const aScore = (a.maxLength === 1 ? 4 : 0) + (/code|codigo|otp|verification|pin/i.test(a.value) ? 3 : 0);
            const bScore = (b.maxLength === 1 ? 4 : 0) + (/code|codigo|otp|verification|pin/i.test(b.value) ? 3 : 0);
            return bScore - aScore || a.index - b.index;
        }));
}

async function waitForLoginCodeScreen(page) {
    await page.waitForFunction(() => {
        const text = String(document.body?.innerText || "").toLowerCase();
        const inputs = Array.from(document.querySelectorAll("input")).filter((input) => {
            const rect = input.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && input.type !== "hidden" && !input.disabled;
        });
        return /code.*email|codigo.*correo|codigo.*email|enviamos.*correo|sent.*email/i.test(text) || inputs.filter((input) => input.maxLength === 1).length >= 4;
    }, { timeout: 12000 }).catch(() => {});
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
    if (submit && await submit.isEnabled().catch(() => false)) {
        await waitForNavigationAfter(page, () => submit.click());
    } else {
        await page.waitForTimeout(900);
    }

    const text = await bodyText(page);
    const failure = detectPageFailure(text);
    if (failure) return failure;
    if (isSuccessText(text)) return { ok: true, status: "completed", finalUrl: page.url() };
    return null;
}

async function runNetflixTvSetup({ tvCode, accountEmail, requestLoginCode }) {
    const normalizedTvCode = normalizeTvCode(tvCode);
    const email = String(accountEmail || "").trim();
    if (!normalizedTvCode) return result("invalid_tv_code", "El código del TV debe tener 8 dígitos.");
    if (!email) return result("account_email_missing", "El pedido no tiene un correo de cuenta asignado.");
    if (typeof requestLoginCode !== "function") return result("login_code_unavailable", "No fue posible preparar el código de Inicio.");

    let browser;
    try {
        const launchOptions = {
            headless: envBool("NETFLIX_TV_SETUP_HEADLESS", true),
        };
        if (process.env.NETFLIX_TV_SETUP_BROWSER_PATH) {
            launchOptions.executablePath = process.env.NETFLIX_TV_SETUP_BROWSER_PATH;
        }
        browser = await chromium.launch(launchOptions);
        const context = await browser.newContext({
            locale: "es-CO",
            timezoneId: "America/Bogota",
            viewport: { width: 1365, height: 900 },
        });
        const page = await context.newPage();
        page.setDefaultTimeout(12000);

        const codeStep = await submitTvCode(page, normalizedTvCode);
        if (codeStep) return codeStep;

        const emailStep = await submitAccountEmail(page, email);
        if (emailStep) return emailStep;

        await waitForLoginCodeScreen(page);
        const loginCodeResult = await requestLoginCode();
        if (!loginCodeResult?.ok || !loginCodeResult.code) {
            return result(
                loginCodeResult?.status || "login_code_unavailable",
                loginCodeResult?.message || "No se pudo consultar el código de Inicio de la cuenta.",
            );
        }

        const loginStep = await fillLoginCode(page, loginCodeResult.code);
        if (loginStep) return loginStep;

        await page.waitForFunction(() => /tu tv esta lista para ver netflix|your tv is ready for netflix|ir a netflix|go to netflix/i.test(String(document.body?.innerText || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")), { timeout: 12000 }).catch(() => {});
        const finalText = await bodyText(page);
        const failure = detectPageFailure(finalText);
        if (failure) return failure;
        if (!isSuccessText(finalText)) return result("completion_not_confirmed", "Netflix no confirmó que el TV quedara conectado.");
        return { ok: true, status: "completed", finalUrl: page.url() };
    } catch (error) {
        const message = String(error?.message || error || "");
        if (/Executable doesn't exist|browserType\.launch|playwright.*browser/i.test(message)) {
            return result("browser_unavailable", "La automatización de Netflix no está disponible en el servidor.");
        }
        if (/timeout|timed out/i.test(message)) {
            return result("automation_timeout", "Netflix tardó demasiado en responder. Intenta nuevamente.");
        }
        console.error("[netflixTvSetup] automation error", { message });
        return result("automation_error", "No fue posible completar automáticamente la conexión con Netflix.");
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

module.exports = {
    NETFLIX_TV_URL,
    runNetflixTvSetup,
    __test: {
        detectPageFailure,
        isSuccessText,
        normalizeTvCode,
    },
};
