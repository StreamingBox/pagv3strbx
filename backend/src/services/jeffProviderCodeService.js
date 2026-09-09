const axios = require("axios");
const cheerio = require("cheerio");

const USER_AGENT = "StreamingBox-CodeService/1.0 (+https://strbx.com.co)";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const CODE_CONTEXT = /(?:code|codigo|c[oó]digo|pin|otp|clave|verification|verificaci[oó]n)/i;
const CODE_VALUE = /(?:^|[^0-9])((?:[0-9][\s.\-]?){3,7}[0-9])(?:$|[^0-9])/g;

function safeText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function absoluteUrl(value, baseUrl) {
    try {
        const resolved = new URL(String(value || ""), baseUrl);
        const base = new URL(baseUrl);
        if (resolved.origin !== base.origin) return null;
        return resolved.toString();
    } catch {
        return null;
    }
}

// Provider paths are configured relative to the provider base (usually /v1).
// A leading slash must not discard that base path, as URL() normally does.
function providerEndpoint(value, baseUrl) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return absoluteUrl(raw, baseUrl);
    return absoluteUrl(raw.replace(/^\/+/, ""), `${String(baseUrl || "").replace(/\/+$/, "")}/`);
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

function formFields($, form) {
    const fields = {};
    $(form).find("input, select, textarea").each((_, input) => {
        const name = String($(input).attr("name") || "").trim();
        if (!name || $(input).is(":disabled") || $(input).attr("type") === "file") return;
        const type = String($(input).attr("type") || "").toLowerCase();
        if (["submit", "button", "reset"].includes(type)) return;
        if (["checkbox", "radio"].includes(type) && !$(input).is(":checked")) return;
        fields[name] = $(input).attr("value") || $(input).text() || "";
    });
    return fields;
}

function inputName($, form, pattern) {
    let found = "";
    $(form).find("input, textarea").each((_, input) => {
        if (found) return;
        const candidate = [$(input).attr("name"), $(input).attr("id"), $(input).attr("placeholder")]
            .filter(Boolean)
            .join(" ");
        if (pattern.test(candidate)) found = String($(input).attr("name") || "").trim();
    });
    return found;
}

function findLoginForm($) {
    let selected = null;
    $("form").each((_, form) => {
        if (selected) return;
        const password = inputName($, form, /password|clave|pass/i);
        const identity = inputName($, form, /phone|tel|celular|mobile|telefono|user|usuario|email|correo|login/i);
        if (password && identity) selected = { form, password, identity };
    });
    return selected;
}

function findSearchForm($) {
    let selected = null;
    $("form").each((_, form) => {
        if (selected) return;
        const email = inputName($, form, /email|e-mail|correo|mail|account|cuenta/i);
        if (email) selected = { form, email };
    });
    return selected;
}

