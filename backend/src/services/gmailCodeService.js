// BACKEND: pagv2strbx/src/services/gmailCodeService.js
const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");
const { getImapConfig, safeToDate } = require("../utils/imapConfig");

function minutesAgoToSinceDate(maxAgeMinutes) {
    const ms = (Number(maxAgeMinutes) || 15) * 60 * 1000;
    const d = new Date(Date.now() - ms);
    // SINCE filtra por día (no minutos exactos)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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
    try {
        conn = await imaps.connect(config);
        await conn.openBox("INBOX");

        // 1) SINCE + TO (si existe)
        let criteria = [["SINCE", sinceDate]];
        if (toEmail && String(toEmail).trim()) {
            criteria.push(["TO", String(toEmail).trim()]);
        }

        const headerOptions = { bodies: ["HEADER.FIELDS (FROM TO SUBJECT DATE)"], markSeen: false };

        let messages = await conn.search(criteria, headerOptions);

        // 2) Fallback SINCE solo
        if (!messages || messages.length === 0) {
            messages = await conn.search([["SINCE", sinceDate]], headerOptions);
        }

        if (!messages || messages.length === 0) {
            return {
                ok: false,
                status: "not_found",
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
            const fetchFull = await conn.search([["UID", msg.attributes.uid]], { bodies: [""], markSeen: false });
            if (!fetchFull || !fetchFull[0]) continue;

            const raw = fetchFull[0].parts?.find(p => p.which === "");
            if (!raw?.body) continue;

            const parsed = await simpleParser(raw.body);

            // ✅ Buscamos en subject + text + html
            const subject = String(parsed.subject || "").replace(/\u00A0/g, " ");
            const textBody = String(parsed.text || "").replace(/\u00A0/g, " ");
            const htmlBody = String(parsed.html || "").replace(/\u00A0/g, " ");

            const haystack = `${subject}\n${textBody}\n${htmlBody}`;
            const m = haystack.match(re);

            if (m?.[1]) {
                return { ok: true, code: m[1], emailDate: msgDate };
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
                status: "not_found",
                message: "No se encontraron correos recientes del remitente configurado.",
            };
        }

        return {
            ok: false,
            status: "not_found",
            message: "No se pudo extraer el código (regex no coincidió).",
        };
    } catch (err) {
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
