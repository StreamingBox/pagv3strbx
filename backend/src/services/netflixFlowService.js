// BACKEND: pagv2strbx/src/services/netflixFlowService.js
const { simpleParser } = require("mailparser");
const axios = require("axios");
const cheerio = require("cheerio");
const https = require("https");
const { getImapConfig, safeToDate, getEnvBool, allowInsecureTls, connectImapWithTlsFallback, isTlsCertificateError } = require("../utils/imapConfig");

function getNetflixAxiosOptions(overrides = {}) {
    const insecureTls = allowInsecureTls("NETFLIX_TLS_INSECURE");
    const baseHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "es-CO,es;q=0.9,en;q=0.7",
        "Upgrade-Insecure-Requests": "1",
    };

    return {
        ...overrides,
        headers: { ...baseHeaders, ...((overrides && overrides.headers) || {}) },
        httpsAgent: new https.Agent({
            rejectUnauthorized: !insecureTls,
        }),
        maxRedirects: overrides.maxRedirects ?? 10,
        timeout: overrides.timeout ?? 15000,
    };
}

function getNetflixApprovalNavigationHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "es-CO",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-User": "?1",
        "sec-ch-ua": "\"Google Chrome\";v=\"149\", \"Chromium\";v=\"149\", \"Not)A;Brand\";v=\"24\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
    };
}

function stripDiacritics(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value) {
    return stripDiacritics(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeTemporaryCodeCandidate(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length !== 4) return "";
    if (digits === "0000") return "";
    if (/^20[0-9]{2}$/.test(digits)) return "";
    return digits;
}

function firstTemporaryCodeCandidate(content) {
    const matches = String(content || "").match(/\b(?:[0-9][\s.\-]*){4}\b/g) || [];
    for (const match of matches) {
        const candidate = normalizeTemporaryCodeCandidate(match);
        if (candidate) return candidate;
    }
    return "";
}

function pageLooksExpired(content) {
    const normalized = normalizeText(content);
    return [
        "este enlace ya no es valido",
        "this link is no longer valid",
        "link has expired",
        "this link has expired",
        "solicita uno nuevo",
    ].some((needle) => normalized.includes(needle));
}

function pageLooksApproved(content) {
    const normalized = normalizeText(content);
    return [
        "solicitud aprobada",
        "inicio de sesion aprobado",
        "dispositivo aprobado",
        "aprobaste la solicitud",
        "aprobaste este dispositivo",
        "ya puedes continuar",
        "ya puedes ver netflix",
        "todo listo",
        "ya puedes disfrutar de netflix",
        "vuelve a tu dispositivo",
        "request approved",
        "sign-in request approved",
        "signin request approved",
        "device approved",
        "you approved",
        "you're all set",
        "you are all set",
        "return to your device",
    ].some((needle) => normalized.includes(needle));
}

function pageLooksInvalidApproval(content, finalUrl = "") {
    const normalized = normalizeText(`${content || ""}\n${finalUrl || ""}`);
    return [
        "lost your way",
        "sorry, we can't find that page",
        "error code nses-404",
        "notfound",
        "pagina no encontrada",
        "no podemos encontrar esa pagina",
    ].some((needle) => normalized.includes(needle));
}

function pageNeedsApproval(content) {
    const normalized = normalizeText(content);
    const hasApproveAction = [
        "aprobar",
        "approve",
        "autorizar",
        "allow",
    ].some((needle) => normalized.includes(needle));
    const hasRequestContext = [
        "solicitud de inicio de sesion",
        "nueva solicitud",
        "inicio de sesion",
        "sign-in request",
        "signin request",
        "new sign in",
        "new sign-in",
    ].some((needle) => normalized.includes(needle));
    return hasApproveAction && hasRequestContext && !pageLooksApproved(content);
}

function pageRequiresLogin(content) {
    const normalized = normalizeText(content);
    return [
        "inicia sesion para continuar",
        "iniciar sesion para continuar",
        "sign in to continue",
        "sign-in to continue",
        "ingresa tu contrasena",
        "enter your password",
    ].some((needle) => normalized.includes(needle));
}

function looksLikeDeviceDateLine(value) {
    const normalized = normalizeText(value);
    return /\b\d{1,2}\s+de\s+[a-z]+\b/.test(normalized)
        || /\b(?:a\.?\s*m\.?|p\.?\s*m\.?|am|pm)\b/.test(normalized)
        || /\b(?:cot|utc|gmt)\b/.test(normalized);
}

function isGenericDeviceLine(value) {
    const normalized = normalizeText(value);
    if (!normalized || normalized.length < 3 || normalized.length > 80) return true;
    return [
        "netflix",
        "aprobar",
        "approve",
        "rechazar",
        "reject",
        "hola",
        "si reconoces",
        "te escribimos",
        "solicitud",
        "inicio de sesion",
    ].some((needle) => normalized.includes(needle));
}

function extractApprovalDeviceName(text, html = "") {
    const sourceText = String(text || cheerio.load(html || "<body></body>")("body").text() || "");
    const directMatch = sourceText.match(/(?:desde|dispositivo|device)\s*:\s*([^\n\r]+)/i);
    if (directMatch?.[1] && !isGenericDeviceLine(directMatch[1])) {
        return directMatch[1].trim();
    }

    const lines = sourceText
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean);

    for (let index = 1; index < lines.length; index += 1) {
        if (!looksLikeDeviceDateLine(lines[index])) continue;
        const candidate = lines[index - 1];
        if (!isGenericDeviceLine(candidate)) return candidate;
    }

    return "Tu Dispositivo";
}

