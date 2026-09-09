const axios = require("axios");
const cheerio = require("cheerio");
const { extractJeffProviderCode } = require("./jeffProviderCodeService");

const USER_AGENT = "StreamingBox-CodeService/1.0 (+https://strbx.com.co)";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const LOGIN_CODE_SUBJECT = /asunto\s*:\s*netflix\s*:\s*tu\s+c[oó]digo\s+de\s+inicio\s+de\s+sesi[oó]n\b/i;
const TEMPORARY_CODE_SUBJECT = /asunto\s*:\s*tu\s+c[oó]digo\s+de\s+acceso\s+temporal\s+de\s+netflix\b/i;

function providerError(status, message) {
    return { ok: false, status, message };
}

function safeText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function decodeCloudflareEmail(value) {
    const encoded = String(value || "").trim();
    if (!/^[0-9a-f]+$/i.test(encoded) || encoded.length < 4 || encoded.length % 2 !== 0) return "";

    const key = Number.parseInt(encoded.slice(0, 2), 16);
    if (!Number.isInteger(key)) return "";

    let decoded = "";
    for (let index = 2; index < encoded.length; index += 2) {
        const byte = Number.parseInt(encoded.slice(index, index + 2), 16);
        if (!Number.isInteger(byte)) return "";
        decoded += String.fromCharCode(byte ^ key);
    }

    return EMAIL_RE.test(decoded) ? normalizeEmail(decoded) : "";
}

function providerEndpoint(value, baseUrl) {
    const raw = String(value ?? "").trim();
    try {
        const base = new URL(String(baseUrl || ""));
        const resolved = /^https?:\/\//i.test(raw)
            ? new URL(raw)
            : new URL(raw.replace(/^\/+/, ""), `${base.toString().replace(/\/+$/, "")}/`);
        if (resolved.origin !== base.origin) return null;
        return resolved.toString();
    } catch {
        return null;
    }
}

function redirectEndpoint(value, currentUrl) {
    try {
        const current = new URL(currentUrl);
        const resolved = new URL(String(value || ""), current);
        return resolved.origin === current.origin ? resolved.toString() : null;
    } catch {
        return null;
    }
}

function updateCookies(jar, setCookie) {
    for (const rawCookie of Array.isArray(setCookie) ? setCookie : []) {
        const firstPart = String(rawCookie || "").split(";", 1)[0];
        const separator = firstPart.indexOf("=");
        if (separator <= 0) continue;
        jar.set(firstPart.slice(0, separator).trim(), firstPart.slice(separator + 1).trim());
    }
}

