// BACKEND: pagv2strbx/src/services/gmailCodeService.js
const { simpleParser } = require("mailparser");
const cheerio = require("cheerio");
const {
    getImapConfig,
    safeToDate,
    getEnvBool,
    connectImapWithTlsFallback,
    isTlsCertificateError,
    isImapAuthenticationError,
    isImapTimeoutError,
    getImapAuthenticationMessage,
} = require("../utils/imapConfig");
const { extractFallbackCode } = require("../utils/codeExtraction");
const {
    DISNEY_CODE_WINDOW_MINUTES,
    extractDisneyOtpCode,
    isDisneyLoginNotice,
    isDisneyOtpSubject,
    isDisneySender,
} = require("./disneyCodePolicy");

function minutesAgoToSinceDate(maxAgeMinutes) {
    // Retrocedemos 24 horas para garantizar la captura de los últimos mensajes con SINCE, mitigando problemas de Timezone
    return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function normalizeWhitespace(value) {
    return String(value || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function buildHaystack(parsed) {
    const subject = normalizeWhitespace(parsed?.subject || "");
    const textBody = normalizeWhitespace(parsed?.text || "");
    const htmlBody = String(parsed?.html || "").replace(/\u00A0/g, " ");

    let htmlText = "";
    if (htmlBody) {
        try {
            const $ = cheerio.load(htmlBody);
            htmlText = normalizeWhitespace($("body").text() || $.text() || "");
        } catch {
            htmlText = "";
        }
    }

    return [subject, textBody, htmlText, htmlBody]
        .filter(Boolean)
        .join("\n");
}

/**
 * Busca en INBOX códigos recientes.
 * - Primero intenta con TO (si se pasa).
 * - Si no encuentra nada, fallback sin TO (Gmail a veces no llena TO en IMAP).
 * - Filtra por FROM contains.
 * - Verifica antigüedad <= maxAgeMinutes.
 * - Extrae código con regex (grupo 1), buscando en subject + body.
 */
async function fetchCodeFromGmail({ toEmail, gmailFromContains, codeRegex, maxAgeMinutes }) {
    const config = getImapConfig();
    if (!config) {
        return {
            ok: false,
            status: "config_error",
            message: "Faltan variables GMAIL_EMAIL o GMAIL_IMAP_PASS en el servidor.",
        };
    }

    const maxMin = Number(maxAgeMinutes) || 15;
    const sinceDate = minutesAgoToSinceDate(maxMin);

    const fetchOptions = { bodies: [""], markSeen: false };
    const fromNeedle = String(gmailFromContains || "").toLowerCase().trim();

    let re;
    try {
        re = new RegExp(codeRegex, "i");
    } catch (e) {
        return {
            ok: false,
            status: "config_error",
            message: "Regex inválida (code_regex).",
        };
    }

    let conn;
    let stage = "connect";
    try {
        conn = await connectImapWithTlsFallback(config, "gmailCodeService");
        stage = "open_box";
        await conn.openBox("INBOX");

        // 1) SINCE + TO (si existe)
        stage = "search_headers";
        let criteria = [["SINCE", sinceDate]];
        if (toEmail && String(toEmail).trim()) {
            criteria.push(["TO", String(toEmail).trim()]);
        }

        const headerOptions = { bodies: ["HEADER.FIELDS (FROM TO SUBJECT DATE)"], markSeen: false };

        let messages = await conn.search(criteria, headerOptions);

        // 2) Fallback SINCE solo
        if (!messages || messages.length === 0) {
            stage = "search_headers_fallback";
            messages = await conn.search([["SINCE", sinceDate]], headerOptions);
        }

        if (!messages || messages.length === 0) {
            return {
                ok: false,
                status: "mailbox_empty",
                message: "No hay correos recientes para buscar código.",
            };
        }

        // más nuevo primero
        messages.sort((a, b) => {
            const da = safeToDate(a?.attributes?.date)?.getTime() ?? 0;
            const db = safeToDate(b?.attributes?.date)?.getTime() ?? 0;
            return db - da;
        });

        let sawAnyFromMatch = false;
        let sawExpiredFromMatch = false;

        for (const msg of messages) {
            const msgDate = safeToDate(msg?.attributes?.date);
            if (!msgDate) continue;

            const ageMin = (Date.now() - msgDate.getTime()) / 1000 / 60;

            // Revisar header
            const headerPart = msg?.parts?.find(p => p.which.includes("HEADER"));
            const headers = headerPart?.body || {};

            const fromField = (headers.from && headers.from[0]) ? String(headers.from[0]).toLowerCase() : "";

            const fromLooksOkByHeader = !fromNeedle || fromField.includes(fromNeedle);

            if (ageMin > maxMin) {
                if (fromLooksOkByHeader) sawExpiredFromMatch = true;
                continue;
            }

            if (!fromLooksOkByHeader) continue;

            sawAnyFromMatch = true;

            // Encontrado: descargar cuerpo
            stage = "fetch_full_message";
            const fetchFull = await conn.search([["UID", msg.attributes.uid]], { bodies: [""], markSeen: false });
            if (!fetchFull || !fetchFull[0]) continue;

            const raw = fetchFull[0].parts?.find(p => p.which === "");
            if (!raw?.body) continue;

            stage = "parse_message";
            const parsed = await simpleParser(raw.body);

            // Buscamos en subject + text + texto limpio del html + html crudo.
            const haystack = buildHaystack(parsed);
            const m = haystack.match(re);

            if (m?.[1]) {
                return { ok: true, code: m[1], emailDate: msgDate };
            }

            const fallbackCode = extractFallbackCode(haystack);
            if (fallbackCode) {
                return { ok: true, code: fallbackCode, emailDate: msgDate };
            }
        }

        // fuera del for: conclusiones
        if (sawExpiredFromMatch && !sawAnyFromMatch) {
            return {
                ok: false,
                status: "expired",
                message: `No se evidencia un correo reciente con el codigo en los ultimos ${maxMin} minutos.`,
            };
        }

        if (!sawAnyFromMatch) {
            return {
                ok: false,
                status: "sender_mismatch",
                message: "No se encontraron correos recientes del remitente configurado.",
            };
        }

        return {
            ok: false,
            status: "regex_mismatch",
            message: "No se pudo extraer el código (regex no coincidió).",
        };
    } catch (err) {
        console.error("[gmailCodeService] error", {
            stage,
            toEmail,
            gmailFromContains,
            message: err?.message || String(err),
            code: err?.code || null,
            imapTlsInsecure: getEnvBool("IMAP_TLS_INSECURE"),
        });
        if (isTlsCertificateError(err)) {
            return {
                ok: false,
                status: "imap_tls_error",
                message: `Error TLS en Gmail IMAP durante ${stage}.`,
            };
        }
        if (isImapAuthenticationError(err)) {
            return {
                ok: false,
                status: "imap_auth_error",
                message: getImapAuthenticationMessage(),
            };
        }
        if (isImapTimeoutError(err)) {
            return {
                ok: false,
                status: "imap_timeout",
                message: "El buzón de códigos no respondió a tiempo. Intenta nuevamente en unos segundos.",
            };
        }
        return {
            ok: false,
            status: "imap_error",
            message: err?.message || "Error conectando/leyendo Gmail (IMAP).",
        };
    } finally {
        if (conn) {
            try {
                await conn.end();
            } catch (_) { }
        }
    }
}

async function fetchDisneyCodeFromGmail({ toEmail, gmailFromContains, purchasedAt }) {
    const config = getImapConfig();
    if (!config) {
        return {
            ok: false,
            status: "config_error",
            message: "Faltan variables GMAIL_EMAIL o GMAIL_IMAP_PASS en el servidor.",
        };
    }

    const purchaseDate = safeToDate(purchasedAt);
    if (!purchaseDate) {
        return {
            ok: false,
            status: "purchase_time_unavailable",
            message: "No se pudo validar la fecha de compra. Contacta a Soporte para revisar tu acceso.",
        };
    }

    const sinceDate = new Date(purchaseDate.getTime() - 24 * 60 * 60 * 1000);
    const targetEmail = String(toEmail || "").trim().toLowerCase();
    const fromNeedle = String(gmailFromContains || "disneyplus.com").toLowerCase().trim();
    const fetchOptions = { bodies: ["HEADER.FIELDS (FROM TO SUBJECT DATE)"], markSeen: false };
    let conn;
    let stage = "connect";

    try {
        conn = await connectImapWithTlsFallback(config, "disneyCodeService");
        stage = "open_box";
        await conn.openBox("INBOX");

        stage = "search_headers";
        let matchedToSearch = false;
        let messages = await conn.search(
            targetEmail ? [["SINCE", sinceDate], ["TO", targetEmail]] : [["SINCE", sinceDate]],
            fetchOptions
        );
        if (messages?.length) matchedToSearch = Boolean(targetEmail);

        if (!messages || messages.length === 0) {
            stage = "search_headers_fallback";
            messages = await conn.search([["SINCE", sinceDate]], fetchOptions);
        }
        if (!messages || messages.length === 0) {
            return {
                ok: false,
                status: "disney_code_not_found",
                message: `No apareció un correo reciente de Disney con el código. Puedes volver a intentar dentro de los ${DISNEY_CODE_WINDOW_MINUTES} minutos de la compra.`,
            };
        }

        messages.sort((a, b) => {
            const first = safeToDate(a?.attributes?.date)?.getTime() ?? 0;
            const second = safeToDate(b?.attributes?.date)?.getTime() ?? 0;
            return second - first;
        });

        const inspected = [];
        const now = Date.now();
        for (const msg of messages) {
            const messageDate = safeToDate(msg?.attributes?.date);
            if (!messageDate || messageDate < purchaseDate || messageDate.getTime() > now) continue;

            const headerPart = msg?.parts?.find((part) => String(part.which || "").includes("HEADER"));
            const headers = headerPart?.body || {};
            const fromHeader = Array.isArray(headers.from) ? headers.from.join(" ") : String(headers.from || "");
            const toHeader = Array.isArray(headers.to) ? headers.to.join(" ") : String(headers.to || "");
            const normalizedFrom = fromHeader.toLowerCase();
            if (!isDisneySender(fromHeader) || (fromNeedle && !normalizedFrom.includes(fromNeedle))) continue;

            stage = "fetch_full_message";
            const fullMessages = await conn.search([["UID", msg.attributes.uid]], { bodies: [""], markSeen: false });
            const raw = fullMessages?.[0]?.parts?.find((part) => part.which === "");
            if (!raw?.body) continue;

            stage = "parse_message";
            const parsed = await simpleParser(raw.body);
            const parsedFrom = (parsed?.from?.value || []).map((entry) => entry.address || "").join(" ") || fromHeader;
            const parsedTo = (parsed?.to?.value || []).map((entry) => entry.address || "").join(" ") || toHeader;
            if (!isDisneySender(parsedFrom)) continue;
            if (fromNeedle && !parsedFrom.toLowerCase().includes(fromNeedle)) continue;
            if (targetEmail && parsedTo && !parsedTo.toLowerCase().includes(targetEmail)) continue;
            if (targetEmail && !matchedToSearch && !parsedTo.toLowerCase().includes(targetEmail)) continue;

            inspected.push({ parsed, messageDate });
        }

        if (inspected.some(({ parsed }) => isDisneyLoginNotice(parsed))) {
            return {
                ok: false,
                status: "device_already_entered",
                message: "Disney notificó un nuevo inicio de sesión para esta cuenta. No entregamos el código para otro dispositivo; contacta a Soporte para revisar el acceso.",
            };
        }

        const otpMessages = inspected.filter(({ parsed }) => isDisneyOtpSubject(parsed?.subject));
        for (const { parsed, messageDate } of otpMessages) {
            const code = extractDisneyOtpCode(parsed);
            if (code) return { ok: true, code, emailDate: messageDate };
        }

        return {
            ok: false,
            status: otpMessages.length ? "regex_mismatch" : "disney_code_not_found",
            message: otpMessages.length
                ? "El correo de Disney no tenía un código reconocible. Contacta a Soporte para revisar tu acceso."
                : `No apareció un correo reciente de Disney con el código. Puedes volver a intentar dentro de los ${DISNEY_CODE_WINDOW_MINUTES} minutos de la compra.`,
        };
    } catch (err) {
        console.error("[disneyCodeService] error", {
            stage,
            message: err?.message || String(err),
            code: err?.code || null,
            imapTlsInsecure: getEnvBool("IMAP_TLS_INSECURE"),
        });
        if (isTlsCertificateError(err)) {
            return { ok: false, status: "imap_tls_error", message: `Error TLS en Gmail IMAP durante ${stage}.` };
        }
        if (isImapAuthenticationError(err)) {
            return { ok: false, status: "imap_auth_error", message: getImapAuthenticationMessage() };
        }
        if (isImapTimeoutError(err)) {
            return { ok: false, status: "imap_timeout", message: "El buzón de códigos no respondió a tiempo. Intenta nuevamente en unos segundos." };
        }
        return { ok: false, status: "imap_error", message: "No se pudo revisar el buzón de Disney. Contacta a Soporte si el problema continúa." };
    } finally {
        if (conn) {
            try {
                await conn.end();
            } catch (_) { }
        }
    }
}

module.exports = { fetchCodeFromGmail, fetchDisneyCodeFromGmail };