function extractNetflixTemporaryCode(content) {
    const source = String(content || "");
    const textOnly = cheerio.load(`<body>${source}</body>`)("body").text().replace(/\s+/g, " ").trim();
    const normalizedText = normalizeText(textOnly);
    const normalizedSource = normalizeText(source.replace(/<[^>]+>/g, " "));

    const $ = cheerio.load(source || "<body></body>");
    let isolatedCode = "";
    $("*").each((_, el) => {
        if (isolatedCode) return;
        const candidate = normalizeTemporaryCodeCandidate($(el).text());
        if (candidate) isolatedCode = candidate;
    });
    if (isolatedCode) return isolatedCode;

    const patterns = [
        /usa este codigo para ver netflix en tu dispositivo[\s\S]{0,260}?ingresa este codigo en el dispositivo solicitante para obtener acceso temporal\.?\s*((?:[0-9][\s.\-]*){4})/i,
        /ingresa este codigo en el dispositivo solicitante para obtener acceso temporal\.?\s*((?:[0-9][\s.\-]*){4})/i,
        /(?:codigo|code)[^0-9]{0,120}((?:[0-9][\s.\-]*){4})[^0-9]{0,180}(?:acceso temporal|temporary access|15 minutos|15 minutes|vence|expires)/i,
        /(?:acceso temporal|temporary access)[^0-9]{0,180}((?:[0-9][\s.\-]*){4})/i,
        /((?:[0-9][\s.\-]*){4})[^0-9]{0,180}(?:este codigo vence despues de 15 minutos|vence despues de 15 minutos|expires after 15 minutes|15 minutes)/i,
    ];

    for (const haystack of [normalizedText, normalizedSource, textOnly, source]) {
        for (const pattern of patterns) {
            const match = haystack.match(pattern);
            const candidate = normalizeTemporaryCodeCandidate(match?.[1]);
            if (candidate) {
                return candidate;
            }
        }
    }

    if (
        normalizedText.includes("acceso temporal")
        || normalizedText.includes("temporary access")
        || normalizedSource.includes("acceso temporal")
        || normalizedSource.includes("temporary access")
    ) {
        return firstTemporaryCodeCandidate(`${textOnly}\n${source}`);
    }

    return "";
}

