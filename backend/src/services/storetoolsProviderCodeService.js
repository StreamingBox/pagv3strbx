const axios = require("axios");
const cheerio = require("cheerio");
const { extractJeffProviderCode } = require("./jeffProviderCodeService");

const USER_AGENT = "StreamingBox-CodeService/1.0 (+https://strbx.com.co)";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const TEMPORARY_SUBJECT = /tu\s+c[oó]digo\s+de\s+acceso\s+temporal\s+de\s+netflix\b/i;
const MONTHS = {
    jan: 0, ene: 0,
    feb: 1,
    mar: 2,
    apr: 3, abr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7, ago: 7,
    sep: 8, sept: 8,
    oct: 9,
    nov: 10,
    dec: 11, dic: 11,
};

function providerError(status, message) {
    return { ok: false, status, message };
}

function providerEndpoint(value, baseUrl) {
    try {
        const base = `${String(baseUrl || "").replace(/\/+$/, "")}/`;
        const path = String(value || "").trim().replace(/^\/+/, "");
        const url = new URL(path, base);
        const baseOrigin = new URL(baseUrl).origin;
        if (url.origin !== baseOrigin) return null;
        return url.toString();
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

async function requestWithCookies({ method, url, data, jar, timeoutMs, referer, origin }) {
    let currentUrl = url;
    let currentMethod = method;
    let currentData = data;

    for (let redirects = 0; redirects <= 5; redirects += 1) {
        const headers = {
            "User-Agent": USER_AGENT,
            Accept: "application/json, text/html;q=0.9, */*;q=0.8",
            "Accept-Language": "es-CO,es;q=0.9,en;q=0.7",
            "X-Requested-With": "XMLHttpRequest",
            ...(origin ? { Origin: origin } : {}),
            ...(referer ? { Referer: referer } : {}),
        };
        const cookieHeader = serializeCookies(jar);
        if (cookieHeader) headers.Cookie = cookieHeader;
        if (currentMethod === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";

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

        const location = response.headers?.location;
        const nextUrl = providerEndpoint(location, origin);
        if (!nextUrl) throw new Error("El proveedor devolvió una redirección no permitida.");
        currentUrl = nextUrl;
        if (![307, 308].includes(response.status)) {
            currentMethod = "GET";
            currentData = undefined;
        }
    }

    throw new Error("El proveedor devolvió demasiadas redirecciones.");
}

function parseJson(data) {
    if (data && typeof data === "object") return data;
    try {
        return JSON.parse(String(data || ""));
    } catch {
        return null;
    }
}

function parseStoretoolsDate(value) {
    const match = String(value || "").trim().match(
        /^(\d{1,2})[-\s/]([A-Za-z]{3,4})[-\s/](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/i
    );
    if (!match) return 0;
    const month = MONTHS[String(match[2]).toLowerCase()];
    if (month === undefined) return 0;
    return Date.UTC(
        Number(match[3]),
        month,
        Number(match[1]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6] || 0)
    );
}

function decodeHtml(value) {
    const $ = cheerio.load(`<div id="message">${String(value || "")}</div>`);
    return $("#message").text();
}

function decodeHtmlMarkup(value) {
    const $ = cheerio.load(`<div id="message">${String(value || "")}</div>`);
    return $("#message").html() || "";
}

function extractStoretoolsCode(entry) {
    const subject = String(entry?.asunto || entry?.subject || "");
    const message = String(entry?.mensaje || entry?.message || "");
    const candidates = [
        `${subject}\n${message}`,
        `${subject}\n${decodeHtml(message)}`,
    ];
    for (const candidate of candidates) {
        const code = extractJeffProviderCode(candidate);
        if (/^\d{4}$/.test(code)) return code;
    }
    return "";
}

function selectLatestStoretoolsCode(rows) {
    const normalized = (Array.isArray(rows) ? rows : [])
        .map((row, index) => ({
            row,
            index,
            stamp: parseStoretoolsDate(row?.fecha || row?.date || row?.created_at),
            text: `${String(row?.asunto || row?.subject || "")} ${String(row?.mensaje || row?.message || "")}`,
        }))
        .filter(({ row }) => row && typeof row === "object");

    const loginCodeRows = normalized.filter(({ text }) =>
        /netflix/i.test(text)
        && /(c[oó]digo.*inicio|inicio.*sesi[oó]n|sign\s*in)/i.test(text)
    );
    const candidates = loginCodeRows.length ? loginCodeRows : normalized;
    candidates.sort((a, b) => b.stamp - a.stamp || b.index - a.index);

    for (const candidate of candidates) {
        const code = extractStoretoolsCode(candidate.row);
        if (code) return { code, email: candidate.row };
    }
    return null;
}

function selectLatestStoretoolsTemporaryEmail(rows) {
    const normalized = (Array.isArray(rows) ? rows : [])
        .map((row, index) => ({
            row,
            index,
            stamp: parseStoretoolsDate(row?.fecha || row?.date || row?.created_at),
            subject: String(row?.asunto || row?.subject || ""),
        }))
        .filter(({ row, subject }) => row && typeof row === "object" && TEMPORARY_SUBJECT.test(subject))
        .sort((a, b) => b.stamp - a.stamp || b.index - a.index);

    return normalized[0] || null;
}

function safeNetflixTemporaryUrl(value, baseUrl = "https://storetools.co/") {
    try {
        const url = new URL(String(value || "").trim(), baseUrl);
        const hostname = url.hostname.toLowerCase();
        const isNetflixHost = hostname === "netflix.com" || hostname === "www.netflix.com";
        const path = url.pathname.toLowerCase();
        if (
            url.protocol !== "https:"
            || !isNetflixHost
            || !(path === "/account/travel" || path.startsWith("/account/travel/"))
        ) {
            return "";
        }
        return url.toString();
    } catch {
        return "";
    }
}

function extractStoretoolsTemporaryAction(html, currentUrl = "https://storetools.co/consultar") {
    const $ = cheerio.load(String(html || ""));
    let selected = null;

    $("a[href], button, input[type='submit'], input[type='button']").each((_, element) => {
        if (selected) return;
        const text = [
            $(element).text(),
            $(element).attr("value"),
            $(element).attr("aria-label"),
            $(element).attr("title"),
            $(element).attr("data-uia"),
        ].filter(Boolean).join(" ");
        if (!/obtener\s+c[oó]digo\b/i.test(text)) return;

        const href = safeNetflixTemporaryUrl($(element).attr("href"), currentUrl);
        if (href) selected = { method: "GET", url: href };
    });

    return selected;
}

function extractStoretoolsTemporaryCode(html) {
    const $ = cheerio.load(String(html || ""));
    const text = String($("body").text() || $.text()).replace(/\s+/g, " ").trim();
    if (!/(acceso\s+temporal|ver\s+netflix\s+en\s+tu\s+dispositivo|dispositivo\s+solicitante)/i.test(text)) return "";
    const code = extractJeffProviderCode(String(html || ""));
    return /^\d{4}$/.test(code) ? code : "";
}

async function fetchNetflixTemporaryPage({ url, timeoutMs, referer }) {
    let currentUrl = safeNetflixTemporaryUrl(url, url);
    if (!currentUrl) throw new Error("El enlace temporal de Netflix no es válido.");

    for (let redirects = 0; redirects <= 5; redirects += 1) {
        let response;
        try {
            response = await axios.request({
                method: "GET",
                url: currentUrl,
                headers: {
                    "User-Agent": USER_AGENT,
                    Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "es-CO,es;q=0.9,en;q=0.7",
                    ...(referer ? { Referer: referer } : {}),
                },
                timeout: timeoutMs,
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400,
            });
        } catch (error) {
            const wrapped = new Error(isProviderTimeout(error)
                ? "El enlace temporal de Netflix tardó demasiado en responder."
                : "No fue posible abrir el enlace temporal de Netflix.");
            wrapped.code = isProviderTimeout(error) ? "provider_timeout" : "provider_unavailable";
            wrapped.causeCode = error?.code || null;
            throw wrapped;
        }

        if (!REDIRECT_STATUSES.has(response.status)) return { response, url: currentUrl };

        const nextUrl = safeNetflixTemporaryUrl(response.headers?.location, currentUrl);
        if (!nextUrl) throw new Error("Netflix devolvió una redirección no permitida.");
        currentUrl = nextUrl;
    }

    throw new Error("Netflix devolvió demasiadas redirecciones.");
}

async function fetchCodeFromStoretoolsProvider({ email, config, action = "code" }) {
    if (!config?.enabled) {
        return providerError("provider_config_error", "El proveedor externo de códigos no está configurado.");
    }

    const jar = new Map();
    const origin = String(config.baseUrl || "").replace(/\/+$/, "");
    let stage = "landing_page";

    try {
        const pageUrl = providerEndpoint(config.pagePath, config.baseUrl);
        const loginUrl = providerEndpoint(config.loginPath, config.baseUrl);
        const queryUrl = providerEndpoint(config.queryPath, config.baseUrl);
        if (!pageUrl || !loginUrl || !queryUrl) {
            return providerError("provider_config_error", "La configuración del proveedor no es válida.");
        }

        await requestWithCookies({
            method: "GET",
            url: pageUrl,
            jar,
            timeoutMs: config.timeoutMs,
            origin,
        });

        stage = "login_submit";
        const login = await requestWithCookies({
            method: "POST",
            url: loginUrl,
            data: new URLSearchParams({
                tipo: "login",
                idUsuarioConsulta: String(config.userId),
            }).toString(),
            jar,
            timeoutMs: config.timeoutMs,
            referer: pageUrl,
            origin,
        });
        const loginResult = parseJson(login.response.data);
        if (!loginResult || String(loginResult.respuesta || "").toLowerCase() !== "exito") {
            return providerError("provider_auth_error", "El proveedor rechazó la autenticación.");
        }

        stage = "email_search";
        const query = await requestWithCookies({
            method: "POST",
            url: queryUrl,
            data: new URLSearchParams({
                plataforma: config.platform,
                idPlataforma: config.platformId,
                correoConsultar: String(email || "").trim(),
                language: config.language,
            }).toString(),
            jar,
            timeoutMs: config.timeoutMs,
            referer: pageUrl,
            origin,
        });
        const queryResult = parseJson(query.response.data);
        if (!queryResult) {
            return providerError("provider_layout_changed", "La respuesta del proveedor cambió.");
        }
        if (String(queryResult.respuesta || "").toLowerCase() !== "exito") {
            return providerError("provider_code_not_found", "No se encontró un código reciente para ese correo.");
        }

        const normalizedAction = String(action || "code").trim().toLowerCase();
        const selected = normalizedAction === "temporary"
            ? selectLatestStoretoolsTemporaryEmail(queryResult.resultadoCorreos)
            : selectLatestStoretoolsCode(queryResult.resultadoCorreos);
        if (!selected) {
            return providerError("provider_code_not_found", "No se encontró un código reciente para ese correo.");
        }

        if (normalizedAction === "temporary") {
            stage = "temporary_message_link";
            const messageHtml = decodeHtmlMarkup(selected.row?.mensaje || selected.row?.message || "");
            const temporaryAction = extractStoretoolsTemporaryAction(messageHtml, queryUrl);
            if (!temporaryAction) {
                return providerError("provider_code_not_found", "No se encontró el enlace Obtener código en el correo temporal.");
            }

            stage = "temporary_code_page";
            const codePage = await fetchNetflixTemporaryPage({
                url: temporaryAction.url,
                timeoutMs: config.timeoutMs,
                referer: queryUrl,
            });
            const code = extractStoretoolsTemporaryCode(codePage.response.data);
            if (!code) {
                return providerError("provider_code_not_found", "No se encontró el código temporal de 4 dígitos.");
            }
            return { ok: true, type: "code", code, source: "storetools_provider" };
        }

        return { ok: true, type: "code", code: selected.code, source: "storetools_provider" };
    } catch (error) {
        console.warn("[storetoolsProvider] request failed", {
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
    fetchCodeFromStoretoolsProvider,
    __test: {
        parseStoretoolsDate,
        extractStoretoolsCode,
        selectLatestStoretoolsCode,
        selectLatestStoretoolsTemporaryEmail,
        extractStoretoolsTemporaryAction,
        extractStoretoolsTemporaryCode,
        safeNetflixTemporaryUrl,
    },
};