function serializeCookies(jar) {
    return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function isProviderTimeout(error) {
    const code = String(error?.code || "").toUpperCase();
    return ["ECONNABORTED", "ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(code)
        || /timeout|timed out/i.test(String(error?.message || ""));
}

async function requestWithCookies({ method, url, data, jar, timeoutMs, referer }) {
    let currentUrl = url;
    let currentMethod = method;
    let currentData = data;

    for (let redirects = 0; redirects <= 5; redirects += 1) {
        const headers = {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-CO,es;q=0.9,en;q=0.7",
            ...(referer ? { Referer: referer } : {}),
        };
        const cookieHeader = serializeCookies(jar);
        if (cookieHeader) headers.Cookie = cookieHeader;
        if (currentMethod === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";

        let response;
        try {
            response = await axios.request({
                method: currentMethod,
                url: currentUrl,
                data: currentData,
                headers,
                timeout: timeoutMs,
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400,
            });
        } catch (error) {
            const wrapped = new Error(isProviderTimeout(error)
                ? "El proveedor no respondió a tiempo."
                : "No fue posible conectar con el proveedor.");
            wrapped.code = isProviderTimeout(error) ? "provider_timeout" : "provider_unavailable";
            wrapped.causeCode = error?.code || null;
            throw wrapped;
        }

        updateCookies(jar, response.headers?.["set-cookie"]);
        if (!REDIRECT_STATUSES.has(response.status)) return { response, url: currentUrl };

        const nextUrl = redirectEndpoint(response.headers?.location, currentUrl);
        if (!nextUrl) throw new Error("El proveedor devolvió una redirección no permitida.");
        currentUrl = nextUrl;
        if (![307, 308].includes(response.status)) {
            currentMethod = "GET";
            currentData = undefined;
        }
    }

    throw new Error("El proveedor devolvió demasiadas redirecciones.");
}

function getCardContainer($, element) {
    let current = $(element);
    for (let depth = 0; depth < 8 && current.length; depth += 1) {
        const text = safeText(current.text());
        const paraCount = (text.match(/\bpara\s*:/gi) || []).length;
        const subjectCount = (text.match(/\basunto\s*:/gi) || []).length;
        if (paraCount === 1 && subjectCount === 1) return current;
        current = current.parent();
    }
    return $(element).parent();
}

function getCardText($, element) {
    return safeText(getCardContainer($, element).text());
}

function getRecipientEmail($, element, cardText) {
    const visibleRecipient = (cardText.split(/\bpara\s*:/i)[1] || "").match(EMAIL_RE)?.[0] || "";
    if (visibleRecipient) return normalizeEmail(visibleRecipient);

    const card = getCardContainer($, element);
    const recipientElement = card.find("[data-cfemail]").filter((index, candidate) => {
        let current = $(candidate);
        for (let depth = 0; depth < 3 && current.length; depth += 1) {
            const text = safeText(current.text());
            if (/\bpara\s*:/i.test(text) && !/\bde\s*:/i.test(text)) return true;
            current = current.parent();
        }
        return false;
    }).first();
    const decodedRecipient = decodeCloudflareEmail(recipientElement.attr("data-cfemail"));
    if (decodedRecipient) return decodedRecipient;

    const protectedEmails = card.find("[data-cfemail]")
        .map((index, candidate) => decodeCloudflareEmail($(candidate).attr("data-cfemail")))
        .get()
        .filter(Boolean);
    return protectedEmails.length >= 2 ? protectedEmails[1] : "";
}

function parseInboxLinks(html, targetEmail, maxMessages = 12, subjectPattern = LOGIN_CODE_SUBJECT) {
    const $ = cheerio.load(String(html || ""));
    const target = normalizeEmail(targetEmail);
    const links = $("a[href]")
        .map((index, element) => {
            const href = String($(element).attr("href") || "").trim();
            const idMatch = href.match(/^\/leer\/(\d+)$/);
            if (!idMatch) return null;
            const cardText = getCardText($, element);
            const recipient = getRecipientEmail($, element, cardText);
            return {
                href,
                id: Number(idMatch[1]),
                index,
                text: cardText,
                recipient,
            };
        })
        .get()
        .filter(Boolean)
        .filter((item, index, list) => list.findIndex((current) => current.href === item.href) === index)
        .filter((item) => subjectPattern.test(item.text) && item.recipient === target)
        .sort((a, b) => b.id - a.id || a.index - b.index);

    return links.slice(0, Math.max(Number(maxMessages) || 12, 1));
}

function hasLoginPage(html) {
    const $ = cheerio.load(String(html || ""));
    return Boolean($("input[name='username'], input[name='password']").length);
}

function extractLiveonixCode(html) {
    const $ = cheerio.load(String(html || ""));
    const text = safeText($("body").text() || $.text());
    if (!LOGIN_CODE_SUBJECT.test(text)) return "";
    const code = extractJeffProviderCode(String(html || ""));
    return /^\d{4}$/.test(code) ? code : "";
}

function extractTemporaryAction(html, currentUrl) {
    const $ = cheerio.load(String(html || ""));
    let selected = null;
    const actionText = /obtener\s+c[oó]digo\b/i;

    $("a[href], button, input[type='submit'], input[type='button']").each((_, element) => {
        if (selected) return;
        const text = safeText([
            $(element).text(),
            $(element).attr("value"),
            $(element).attr("aria-label"),
            $(element).attr("title"),
        ].filter(Boolean).join(" "));
        if (!actionText.test(text)) return;

        const href = String($(element).attr("href") || "").trim();
        if (href) {
            const url = redirectEndpoint(href, currentUrl);
            if (url) selected = { method: "GET", url };
            return;
        }

        const form = $(element).closest("form");
        if (!form.length) return;
        const action = redirectEndpoint(form.attr("action") || currentUrl, currentUrl);
        if (!action) return;
        const data = {};
        form.find("input, select, textarea").each((__, input) => {
            const name = String($(input).attr("name") || "").trim();
            if (!name || $(input).is(":disabled")) return;
            const type = String($(input).attr("type") || "").toLowerCase();
            if (["submit", "button", "reset", "file"].includes(type)) return;
            if (["checkbox", "radio"].includes(type) && !$(input).is(":checked")) return;
            data[name] = String($(input).attr("value") || $(input).text() || "");
        });
        selected = {
            method: String(form.attr("method") || "GET").toUpperCase() === "POST" ? "POST" : "GET",
            url: action,
            data,
        };
    });

    return selected;
}

function extractLiveonixTemporaryCode(html) {
    const $ = cheerio.load(String(html || ""));
    const text = safeText($("body").text() || $.text());
    if (!/(acceso\s+temporal|ver\s+netflix\s+en\s+tu\s+dispositivo|dispositivo\s+solicitante)/i.test(text)) return "";
    const code = extractJeffProviderCode(String(html || ""));
    return /^\d{4}$/.test(code) ? code : "";
}

async function fetchCodeFromLiveonixProvider({ email, config, action = "code" }) {
    if (!config?.enabled) {
        return providerError("provider_config_error", "El proveedor externo de códigos no está configurado.");
    }

    const jar = new Map();
    let stage = "login_page";

    try {
        const loginUrl = providerEndpoint(config.loginPath, config.baseUrl);
        const inboxUrl = providerEndpoint(config.inboxPath, config.baseUrl);
        if (!loginUrl || !inboxUrl) {
            return providerError("provider_config_error", "La configuración del proveedor no es válida.");
        }

        await requestWithCookies({
            method: "GET",
            url: loginUrl,
            jar,
            timeoutMs: config.timeoutMs,
        });

        stage = "login_submit";
        const inbox = await requestWithCookies({
            method: "POST",
            url: loginUrl,
            data: new URLSearchParams({
                username: String(config.username),
                password: String(config.password),
            }).toString(),
            jar,
            timeoutMs: config.timeoutMs,
            referer: loginUrl,
        });
        if (hasLoginPage(inbox.response.data)) {
            return providerError("provider_auth_error", "El proveedor rechazó la autenticación.");
        }

        stage = "inbox_page";
        const isTemporary = String(action || "code").trim().toLowerCase() === "temporary";
        const candidates = parseInboxLinks(
            inbox.response.data,
            email,
            config.maxMessages,
            isTemporary ? TEMPORARY_CODE_SUBJECT : LOGIN_CODE_SUBJECT
        );
        if (!candidates.length) {
            return providerError("provider_code_not_found", "No se encontró un código reciente para ese correo.");
        }

        for (const candidate of candidates) {
            stage = "message_page";
            const message = await requestWithCookies({
                method: "GET",
                url: providerEndpoint(candidate.href, config.baseUrl),
                jar,
                timeoutMs: config.timeoutMs,
                referer: inbox.url || inboxUrl,
            });
            let code = isTemporary ? extractLiveonixTemporaryCode(message.response.data) : extractLiveonixCode(message.response.data);
            if (isTemporary && !code) {
                const messageUrl = message.url || providerEndpoint(candidate.href, config.baseUrl);
                const temporaryAction = extractTemporaryAction(message.response.data, messageUrl);
                if (!temporaryAction) continue;

                stage = "temporary_code_page";
                const codePage = await requestWithCookies({
                    method: temporaryAction.method,
                    url: temporaryAction.url,
                    data: temporaryAction.method === "POST"
                        ? new URLSearchParams(temporaryAction.data || {}).toString()
                        : undefined,
                    jar,
                    timeoutMs: config.timeoutMs,
                    referer: messageUrl,
                });
                code = extractLiveonixTemporaryCode(codePage.response.data);
            }
            if (code) return { ok: true, type: "code", code, source: "liveonix_provider" };
        }

        return providerError("provider_code_not_found", "No se encontró un código reciente para ese correo.");
    } catch (error) {
        console.warn("[liveonixProvider] request failed", {
            stage,
            code: error?.code || "unknown",
            causeCode: error?.causeCode || null,
        });
        if (error?.code === "provider_timeout") {
            return providerError("provider_timeout", "La consulta al proveedor tardó demasiado. Intenta nuevamente.");
        }
        if (/redirecci[oó]n no permitida|demasiadas redirecciones/i.test(error?.message || "")) {
            return providerError("provider_layout_changed", "El flujo de navegación del proveedor cambió.");
        }
        return providerError("provider_unavailable", "No fue posible consultar el buzón del proveedor.");
    }
}

module.exports = {
    fetchCodeFromLiveonixProvider,
    __test: {
        parseInboxLinks,
        extractLiveonixCode,
        extractTemporaryAction,
        extractLiveonixTemporaryCode,
    },
};
