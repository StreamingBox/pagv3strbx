const pool = require("../db");

let lastSentTime = 0;
let isProcessing = false;
const QUEUE_DELAY = 60000;
const QUEUE_POLL_INTERVAL = 30000;
let pausedUntil = 0;

function normalizePhone(phone) {
    const compact = String(phone || "").replace(/\s+/g, "");
    if (!compact) return "";
    return compact.startsWith("+") ? compact : `+${compact}`;
}

function safeJsonString(value, max = 60000) {
    try {
        const raw = JSON.stringify(value ?? {});
        return raw.length <= max ? raw : raw.slice(0, max);
    } catch {
        return JSON.stringify({ error: "json_stringify_failed" });
    }
}

function extractWaResult(data) {
    const payload = data?.data && typeof data.data === "object" ? data.data : data;
    const msgId = payload?.msgId || payload?.id || null;
    const statusCode = Number(payload?.status);
    return {
        msgId: msgId ? String(msgId) : null,
        statusCode: Number.isFinite(statusCode) ? statusCode : null,
    };
}

function mapWaStatus(statusCode) {
    if (!Number.isFinite(statusCode)) return null;
    switch (statusCode) {
        case 0: return "error";
        case 1: return "pending";
        case 2: return "sent";
        case 3: return "delivered";
        case 4: return "read";
        case 5: return "played";
        default: return null;
    }
}

async function updateTraceResult({
    traceId,
    ok,
    errorMessage = null,
    providerData = null,
    eventName = "send-message",
    sentAt = true,
}) {
    const { msgId, statusCode } = extractWaResult(providerData);
    const statusLabel = mapWaStatus(statusCode);

    await pool.query(
        `UPDATE whatsapp_queue
         SET status = ?,
             error_message = ?,
             sent_at = CASE WHEN ? THEN NOW() ELSE sent_at END,
             wasender_msg_id = COALESCE(?, wasender_msg_id),
             wa_status_code = COALESCE(?, wa_status_code),
             wa_status_label = COALESCE(?, wa_status_label),
             wa_event = ?,
             provider_response_json = ?,
             attempts = attempts + 1
         WHERE id = ?`,
        [
            ok ? "sent" : "failed",
            ok ? null : (errorMessage || "Error enviando mensaje"),
            sentAt ? 1 : 0,
            msgId,
            statusCode,
            statusLabel,
            eventName,
            safeJsonString(providerData),
            traceId,
        ]
    );
}

async function createTrace({
    phone,
    message,
    status = "pending",
    source = "queue",
    createdByUserId = null,
    createdByRole = null,
}) {
    const cleanPhone = normalizePhone(phone);
    const [ins] = await pool.query(
        `INSERT INTO whatsapp_queue
         (phone, message, status, source, created_by_user_id, created_by_role)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [cleanPhone, String(message || ""), status, source, createdByUserId, createdByRole]
    );
    return ins.insertId;
}

async function processWhatsAppQueue() {
    if (isProcessing) return;
    if (Date.now() < pausedUntil) return;
    isProcessing = true;

    try {
        const now = Date.now();
        if (now - lastSentTime < QUEUE_DELAY) {
            isProcessing = false;
            return;
        }

        const [rows] = await pool.query(
            "SELECT id, phone, message FROM whatsapp_queue WHERE status = 'pending' AND source <> 'direct_api' ORDER BY id ASC LIMIT 1"
        );

        if (!rows.length) {
            isProcessing = false;
            return;
        }

        const job = rows[0];

        const [[tokenRow]] = await pool.query(
            "SELECT setting_value FROM app_settings WHERE setting_key = 'wasender_token'"
        );

        if (!tokenRow?.setting_value) {
            await updateTraceResult({
                traceId: job.id,
                ok: false,
                errorMessage: "Token no configurado",
                providerData: { error: "missing_token" },
            });
            lastSentTime = Date.now();
            isProcessing = false;
            return;
        }

        const response = await fetch("https://www.wasenderapi.com/api/send-message", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${tokenRow.setting_value}`,
            },
            body: JSON.stringify({ to: job.phone, text: job.message }),
        });

        const data = await response.json().catch(() => ({}));
        const ok = response.ok && data?.success !== false;

        if (!ok) {
            const errorMsg = data?.message || data?.error || `API Error (${response.status})`;
            await updateTraceResult({
                traceId: job.id,
                ok: false,
                errorMessage: errorMsg,
                providerData: data,
            });
        } else {
            await updateTraceResult({
                traceId: job.id,
                ok: true,
                providerData: data,
            });
        }

        lastSentTime = Date.now();
    } catch (e) {
        console.error("Error en cola de WhatsApp:", e.message);
        if (e?.code === "ER_USER_LIMIT_REACHED") {
            // Backoff fuerte para no seguir agotando cuota por hora.
            pausedUntil = Date.now() + (20 * 60 * 1000);
        }
    } finally {
        isProcessing = false;
    }
}

setInterval(processWhatsAppQueue, QUEUE_POLL_INTERVAL);

async function addToQueue(phone, message, meta = {}) {
    return createTrace({
        phone,
        message,
        status: "pending",
        source: meta.source || "queue",
        createdByUserId: meta.createdByUserId ?? null,
        createdByRole: meta.createdByRole ?? null,
    });
}

async function updateTraceByMsgId(msgId, update = {}) {
    if (!msgId) return { affectedRows: 0 };

    const statusCode = Number(update.statusCode);
    const hasStatusCode = Number.isFinite(statusCode);
    const statusLabel = hasStatusCode ? mapWaStatus(statusCode) : null;
    const providerData = safeJsonString(update.providerData || {});
    const sentAt = ["sent", "delivered", "read", "played"].includes(statusLabel || "");

    const [result] = await pool.query(
        `UPDATE whatsapp_queue
         SET wa_status_code = COALESCE(?, wa_status_code),
             wa_status_label = COALESCE(?, wa_status_label),
             wa_event = COALESCE(?, wa_event),
             provider_response_json = ?,
             status = CASE
                 WHEN ? IN ('error') THEN 'failed'
                 WHEN ? IN ('pending') THEN 'pending'
                 WHEN ? IN ('sent','delivered','read','played') THEN 'sent'
                 ELSE status
             END,
             sent_at = CASE WHEN ? THEN COALESCE(sent_at, NOW()) ELSE sent_at END,
             error_message = CASE WHEN ? IN ('error') THEN COALESCE(?, error_message) ELSE error_message END
         WHERE wasender_msg_id = ?`,
        [
            hasStatusCode ? statusCode : null,
            statusLabel,
            update.eventName || null,
            providerData,
            statusLabel,
            statusLabel,
            statusLabel,
            sentAt ? 1 : 0,
            statusLabel,
            update.errorMessage || null,
            String(msgId),
        ]
    );
    return { affectedRows: result.affectedRows || 0 };
}

module.exports = {
    addToQueue,
    createTrace,
    updateTraceResult,
    updateTraceByMsgId,
    mapWaStatus,
};
