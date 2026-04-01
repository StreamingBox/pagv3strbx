const pool = require("../db");
let lastCleanupAt = 0;

function ttlMinutes() {
    const raw = Number.parseInt(String(process.env.WHATSAPP_WEBHOOK_DEDUPE_TTL_MIN || "15"), 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 15;
}

async function cleanupExpiredWebhookDedupe() {
    const now = Date.now();
    if (now - lastCleanupAt < 60000) return;
    lastCleanupAt = now;
    await pool.query(
        "DELETE FROM whatsapp_webhook_dedupe WHERE expires_at < NOW() LIMIT 500"
    );
}

async function reserveWebhookEvent({ msgId, fallbackFingerprint, eventName, phone, text }) {
    const normalizedMsgId = msgId ? String(msgId).trim() : "";
    const normalizedFp = fallbackFingerprint ? String(fallbackFingerprint).trim() : "";

    const eventKey = normalizedMsgId
        ? `msg:${normalizedMsgId}`
        : (normalizedFp ? `fp:${normalizedFp}` : "");

    if (!eventKey) {
        return { isDuplicate: false, reason: null, eventKey: null };
    }

    const reason = normalizedMsgId ? "msg_id" : "fingerprint";
    const expiresAtExpr = `DATE_ADD(NOW(), INTERVAL ${ttlMinutes()} MINUTE)`;

    const [insertResult] = await pool.query(
        `INSERT IGNORE INTO whatsapp_webhook_dedupe
            (event_key, msg_id, fingerprint, event_name, phone, message_preview, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ${expiresAtExpr})`,
        [
            eventKey,
            normalizedMsgId || null,
            normalizedFp || null,
            eventName || null,
            phone || null,
            String(text || "").slice(0, 255),
        ]
    );

    return {
        isDuplicate: Number(insertResult?.affectedRows || 0) === 0,
        reason,
        eventKey,
    };
}

module.exports = {
    cleanupExpiredWebhookDedupe,
    reserveWebhookEvent,
};