async function scrapeTemporalCode(link, depth = 0, visited = new Set()) {
    try {
        const safeLink = String(link || "").trim();
        if (!safeLink) {
            return { ok: false, status: "not_found", message: "Netflix no envió un enlace válido para obtener el código." };
        }
        if (visited.has(safeLink)) {
            return { ok: false, status: "not_found", message: "Netflix devolvió un enlace repetido y no se pudo avanzar al código." };
        }
        visited.add(safeLink);

        const { data } = await axios.get(safeLink, getNetflixAxiosOptions());
        const $ = cheerio.load(data);
        const textContent = $("body").text() || "";
        const combinedContent = `${data}\n${textContent}`;

        if (pageLooksExpired(combinedContent)) {
            return { ok: false, status: "expired", message: "El enlace del código de Netflix ya venció. Solicita uno nuevo." };
        }

        const directCode = extractNetflixTemporaryCode(combinedContent);
        if (directCode) {
            return { ok: true, type: "code", code: directCode };
        }

        if (depth < 2) {
            const nestedLink = findNetflixButtonLink(
                data,
                ["obtener codigo", "obtener código", "get code", "access code", "codigo temporal", "continuar", "continue"],
                ["netflix.com/account/travel/verify", "travel/verify", "netflix.com/account/travel", "account/travel"]
            );
            if (nestedLink && nestedLink !== safeLink) {
                return scrapeTemporalCode(nestedLink, depth + 1, visited);
            }
        }

        return { ok: false, status: "not_found", message: "No se encontró el código de 4 dígitos en la página de Netflix." };
    } catch (err) {
        console.error("Error scraping temporal code:", err.message);
        if (isTlsCertificateError(err)) {
            return {
                ok: false,
                status: "tls_error",
                message: "Error TLS al abrir el enlace de Netflix. Revisa certificados o activa NETFLIX_TLS_INSECURE=true temporalmente.",
            };
        }
        return { ok: false, status: "network_error", message: "Error al leer el enlace de Netflix." };
    }
}

function subjectMatchesAction(subject, action) {
    const s = normalizeText(subject);
    const normalizedAction = String(action || "code").toLowerCase();

    if (normalizedAction === "temporary") {
        return s.includes("codigo de acceso temporal")
            || s.includes("codigo temporal")
            || s.includes("acceso temporal")
            || s.includes("temporary access code")
            || s.includes("temporary code")
            || s.includes("temporary access");
    }

    if (normalizedAction === "approve") {
        return s.includes("solicitud de inicio de sesion")
            || s.includes("aprueba la nueva solicitud")
            || s.includes("approve")
            || s.includes("request");
    }

    if (
        s.includes("codigo de acceso temporal")
        || s.includes("codigo temporal")
        || s.includes("acceso temporal")
        || s.includes("temporary access code")
        || s.includes("temporary code")
        || s.includes("temporary access")
    ) {
        return false;
    }

    return s.includes("codigo")
        || s.includes("iniciar sesion")
        || s.includes("login")
        || s.includes("sign in")
        || s.includes("code");
}

function findNetflixButtonLink(html, textNeedles = [], hrefNeedles = []) {
    const $ = cheerio.load(String(html || ""));
    const links = $("a").toArray();
    for (const el of links) {
        const label = normalizeText($(el).text());
        const href = String($(el).attr("href") || "");
        const labelMatch = textNeedles.some((needle) => label.includes(normalizeText(needle)));
        const hrefMatch = hrefNeedles.some((needle) => href.toLowerCase().includes(String(needle).toLowerCase()));
        if (href && (labelMatch || hrefMatch)) return href;
    }
    return "";
}

function findNetflixTextActionLink(text, actionNeedles = []) {
    const needles = actionNeedles.map((needle) => normalizeText(needle)).filter(Boolean);
    const lines = String(text || "").split(/\r?\n/);

    for (const line of lines) {
        const normalizedLine = normalizeText(line);
        if (!needles.some((needle) => normalizedLine.includes(needle))) continue;
        if (normalizedLine.includes("rechazar") || normalizedLine.includes("reject")) continue;

        const match = line.match(/https?:\/\/[^\]\s)]+/i);
        if (match?.[0]) return match[0].trim();
    }

    return "";
}

function buildAbsoluteUrl(rawUrl, baseUrl) {
    const url = String(rawUrl || "").trim();
    if (!url) return "";
    try {
        return new URL(url, baseUrl || "https://www.netflix.com").toString();
    } catch (_) {
        return "";
    }
}

function isNetflixDirectApprovalUrl(url) {
    const normalized = String(url || "").toLowerCase();
    return normalized.includes("netflix.com/ilum") || normalized.includes("/ilum?code");
}