function isProviderTimeout(error) {
    const code = String(error?.code || "").toUpperCase();
    return ["ECONNABORTED", "ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(code)
        || /timeout|timed out/i.test(String(error?.message || ""));
}

function looksLikeLoginPage(html) {
    const $ = cheerio.load(String(html || ""));
    return Boolean(findLoginForm($));
}

function extractCodeFromText(text, allowUnlabeled = false) {
    const value = String(text || "");
    let match;
    CODE_VALUE.lastIndex = 0;
    while ((match = CODE_VALUE.exec(value))) {
        const candidate = String(match[1] || "").replace(/[^0-9]/g, "");
        if (candidate.length < 4 || candidate.length > 8) continue;
        if (/^20[0-9]{2}$/.test(candidate) || /^\d{8}$/.test(candidate)) continue;
        if (!allowUnlabeled && !CODE_CONTEXT.test(value.slice(Math.max(0, match.index - 100), match.index + match[0].length + 100))) continue;
        return candidate;
    }
    return "";
}

function extractJeffProviderCode(html) {
    const $ = cheerio.load(String(html || ""));
    const prioritized = [];
    $("[id], [class], [aria-label], [data-code], [data-pin]").each((_, element) => {
        const marker = [
            $(element).attr("id"),
            $(element).attr("class"),
            $(element).attr("aria-label"),
            $(element).attr("data-code"),
            $(element).attr("data-pin"),
        ].filter(Boolean).join(" ");
        if (CODE_CONTEXT.test(marker)) {
            prioritized.push(safeText(
                $(element).text() ||
                $(element).attr("value") ||
                $(element).attr("data-code") ||
                $(element).attr("data-pin") ||
                $(element).attr("title") ||
                $(element).attr("aria-label")
            ));
        }
    });

    for (const text of prioritized) {
        const code = extractCodeFromText(text, true);
        if (code) return code;
    }

    const bodyText = safeText($("body").text() || $.text());
    return extractCodeFromText(bodyText, false);
}

async function requestWithCookies({ method, url, data, jar, timeoutMs, referer }) {
    let currentUrl = url;
    let currentMethod = method;
    let currentData = data;

    for (let redirects = 0; redirects <= 5; redirects += 1) {
        const headers = {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml",
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
            const timedOut = isProviderTimeout(error);
            const wrapped = new Error(timedOut
                ? "El proveedor no respondió a tiempo."
                : "No fue posible conectar con el proveedor.");
            wrapped.code = timedOut ? "provider_timeout" : "provider_unavailable";
            // Conservamos la causa técnica para el log interno sin incluir URL,
            // correo ni credenciales del proveedor en la respuesta pública.
            wrapped.causeCode = error?.code || null;
            throw wrapped;
        }

        updateCookies(jar, response.headers?.["set-cookie"]);
        if (!REDIRECT_STATUSES.has(response.status)) return { response, url: currentUrl };

        const nextUrl = absoluteUrl(response.headers?.location, currentUrl);
        if (!nextUrl) throw new Error("El proveedor devolvió una redirección no permitida.");
        currentUrl = nextUrl;
        if (![307, 308].includes(response.status)) {
            currentMethod = "GET";
            currentData = undefined;
        }
    }

    throw new Error("El proveedor devolvió demasiadas redirecciones.");
}

async function requestWithCookiesRetry(options, { attempts = 2, delayMs = 500 } = {}) {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await requestWithCookies(options);
        } catch (error) {
            lastError = error;
            if (error?.code !== "provider_timeout" || attempt >= attempts) throw error;
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    throw lastError;
}

function providerError(status, message) {
    return { ok: false, status, message };
}

async function fetchCodeFromJeffProvider({ email, config }) {
    if (!config?.enabled) return providerError("provider_config_error", "El proveedor externo no está configurado para esta plataforma.");

    const loginUrl = providerEndpoint(config.loginPath, config.baseUrl);
    const inboxUrl = providerEndpoint(config.inboxPath, config.baseUrl);
    if (!loginUrl || !inboxUrl) return providerError("provider_config_error", "La configuración del proveedor externo no es válida.");

    const jar = new Map();
    let stage = "login_page";
    try {
        const loginPage = await requestWithCookies({ method: "GET", url: loginUrl, jar, timeoutMs: config.timeoutMs });
        const $login = cheerio.load(String(loginPage.response.data || ""));
        const loginForm = findLoginForm($login);
        if (!loginForm) return providerError("provider_layout_changed", "No se encontró el formulario de acceso del proveedor.");

        const action = absoluteUrl($login(loginForm.form).attr("action") || loginUrl, loginUrl);
        if (!action) return providerError("provider_layout_changed", "El formulario de acceso del proveedor cambió.");
        const values = formFields($login, loginForm.form);
        values[loginForm.identity] = config.username;
        values[loginForm.password] = config.password;
        stage = "login_submit";
        const loggedIn = await requestWithCookies({
            method: "POST",
            url: action,
            data: new URLSearchParams(values).toString(),
            jar,
            timeoutMs: config.timeoutMs,
            referer: loginUrl,
        });
        if (looksLikeLoginPage(loggedIn.response.data)) return providerError("provider_auth_error", "El proveedor rechazó la autenticación.");

        stage = "inbox_page";
        const inbox = await requestWithCookies({ method: "GET", url: inboxUrl, jar, timeoutMs: config.timeoutMs, referer: loggedIn.url });
        const $inbox = cheerio.load(String(inbox.response.data || ""));
        if (looksLikeLoginPage(inbox.response.data)) return providerError("provider_auth_error", "La sesión del proveedor no quedó activa.");

        const searchForm = findSearchForm($inbox);
        let result = inbox;
        if (searchForm) {
            const actionUrl = absoluteUrl($inbox(searchForm.form).attr("action") || inboxUrl, inboxUrl);
            if (!actionUrl) return providerError("provider_layout_changed", "El formulario de búsqueda del proveedor cambió.");
            const values = formFields($inbox, searchForm.form);
            values[searchForm.email] = String(email || "").trim();
            const method = String($inbox(searchForm.form).attr("method") || "GET").toUpperCase();
            stage = "email_search";
            if (method === "GET") {
                const query = new URLSearchParams(values).toString();
                result = await requestWithCookiesRetry({
                    method: "GET",
                    url: `${actionUrl}${actionUrl.includes("?") ? "&" : "?"}${query}`,
                    jar,
                    timeoutMs: config.timeoutMs,
                    referer: inbox.url,
                });
            } else {
                result = await requestWithCookiesRetry({
                    method: "POST",
                    url: actionUrl,
                    data: new URLSearchParams(values).toString(),
                    jar,
                    timeoutMs: config.timeoutMs,
                    referer: inbox.url,
                });
            }
        } else if (config.searchPath) {
            const searchUrl = providerEndpoint(config.searchPath, config.baseUrl);
            if (!searchUrl) return providerError("provider_config_error", "La ruta de búsqueda del proveedor no es válida.");
            const separator = searchUrl.includes("?") ? "&" : "?";
            stage = "email_search";
            result = await requestWithCookies({
                method: "GET",
                url: `${searchUrl}${separator}${encodeURIComponent(config.searchField)}=${encodeURIComponent(String(email || "").trim())}`,
                jar,
                timeoutMs: config.timeoutMs,
                referer: inbox.url,
            });
        } else {
            return providerError("provider_layout_changed", "No se encontró el buscador de correos del proveedor.");
        }

        const code = extractJeffProviderCode(result.response.data);
        if (!code) return providerError("provider_code_not_found", "No se encontró un código reciente para ese correo en el proveedor.");
        return { ok: true, type: "code", code, source: "jeff_provider" };
    } catch (error) {
        console.warn("[jeffProvider] request failed", {
            stage,
            code: error?.code || "unknown",
            causeCode: error?.causeCode || null,
        });
        if (error?.code === "provider_timeout") return providerError("provider_timeout", "La consulta al proveedor tardó demasiado. Intenta nuevamente.");
        if (/redirecci[oó]n no permitida|demasiadas redirecciones/i.test(error?.message || "")) {
            return providerError("provider_layout_changed", "El flujo de navegación del proveedor cambió.");
        }
        return providerError("provider_unavailable", "No fue posible consultar el buzón del proveedor.");
    }
}

module.exports = {
    extractJeffProviderCode,
    fetchCodeFromJeffProvider,
};
