const { simpleParser } = require("mailparser");
const cheerio = require("cheerio");

const pool = require("../db");
const { connectImapWithTlsFallback, getImapConfig, safeToDate } = require("../utils/imapConfig");
const { getManualTopupById, updateManualTopupStatus } = require("./manualTopups.service");
const { notifyManualTopupAlert } = require("./telegramBot");

let running = false;

function normalizeText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeName(value) {
    return normalizeText(value)
        .toUpperCase()
        .replace(/[^A-Z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function buildMailHaystack(parsed) {
    const subject = normalizeText(parsed?.subject || "");
    const textBody = normalizeText(parsed?.text || "");
    const htmlBody = String(parsed?.html || "");
    let htmlText = "";
    if (htmlBody) {
        try {
            const $ = cheerio.load(htmlBody);
            htmlText = normalizeText($("body").text() || $.text() || "");
        } catch {
            htmlText = "";
        }
    }
    return [subject, textBody, htmlText].filter(Boolean).join("\n");
}

function parseEsCoMoney(value) {
    const cleaned = String(value || "").replace(/[^\d.,]/g, "").trim();
    if (!cleaned) return null;
    if (cleaned.includes(",") && cleaned.includes(".")) {
        return Number(cleaned.replace(/\./g, "").replace(",", "."));
    }
    if (cleaned.includes(",") && !cleaned.includes(".")) {
        return Number(cleaned.replace(",", "."));
    }
    return Number(cleaned.replace(/\./g, ""));
}

function parseSpanishDateTime(raw) {
    const source = normalizeText(raw).toLowerCase();
    const match = source.match(/(\d{1,2}) de ([a-záéíóú]+) de (\d{4}) a las (\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)/i);
    if (!match) return null;

    const months = {
        enero: 0,
        febrero: 1,
        marzo: 2,
        abril: 3,
        mayo: 4,
        junio: 5,
        julio: 6,
        agosto: 7,
        septiembre: 8,
        setiembre: 8,
        octubre: 9,
        noviembre: 10,
        diciembre: 11,
    };

    const day = Number(match[1]);
    const month = months[normalizeText(match[2]).toLowerCase()];
    const year = Number(match[3]);
    let hour = Number(match[4]);
    const minute = Number(match[5]);
    const suffix = match[6].replace(/\s|\./g, "").toLowerCase();

    if (suffix === "pm" && hour < 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    if (!Number.isFinite(month)) return null;

    const date = new Date(year, month, day, hour, minute, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
}

function parseBrebEmail(parsed, attributes = {}) {
    const subject = normalizeText(parsed?.subject || "");
    if (!subject.toLowerCase().includes("recibiste plata por bre-b")) {
        return null;
    }

    const haystack = buildMailHaystack(parsed);
    const match = haystack.match(/Recibiste\s+\$?\s*([0-9.,]+)\s+de\s+(.+?)(?:\s*-\s*|\s+)el\s+(\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}\s+a\s+las\s+\d{1,2}:\d{2}\s*[ap]\.?\s*m\.?)/i);
    if (!match) {
        return {
            uid: String(attributes?.uid || ""),
            subject,
            receivedAt: safeToDate(attributes?.date) || null,
            parsed: false,
            rawText: haystack,
        };
    }

    return {
        uid: String(attributes?.uid || ""),
        subject,
        amount: parseEsCoMoney(match[1]),
        senderName: normalizeName(match[2]),
        senderNameRaw: normalizeText(match[2]),
        receivedAt: parseSpanishDateTime(match[3]) || safeToDate(attributes?.date) || null,
        receivedAtRaw: match[3],
        parsed: true,
        rawText: haystack,
    };
}

function compareNames(expected, received) {
    const lhs = normalizeName(expected);
    const rhs = normalizeName(received);
    if (!lhs || !rhs) return { ok: false, score: 0 };
    if (lhs === rhs) return { ok: true, score: 1 };
    if (lhs.includes(rhs) || rhs.includes(lhs)) return { ok: true, score: 0.9 };

    const leftTokens = lhs.split(" ").filter(Boolean);
    const rightTokens = new Set(rhs.split(" ").filter(Boolean));
    const matched = leftTokens.filter((token) => rightTokens.has(token));
    const score = leftTokens.length ? matched.length / leftTokens.length : 0;
    const strongMatch = matched.some((token) => token.length >= 4);
    return { ok: (score >= 0.6 && matched.length >= 1) || strongMatch, score: strongMatch && score < 0.6 ? 0.6 : score };
}

function compareTimes(expectedDate, receivedDate) {
    const expected = safeToDate(expectedDate);
    const received = safeToDate(receivedDate);
    if (!expected || !received) return { ok: false, minutesDiff: null };
    const diff = Math.abs(received.getTime() - expected.getTime()) / 1000 / 60;
    return { ok: diff <= 90, minutesDiff: Math.round(diff) };
}

async function fetchRecentBrebEmails(limit = 15) {
    const config = getImapConfig();
    if (!config) {
        return { items: [], status: "config_error" };
    }

    let conn;
    try {
        conn = await connectImapWithTlsFallback(config, "brebReconciliation");
        await conn.openBox("INBOX");
        const sinceDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const messages = await conn.search([["SINCE", sinceDate]], { bodies: ["HEADER.FIELDS (SUBJECT DATE FROM)"], markSeen: false });
        if (!messages?.length) return { items: [], status: "ok" };

        messages.sort((a, b) => {
            const da = safeToDate(a?.attributes?.date)?.getTime() ?? 0;
            const db = safeToDate(b?.attributes?.date)?.getTime() ?? 0;
            return db - da;
        });

        const picked = [];
        for (const msg of messages) {
            if (picked.length >= limit) break;
            const headerPart = msg?.parts?.find((part) => part.which.includes("HEADER"));
            const headers = headerPart?.body || {};
            const subject = normalizeText(headers.subject?.[0] || "");
            if (!subject.toLowerCase().includes("recibiste plata por bre-b")) continue;
            const full = await conn.search([["UID", msg.attributes.uid]], { bodies: [""], markSeen: false });
            const raw = full?.[0]?.parts?.find((part) => part.which === "");
            if (!raw?.body) continue;
            const parsed = await simpleParser(raw.body);
            picked.push(parseBrebEmail(parsed, msg.attributes));
        }
        return { items: picked.filter(Boolean), status: "ok" };
    } catch (err) {
        console.error("[breb] Error leyendo correos:", err?.message || err);
        return { items: [], status: "imap_error" };
    } finally {
        if (conn) {
            try { await conn.end(); } catch { }
        }
    }
}

async function saveValidationResult(id, payload) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(payload || {})) {
        fields.push(`${key} = ?`);
        values.push(value);
    }
    fields.push("last_auto_checked_at = UTC_TIMESTAMP()");
    await pool.query(`UPDATE manual_topup_requests SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
}

async function findBestEmailForRequest(request) {
    const result = await fetchRecentBrebEmails(20);
    const emails = Array.isArray(result?.items) ? result.items : [];
    if (!emails.length) {
        if (result?.status === "config_error") {
            return { email: null, reason: "No hay conexión IMAP configurada para leer los correos de Bre-B." };
        }
        if (result?.status === "imap_error") {
            return { email: null, reason: "Hubo un error leyendo el buzón de Bre-B y la recarga quedó para validación manual." };
        }
        return { email: null, reason: "No se encontró un correo reciente de Bre-B." };
    }

    const [usedRows] = await pool.query(
        `SELECT matched_email_uid
         FROM manual_topup_requests
         WHERE matched_email_uid IS NOT NULL AND matched_email_uid <> ''`
    );
    const used = new Set(usedRows.map((row) => String(row.matched_email_uid || "")).filter(Boolean));

    const expectedAmount = Number(request.amount || 0);
    const expectedName = request.payerName || "";
    const expectedDate = request.declaredPaidAt || null;

    let best = null;
    let bestReason = "No hubo coincidencia exacta con monto, nombre y hora.";

    for (const email of emails) {
        if (!email?.parsed || used.has(String(email.uid || ""))) continue;
        if (Number(email.amount || 0) !== expectedAmount) continue;

        const nameMatch = compareNames(expectedName, email.senderName);
        const timeMatch = compareTimes(expectedDate, email.receivedAt);

        if (nameMatch.ok && timeMatch.ok) {
            return { email, reason: "Coincidencia automática Bre-B." };
        }

        if (!best) {
            best = email;
            const reasons = [];
            if (!nameMatch.ok) reasons.push("el nombre no coincide");
            if (!timeMatch.ok) reasons.push("la hora no coincide");
            bestReason = reasons.length ? `Se encontró un correo con el monto correcto pero ${reasons.join(" y ")}.` : bestReason;
        }
    }

    return { email: null, reason: bestReason, candidate: best };
}

async function attemptAutoReconcileManualTopup(id) {
    const request = await getManualTopupById(id);
    if (!request) return null;
    if (String(request.status || "").toLowerCase() !== "submitted") return request;
    if (String(request.methodKey || "").toLowerCase() !== "breb") return request;
    if (String(request.currency || "").toUpperCase() !== "COP") return request;

    const { email, reason, candidate } = await findBestEmailForRequest(request);

    if (!email) {
        const shouldNotify = request.autoValidationStatus !== "manual_review" || String(request.autoValidationNote || "") !== String(reason || "");
        await saveValidationResult(id, {
            auto_validation_status: "manual_review",
            auto_validation_note: reason,
        });
        const updated = await getManualTopupById(id);
        if (shouldNotify) {
            await notifyManualTopupAlert(updated, {
                title: "Bre-B requiere validación manual",
                note: reason,
            });
        }
        return updated;
    }

    await saveValidationResult(id, {
        auto_validation_status: "matched",
        auto_validation_note: reason,
        matched_email_uid: email.uid || null,
        matched_email_subject: email.subject || null,
        matched_sender_name: email.senderNameRaw || email.senderName || null,
        matched_email_amount: Number(email.amount || 0),
        matched_email_received_at: email.receivedAt || null,
    });

    const approved = await updateManualTopupStatus({
        id,
        status: "approved",
        adminUserId: null,
        adminNote: `Aprobada automáticamente por Bre-B. Remitente: ${email.senderNameRaw || email.senderName}. Hora: ${email.receivedAtRaw || ""}`.trim(),
    });

    await saveValidationResult(id, {
        auto_validation_status: "auto_approved",
        auto_validation_note: "Aprobada automáticamente por coincidencia Bre-B.",
        matched_email_uid: email.uid || null,
        matched_email_subject: email.subject || null,
        matched_sender_name: email.senderNameRaw || email.senderName || null,
        matched_email_amount: Number(email.amount || 0),
        matched_email_received_at: email.receivedAt || null,
    });

    await notifyManualTopupAlert(approved, {
        title: "Bre-B validado automáticamente",
        note: `Coincidió con ${email.senderNameRaw || email.senderName} por ${Number(email.amount || 0).toLocaleString("es-CO")} COP.`,
    });
    return approved;
}

async function processPendingBrebTopups() {
    if (running) return;
    running = true;
    try {
        const [rows] = await pool.query(
            `SELECT id
             FROM manual_topup_requests
             WHERE status = 'submitted'
               AND method_key = 'breb'
               AND currency = 'COP'
               AND (auto_validation_status IS NULL OR auto_validation_status IN ('pending', 'manual_review'))
             ORDER BY id DESC
             LIMIT 25`
        );

        for (const row of rows) {
            try {
                await attemptAutoReconcileManualTopup(Number(row.id));
            } catch (err) {
                console.error(`[breb] Error conciliando recarga ${row.id}:`, err?.message || err);
            }
        }
    } finally {
        running = false;
    }
}

module.exports = {
    attemptAutoReconcileManualTopup,
    processPendingBrebTopups,
};