function mergeCookieHeader(currentCookieHeader, setCookieHeader) {
    const cookies = new Map();
    String(currentCookieHeader || "")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => {
            const eqIndex = part.indexOf("=");
            if (eqIndex > 0) cookies.set(part.slice(0, eqIndex), part.slice(eqIndex + 1));
        });

    const setCookies = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : (setCookieHeader ? [setCookieHeader] : []);

    for (const raw of setCookies) {
        const firstPart = String(raw || "").split(";")[0].trim();
        const eqIndex = firstPart.indexOf("=");
        if (eqIndex > 0) cookies.set(firstPart.slice(0, eqIndex), firstPart.slice(eqIndex + 1));
    }

    return Array.from(cookies.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
}

function getFinalResponseUrl(response, fallbackUrl) {
    return response?.request?.res?.responseUrl
        || response?.request?.responseURL
        || response?.config?.url
        || fallbackUrl
        || "";
}

function getControlText($, el) {
    return [
        $(el).text(),
        $(el).attr("value"),
        $(el).attr("aria-label"),
        $(el).attr("title"),
        $(el).attr("data-uia"),
        $(el).attr("name"),
        $(el).attr("id"),
    ].map((value) => String(value || "")).join(" ");
}

function isRejectControl($, el) {
    const value = normalizeText(`${getControlText($, el)} ${$(el).attr("href") || ""} ${$(el).attr("formaction") || ""}`);
    return ["rechazar", "reject", "deny", "cancelar", "cancel"].some((needle) => value.includes(needle));
}

function isApprovalControl($, el) {
    if (!el || isRejectControl($, el)) return false;
    const value = normalizeText(`${getControlText($, el)} ${$(el).attr("href") || ""} ${$(el).attr("formaction") || ""}`);
    return [
        "aprobar",
        "approve",
        "autorizar",
        "allow",
        "continuar",
        "continue",
        "signinapproval",
        "sign-in",
        "account/approve",
        "ilum?code",
        "/ilum",
    ].some((needle) => value.includes(needle));
}

function appendFormControlValue(params, $, el) {
    const $el = $(el);
    if ($el.attr("disabled")) return;

    const tag = String(el.tagName || el.name || "").toLowerCase();
    const type = String($el.attr("type") || "").toLowerCase();
    const name = $el.attr("name");

    if (!name) return;
    if (["button", "submit", "reset", "file", "image"].includes(type)) return;
    if ((type === "checkbox" || type === "radio") && !$el.attr("checked")) return;

    if (tag === "select") {
        const selected = $el.find("option[selected]").first();
        const option = selected.length ? selected : $el.find("option").first();
        params.append(name, option.attr("value") || option.text() || "");
        return;
    }

    params.append(name, $el.attr("value") || $el.text() || "");
}

function buildApprovalFormSubmission(html, baseUrl) {
    const $ = cheerio.load(String(html || ""));
    const forms = $("form").toArray();

    for (const form of forms) {
        const $form = $(form);
        const formHaystack = normalizeText(`${$form.text()} ${$form.attr("action") || ""} ${$form.attr("id") || ""} ${$form.attr("name") || ""}`);
        const submit = $form.find("button, input[type='submit'], input[type='button'], input[type='image']").toArray()
            .find((el) => isApprovalControl($, el));
        const formLooksRelevant = [
            "aprobar",
            "approve",
            "autorizar",
            "allow",
            "signinapproval",
            "account/approve",
            "approval",
        ].some((needle) => formHaystack.includes(needle));

        if (!submit && !formLooksRelevant) continue;

        const method = String($(submit).attr("formmethod") || $form.attr("method") || "GET").toUpperCase() === "POST"
            ? "POST"
            : "GET";
        const action = $(submit).attr("formaction") || $form.attr("action") || baseUrl;
        const url = buildAbsoluteUrl(action, baseUrl);
        if (!url) continue;

        const params = new URLSearchParams();
        $form.find("input, textarea, select").each((_, el) => appendFormControlValue(params, $, el));

        const submitName = $(submit).attr("name");
        if (submitName) {
            params.set(submitName, $(submit).attr("value") || $(submit).text() || "true");
        }

        return { method, url, params };
    }

    return null;
}

function findApprovalActionLink(html, baseUrl) {
    const $ = cheerio.load(String(html || ""));
    const links = $("a").toArray();

    for (const el of links) {
        if (!isApprovalControl($, el)) continue;
        const href = $(el).attr("href");
        const url = buildAbsoluteUrl(href, baseUrl);
        if (url) return url;
    }

    return "";
}

