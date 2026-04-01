// BACKEND: pagv2strbx/src/services/gmailCodeService.js
const { simpleParser } = require("mailparser");
const cheerio = require("cheerio");
const { getImapConfig, safeToDate, getEnvBool, connectImapWithTlsFallback, isTlsCertificateError } = require("../utils/imapConfig");

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

function extractFallbackCode(haystack) {
    const patterns = [
        /(?:tu\s+código\s+de\s+chatgpt\s+es|your\s+chatgpt\s+code\s+is)[^0-9]{0,30}([0-9]{6})/i,
        /(?:introduce|enter)\s+(?:este|this)?\s*temporary\s*verification\s*code[^0-9]{0,30}([0-9]{6})/i,
        /(?:código|codigo)\s+de\s+verificación[^0-9]{0,40}([0-9]{4,8})/i,
        /verification\s+code\s+is[^0-9]{0,20}([0-9]{4,8})/i,
        /verification\s+code[^0-9]{0,20}([0-9]{4,8})/i,
    ];

    for (const pattern of patterns) {
        const match = String(haystack || "").match(pattern);
        if (match?.[1]) return match[1];
    }

    return null;
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
                message: `El correo del código está vencido (más de ${maxMin} minutos).`,
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

module.exports = { fetchCodeFromGmail };
