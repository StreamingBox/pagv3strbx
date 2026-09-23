const axios = require("axios");
const cheerio = require("cheerio");
const { extractJeffProviderCode } = require("./jeffProviderCodeService");

const USER_AGENT = "StreamingBox-CodeService/1.0 (+https://strbx.com.co)";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const QUERY_RETRY_DELAY_MS = 700;
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

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

function isProviderTimeout(error) {
    const code = String(error?.code || "").toUpperCase();
    return ["ECONNABORTED", "ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(code)
        || /timeout|timed out/i.test(String(error?.message || ""));
}

async function requestJson({ method, url, data, timeoutMs, token }) {
    const headers = {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Accept-Language": "es-CO,es;q=0.9,en;q=0.7",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    try {
        return await axios.request({
            method,
            url,
            data: JSON.stringify(data),
            headers,
            timeout: timeoutMs,
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 500,
        });
    } catch (error) {
        const wrapped = new Error(isProviderTimeout(error)
            ? "El proveedor no respondió a tiempo."
            : "No fue posible conectar con el proveedor.");
        wrapped.code = isProviderTimeout(error) ? "provider_timeout" : "provider_unavailable";
        wrapped.causeCode = error?.code || null;
        throw wrapped;
    }
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
    const raw = String(value || "").trim();
    const localeValue = raw
        .replace(/\u00a0/g, " ")
        .replace(/\./g, "")
        .replace(/,/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const localeMatch = localeValue.match(
        /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s+([ap])\s*m)?$/i
    );
    if (localeMatch) {
        let hour = Number(localeMatch[4]);
        const meridiem = String(localeMatch[7] || "").toLowerCase();
        if (meridiem === "a" && hour === 12) hour = 0;
        if (meridiem === "p" && hour < 12) hour += 12;
        return Date.UTC(
            Number(localeMatch[3]),
            Number(localeMatch[2]) - 1,
            Number(localeMatch[1]),
            hour,
            Number(localeMatch[5]),
            Number(localeMatch[6] || 0)
        );
    }

    const match = raw.match(
        /^(\d{1,2})[-\s/]([A-Za-z]{3,4})[-\s/](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/i
    );
    if (match) {
        const month = MONTHS[String(match[2]).toLowerCase()];
        if (month !== undefined) {
            return Date.UTC(
                Number(match[3]),
                month,
                Number(match[1]),
                Number(match[4]),
                Number(match[5]),
                Number(match[6] || 0)
            );
        }
    }

    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeRecipient(value) {
    const raw = String(value || "").toLowerCase().trim();
    const email = raw.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/i);
    return (email ? email[0] : raw).replace(/\s+/g, "");
}

function getStoretoolsRecipient(row) {
    return normalizeRecipient(
        row?.para || row?.to || row?.recipient || row?.destinatario || ""
    );
}

function decodeHtml(value) {
    const $ = cheerio.load(`<div id="message">${String(value || "")}</div>`);
    return $("#message").text();
}

function decodeHtmlMarkup(value) {
    let markup = String(value || "");

    // StoreTools returns the email HTML escaped inside the JSON payload. Decode
    // it once as text, then parse the resulting markup so its links are visible.
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const $ = cheerio.load(`<div id="message">${markup}</div>`);
        const html = $("#message").html() || "";
        const text = $("#message").text() || "";
        if (/<(?:a|button|input)\b/i.test(html) || text === markup) return html;
        markup = text;
    }

    return markup;
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

function selectLatestStoretoolsCode(rows, targetEmail = "") {
    const normalized = (Array.isArray(rows) ? rows : [])
        .map((row, index) => ({
            row,
            index,
            stamp: parseStoretoolsDate(row?.fecha || row?.date || row?.created_at),
            recipient: getStoretoolsRecipient(row),
            text: `${String(row?.asunto || row?.subject || "")} ${String(row?.mensaje || row?.message || "")}`,
        }))
        .filter(({ row }) => row && typeof row === "object");

    const target = normalizeRecipient(targetEmail);
    const rowsWithRecipient = normalized.filter(({ recipient }) => recipient);
    const recipientRows = target && rowsWithRecipient.length
        ? normalized.filter(({ recipient }) => recipient === target)
        : normalized;
    const loginCodeRows = recipientRows.filter(({ text }) =>
        /netflix/i.test(text)
        && /(c[oó]digo.*inicio|inicio.*sesi[oó]n|sign\s*in)/i.test(text)
    );
    const candidates = loginCodeRows.length ? loginCodeRows : recipientRows;
    candidates.sort((a, b) => b.stamp - a.stamp || b.index - a.index);

    for (const candidate of candidates) {
        const code = extractStoretoolsCode(candidate.row);
        if (code) return { code, email: candidate.row };
    }
    return null;
}

function selectLatestStoretoolsTemporaryEmail(rows, targetEmail = "") {
    const normalized = (Array.isArray(rows) ? rows : [])
        .map((row, index) => ({
            row,
            index,
            stamp: parseStoretoolsDate(row?.fecha || row?.date || row?.created_at),
            recipient: getStoretoolsRecipient(row),
            subject: String(row?.asunto || row?.subject || ""),
        }))
        .filter(({ row, subject }) => row && typeof row === "object" && TEMPORARY_SUBJECT.test(subject));

    const target = normalizeRecipient(targetEmail);
    const rowsWithRecipient = normalized.filter(({ recipient }) => recipient);
    const recipientRows = target && rowsWithRecipient.length
        ? normalized.filter(({ recipient }) => recipient === target)
        : normalized;

    recipientRows
        .sort((a, b) => b.stamp - a.stamp || b.index - a.index);

    return recipientRows[0] || null;
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

    let stage = "validate_id";

    try {
        const validateIdUrl = providerEndpoint(config.validateIdPath, config.baseUrl);
        const queryUrl = providerEndpoint(config.queryPath, config.baseUrl);
        if (!validateIdUrl || !queryUrl) {
            return providerError("provider_config_error", "La configuración del proveedor no es válida.");
        }

        stage = "validate_id";
        const validation = await requestJson({
            method: "POST",
            url: validateIdUrl,
            data: { idUsuarioConsulta: String(config.userId || "").trim() },
            timeoutMs: config.timeoutMs,
        });
        const validationResult = parseJson(validation.data);
        const validationStatus = String(validationResult?.respuesta || validationResult?.status || "").toLowerCase();
        if (validation.status >= 400 || !validationResult || validationStatus !== "exito") {
            return providerError("provider_auth_error", "No se pudo validar el acceso configurado.");
        }

        const token = String(validationResult.token || validationResult.accessToken || "").trim();
        const identity = validationResult.datos || validationResult.usuario || {};
        const idUsuarioConsulta = String(
            identity.idConsulta || identity.idUsuario || config.userId || "",
        ).trim();

        stage = "email_search";
        const normalizedAction = String(action || "code").trim().toLowerCase();
        let queryResult = null;
        let selected = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const query = await requestJson({
                method: "POST",
                url: queryUrl,
                data: {
                    plataforma: config.platform,
                    idPlataforma: config.platformId,
                    correoConsultar: String(email || "").trim(),
                    modo: "correo",
                    tipoConsulta: "correo",
                    token: token || null,
                    idUsuarioConsulta,
                    language: config.language,
                },
                timeoutMs: config.timeoutMs,
                token,
            });
            queryResult = parseJson(query.data);
            if (!queryResult) {
                return providerError("provider_layout_changed", "La respuesta del servicio de consulta cambió.");
            }
            const queryStatus = String(queryResult.respuesta || queryResult.status || "").toLowerCase();
            if (queryStatus === "sesion") {
                return providerError("provider_auth_error", "La sesión de consulta no está autorizada.");
            }
            if (queryStatus === "exito") {
                selected = normalizedAction === "temporary"
                    ? selectLatestStoretoolsTemporaryEmail(queryResult.resultadoCorreos, email)
                    : selectLatestStoretoolsCode(queryResult.resultadoCorreos, email);
                if (selected) break;
            }
            if (attempt < 2) await wait(QUERY_RETRY_DELAY_MS);
        }

        if (!queryResult || String(queryResult.respuesta || queryResult.status || "").toLowerCase() !== "exito") {
            return providerError("provider_code_not_found", "No se encontró un código reciente para ese correo.");
        }
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
            return providerError("provider_timeout", "La consulta tardó demasiado. Intenta nuevamente.");
        }
        if (/redirecci[oó]n no permitida|demasiadas redirecciones/i.test(error?.message || "")) {
            return providerError("provider_layout_changed", "El flujo de navegación del servicio cambió.");
        }
        return providerError("provider_unavailable", "No fue posible consultar el buzón de códigos.");
    }
}

module.exports = {
    fetchCodeFromStoretoolsProvider,
    __test: {
        parseStoretoolsDate,
        normalizeRecipient,
        getStoretoolsRecipient,
        extractStoretoolsCode,
        selectLatestStoretoolsCode,
        selectLatestStoretoolsTemporaryEmail,
        decodeHtmlMarkup,
        extractStoretoolsTemporaryAction,
        extractStoretoolsTemporaryCode,
        safeNetflixTemporaryUrl,
    },
};