async function fetchNetflixPage({ url, method = "GET", params = null, cookieHeader = "", referer = "", navigationHeaders = null }) {
    const headers = { ...(navigationHeaders || {}) };
    if (cookieHeader) headers.Cookie = cookieHeader;
    if (referer) headers.Referer = referer;

    let requestUrl = url;
    let data;
    const normalizedMethod = String(method || "GET").toUpperCase();
    if (params instanceof URLSearchParams && normalizedMethod === "GET" && String(params).length > 0) {
        const nextUrl = new URL(url);
        for (const [key, value] of params.entries()) {
            nextUrl.searchParams.set(key, value);
        }
        requestUrl = nextUrl.toString();
    } else if (params instanceof URLSearchParams && normalizedMethod === "POST") {
        data = params.toString();
        headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    const response = await axios({
        url: requestUrl,
        method: normalizedMethod,
        data,
        ...getNetflixAxiosOptions({
            headers,
            validateStatus: (status) => status >= 200 && status < 500,
        }),
    });

    const finalUrl = getFinalResponseUrl(response, requestUrl);
    return {
        html: String(response?.data || ""),
        finalUrl,
        cookieHeader: mergeCookieHeader(cookieHeader, response?.headers?.["set-cookie"]),
    };
}

/**
 * Entra al link de "Aprobar" dispositivo
 */
async function scrapeApproveLinkLegacy(link, deviceName, depth = 0, visited = new Set()) {
    try {
        const safeLink = String(link || "").trim();
        if (!safeLink) {
            return { ok: false, status: "not_found", message: "Netflix no envió un enlace válido de aprobación." };
        }
        if (visited.has(safeLink)) {
            return { ok: false, status: "not_found", message: "Netflix devolvió un enlace repetido y no se pudo confirmar la aprobación." };
        }
        visited.add(safeLink);

        const { data } = await axios.get(safeLink, getNetflixAxiosOptions());

        // Netflix suele aprobarlo al abrir o confirmar. 
        // Asumiremos que el GET es suficiente, basándonos en cómo funciona el deep link en los correos recientes de Netflix.
        // Si Netflix requiere un POST posterior, habría que hacerlo aquí, pero usualmente los tokens de email son 1-click GET o redirect.

        const $ = cheerio.load(data);
        const textContent = $("body").text() || "";
        const combinedContent = `${data}\n${textContent}`;

        if (pageLooksExpired(combinedContent)) {
            return { ok: false, status: "expired", message: "El enlace de aprobación de Netflix ya venció." };
        }

        if (depth < 2) {
            const nestedLink = findNetflixButtonLink(
                data,
                ["aprobar", "approve", "continuar", "continue"],
                ["netflix.com/account/approve", "account/approve"]
            );
            if (nestedLink && nestedLink !== safeLink) {
                return scrapeApproveLink(nestedLink, deviceName, depth + 1, visited);
            }
        }

        return { ok: true, type: "approval", deviceName: deviceName || "Dispositivo Desconocido" };

    } catch (err) {
        console.error("Error scraping approval link:", err.message);
        if (isTlsCertificateError(err)) {
            return {
                ok: false,
                status: "tls_error",
                message: "Error TLS al abrir el enlace de aprobacion de Netflix. Revisa certificados o activa NETFLIX_TLS_INSECURE=true temporalmente.",
            };
        }
        return { ok: false, status: "network_error", message: "Error al confirmar aprobación de Netflix." };
    }
}


/**
 * Busca específicamente los flujos nuevos de Netflix en Gmail
 */
async function scrapeApproveLink(link, deviceName, depth = 0, visited = new Set()) {
    try {
        let safeLink = buildAbsoluteUrl(link);
        if (!safeLink) {
            return { ok: false, status: "not_found", message: "Netflix no envio un enlace valido de aprobacion." };
        }

        let cookieHeader = "";
        let referer = "";
        let currentPage = null;

        for (let step = depth; step < 6; step += 1) {
            if (!currentPage) {
                if (visited.has(`GET:${safeLink}`)) {
                    return { ok: false, status: "not_found", message: "Netflix devolvio un enlace repetido y no se pudo confirmar la aprobacion." };
                }
                visited.add(`GET:${safeLink}`);
                currentPage = await fetchNetflixPage({
                    url: safeLink,
                    cookieHeader,
                    referer,
                    navigationHeaders: isNetflixDirectApprovalUrl(safeLink)
                        ? getNetflixApprovalNavigationHeaders()
                        : null,
                });
            }

            cookieHeader = currentPage.cookieHeader || cookieHeader;
            referer = currentPage.finalUrl || safeLink;

            const $ = cheerio.load(currentPage.html);
            const textContent = $("body").text() || "";
            const combinedContent = `${currentPage.html}\n${textContent}`;

            if (pageLooksExpired(combinedContent)) {
                return { ok: false, status: "expired", message: "El enlace de aprobacion de Netflix ya vencio." };
            }

            if (pageLooksInvalidApproval(combinedContent, currentPage.finalUrl)) {
                return {
                    ok: false,
                    status: "expired",
                    message: "El enlace de aprobacion de Netflix ya no es valido. Solicita uno nuevo.",
                };
            }

            if (pageLooksApproved(combinedContent)) {
                return { ok: true, type: "approval", deviceName: deviceName || "Dispositivo Desconocido" };
            }

            if (pageRequiresLogin(combinedContent)) {
                return {
                    ok: false,
                    status: "login_required",
                    message: "Netflix pidio iniciar sesion antes de aprobar. Abre el correo manualmente o solicita otro intento.",
                };
            }

            const formSubmission = buildApprovalFormSubmission(currentPage.html, currentPage.finalUrl || safeLink);
            if (formSubmission) {
                const requestKey = `${formSubmission.method}:${formSubmission.url}:${String(formSubmission.params || "")}`;
                if (visited.has(requestKey)) {
                    return { ok: false, status: "not_found", message: "Netflix repitio el formulario de aprobacion y no confirmo el acceso." };
                }
                visited.add(requestKey);
                currentPage = await fetchNetflixPage({
                    url: formSubmission.url,
                    method: formSubmission.method,
                    params: formSubmission.params,
                    cookieHeader,
                    referer,
                });
                continue;
            }

            const nestedLink = findApprovalActionLink(currentPage.html, currentPage.finalUrl || safeLink);
            if (nestedLink && !visited.has(`GET:${nestedLink}`)) {
                safeLink = nestedLink;
                currentPage = null;
                continue;
            }

            if (pageNeedsApproval(combinedContent)) {
                return {
                    ok: false,
                    status: "approval_pending",
                    message: "Netflix abrio la solicitud, pero no permitio presionar automaticamente el boton de aprobar.",
                };
            }

            return {
                ok: false,
                status: "not_confirmed",
                message: "Netflix no confirmo la aprobacion del dispositivo.",
            };
        }

        return { ok: false, status: "not_confirmed", message: "Netflix no confirmo la aprobacion del dispositivo." };
    } catch (err) {
        console.error("Error scraping approval link:", err.message);
        if (isTlsCertificateError(err)) {
            return {
                ok: false,
                status: "tls_error",
                message: "Error TLS al abrir el enlace de aprobacion de Netflix. Revisa certificados o activa NETFLIX_TLS_INSECURE=true temporalmente.",
            };
        }
        return { ok: false, status: "network_error", message: "Error al confirmar aprobacion de Netflix." };
    }
}

async function fetchNetflixFlow({ toEmail, maxAgeMinutes = 15, action = "code" }) {
    const config = getImapConfig();
    if (!config) return { ok: false, status: "config_error", message: "Faltan variables GMAIL." };

    const ms = maxAgeMinutes * 60 * 1000;
    // Retrocedemos 24 horas para garantizar que cubrimos los últimos mensajes sin problemas de zona horaria
    const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    let conn;
    let stage = "connect";
    try {
        conn = await connectImapWithTlsFallback(config, "netflixFlowService");
        stage = "open_box";
        await conn.openBox("INBOX");

        stage = "search_headers";
        let criteria = [["SINCE", sinceDate]];
        if (toEmail && String(toEmail).trim()) {
            criteria.push(["TO", String(toEmail).trim()]);
        }

        let messages = await conn.search(criteria, { bodies: ["HEADER.FIELDS (FROM TO SUBJECT DATE)"], markSeen: false });

        if (!messages || messages.length === 0) {
            stage = "search_headers_fallback";
            messages = await conn.search([["SINCE", sinceDate]], { bodies: ["HEADER.FIELDS (FROM TO SUBJECT DATE)"], markSeen: false });
        }

        if (!messages || messages.length === 0) {
            return { ok: false, status: "mailbox_empty", message: "No hay correos recientes en la bandeja." };
        }

        // Ordenar más reciente a antiguo
        messages.sort((a, b) => {
            const da = safeToDate(a?.attributes?.date)?.getTime() ?? 0;
            const db = safeToDate(b?.attributes?.date)?.getTime() ?? 0;
            return db - da;
        });

        const fromNeedle = "netflix.com";
        let sawExpiredMatch = false;
        let sawSenderMatch = false;
        let sawTargetMatch = false;
        let lastFlowFailure = null;

        for (const msg of messages) {
            const msgDate = safeToDate(msg?.attributes?.date);
            if (!msgDate) continue;

            const ageMin = (Date.now() - msgDate.getTime()) / 1000 / 60;

            // Buscar el header
            const headerPart = msg?.parts?.find(p => p.which.includes("HEADER"));
            const headers = headerPart?.body || {};

            const fromField = (headers.from && headers.from[0]) ? String(headers.from[0]).toLowerCase() : "";
            const toField = (headers.to && headers.to[0]) ? String(headers.to[0]).toLowerCase() : "";
            
            // Verificamos explícitamente el 'toEmail' por seguridad (en caso del fallback sin búsqueda estricta 'TO' en IMAP)
            if (toEmail && !toField.includes(String(toEmail).trim().toLowerCase())) {
                continue;
            }

            if (!fromField.includes(fromNeedle)) continue;
            sawSenderMatch = true;

            if (ageMin > maxAgeMinutes) {
                sawExpiredMatch = true;
                continue; // Está vencido, pero no detenemos, tal vez haya otro
            }

            const subject = (headers.subject && headers.subject[0]) ? String(headers.subject[0]).toLowerCase() : "";

            let isTarget = subjectMatchesAction(subject, action);
            if (!isTarget && action === "approve") {
                isTarget = true;
            }

            if (!isTarget) continue;
            sawTargetMatch = true;

            // ¡Encontramos el correo correcto! Ahora sí pedimos el cuerpo completo
            stage = "fetch_full_message";
            const fetchFull = await conn.search([["UID", msg.attributes.uid]], { bodies: [""], markSeen: false });
            if (!fetchFull || !fetchFull[0]) continue;

            const raw = fetchFull[0].parts?.find(p => p.which === "");
            if (!raw?.body) continue;

            stage = "parse_message";
            const parsed = await simpleParser(raw.body);
            const html = String(parsed.html || "");
            const text = String(parsed.text || "");

            // 1. FLUJO: CÓDIGO TEMPORAL
            if (action === "temporary") {
                const buttonLink = findNetflixButtonLink(
                    html,
                    ["obtener codigo", "obtener código", "get code", "access code", "codigo temporal", "continuar", "continue"],
                    ["netflix.com/account/travel/verify", "travel/verify", "netflix.com/account/travel", "account/travel"]
                );

                if (buttonLink) {
                    stage = "open_netflix_code_link";
                    const result = await scrapeTemporalCode(buttonLink);
                    if (result.ok || result.status === "expired") {
                        return { ...result, emailDate: msgDate };
                    }
                    lastFlowFailure = result;
                } else {
                    const $ = cheerio.load(html || "<body></body>");
                    let extractedCode = null;

                    // 1. Buscar en HTML con Cheerio dentro de cualquier etiqueta
                    $('*').each((i, el) => {
                        const t = $(el).text().trim();
                        if (/^([0-9]\s*){4,6}$/.test(t)) {
                            extractedCode = t.replace(/\s/g, '');
                        }
                    });

                    // 2. Fallback: buscarlo en texto plano
                    if (!extractedCode) {
                        const plainMatches = text.match(/\b(?:[0-9]\s*){4,6}\b/g);
                        if (plainMatches) {
                            for (let mt of plainMatches) {
                                let rm = mt.replace(/\s/g, '');
                                if (rm.length >= 4 && rm !== "2023" && rm !== "2024" && rm !== "2025" && rm !== "2026") {
                                    extractedCode = rm;
                                    break;
                                }
                            }
                        }
                    }

                    if (extractedCode) {
                        return { ok: true, type: "code", code: extractedCode, emailDate: msgDate };
                    }
                }

                const extractedCode = extractNetflixTemporaryCode(`${subject}\n${text}\n${html}`);
                if (extractedCode) {
                    return { ok: true, type: "code", code: extractedCode, emailDate: msgDate };
                }

                if (lastFlowFailure && lastFlowFailure.status !== "not_found") {
                    return { ...lastFlowFailure, emailDate: msgDate };
                }
            }

            // 2. FLUJO: CÓDIGO DE INICIO DE SESIÓN
            if (action === "code") {
                const htmlText = cheerio.load(html)("body").text() || "";
                const haystack = `${subject}\n${text}\n${htmlText}`;
                const patterns = [
                    /(?:codigo|c[oó]digo|code)[^0-9]{0,60}([0-9]{4,8})/i,
                    /\b([0-9]{4,8})\b/,
                ];

                for (const pattern of patterns) {
                    const match = haystack.match(pattern);
                    if (match?.[1] && !["2023", "2024", "2025", "2026"].includes(match[1])) {
                        return { ok: true, type: "code", code: match[1], emailDate: msgDate };
                    }
                }
            }

            // 3. FLUJO: APROBAR DISPOSITIVO
            if (action === "approve") {
                const buttonLink = findNetflixButtonLink(
                    html,
                    ["aprobar", "approve"],
                    ["netflix.com/account/approve", "account/approve", "netflix.com/ilum", "/ilum", "ilum?code"]
                ) || findNetflixTextActionLink(text, ["aprobar", "approve"]);

                if (!buttonLink) continue;

                const deviceName = extractApprovalDeviceName(text, html);

                stage = "open_netflix_approve_link";
                const result = await scrapeApproveLink(buttonLink, deviceName);
                if (result.ok || result.status === "expired") {
                    return { ...result, emailDate: msgDate };
                }
                lastFlowFailure = result;
            }
        }

        if (lastFlowFailure) {
            return lastFlowFailure;
        }

        if (sawExpiredMatch) {
            return { ok: false, status: "expired", message: `No se evidencia un correo reciente de Netflix en los ultimos ${maxAgeMinutes} minutos.` };
        }

        if (!sawSenderMatch) {
            return { ok: false, status: "sender_mismatch", message: "No se encontraron correos recientes del remitente configurado." };
        }

        if (!sawTargetMatch) {
            return { ok: false, status: "netflix_flow_miss", message: "No se encontraron correos nuevos de Netflix para el tipo de solicitud seleccionado." };
        }

        if (lastFlowFailure) {
            return lastFlowFailure;
        }

        return { ok: false, status: "netflix_flow_miss", message: "Se detectó el correo de Netflix, pero no se pudo completar el flujo." };

    } catch (err) {
        console.error("[netflixFlowService] error", {
            stage,
            toEmail,
            action,
            message: err?.message || String(err),
            code: err?.code || null,
            imapTlsInsecure: getEnvBool("IMAP_TLS_INSECURE"),
            netflixTlsInsecure: getEnvBool("NETFLIX_TLS_INSECURE"),
        });
        if (isTlsCertificateError(err)) {
            return {
                ok: false,
                status: stage.startsWith("open_netflix_") ? "netflix_tls_error" : "imap_tls_error",
                message: stage.startsWith("open_netflix_")
                    ? `Error TLS abriendo enlace de Netflix durante ${stage}.`
                    : `Error TLS en Gmail IMAP durante ${stage}.`,
            };
        }
        return { ok: false, status: "imap_error", message: err?.message || "Error leyendo correos." };
    } finally {
        if (conn) {
            try { await conn.end(); } catch (_) { }
        }
    }
}

module.exports = {
    fetchNetflixFlow,
    __test: {
        buildApprovalFormSubmission,
        buildAbsoluteUrl,
        isNetflixDirectApprovalUrl,
        findNetflixTextActionLink,
        findApprovalActionLink,
        extractApprovalDeviceName,
        pageLooksApproved,
        pageNeedsApproval,
        pageLooksInvalidApproval,
    },
};
