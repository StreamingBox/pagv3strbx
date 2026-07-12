const pool = require("../db");
const {
    sendOrderDeliveryEmail,
    sendStockAvailableEmail,
    sendSupportTicketCreatedEmails,
    sendSupportTicketResolvedEmail,
} = require("./mailService");

const DEFAULT_INTERVAL_MS = 15 * 1000;
const STALE_PROCESSING_MINUTES = 5;
let workerRunning = false;

function safeJson(value) {
    try { return JSON.parse(value || "{}"); } catch { return {}; }
}

async function enqueueNotification(conn, { channel = "email", eventType, payload, dedupeKey = null }) {
    if (!eventType) throw new Error("eventType es requerido para la cola de notificaciones.");
    await conn.query(
        `INSERT INTO notification_outbox (channel, event_type, dedupe_key, payload_json)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = id`,
        [channel, eventType, dedupeKey || null, JSON.stringify(payload || {})]
    );
}

async function buildOrderDeliveryPayload(orderId) {
    const [[order]] = await pool.query(
        `SELECT o.id, o.order_code, o.total, o.currency, u.name AS user_name, u.email AS user_email
           FROM orders o
           JOIN users u ON u.id = o.user_id
          WHERE o.id = ?
          LIMIT 1`,
        [orderId]
    );
    if (!order) {
        const error = new Error("La orden de la notificación ya no existe.");
        error.code = "ORDER_MISSING";
        throw error;
    }
    const [items] = await pool.query(
        `SELECT
            s.id AS subscription_id,
            s.expires_at,
            p.name AS platform_name,
            p.slug AS platform_slug,
            p.type AS platform_type,
            p.show_device_rule,
            pa.email AS account_email,
            pa.password AS account_password,
            pa.access_url AS account_access_url,
            pa.pin AS account_pin,
            pa.two_factor_secret AS account_two_factor_secret,
            pa.profile_number AS account_profile,
            cl.token
         FROM order_items oi
         JOIN subscriptions s ON s.id = oi.subscription_id
         JOIN platforms p ON p.id = oi.platform_id
         LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
         LEFT JOIN credential_links cl ON cl.subscription_id = s.id
         WHERE oi.order_id = ?
         ORDER BY oi.id ASC, cl.id DESC`,
        [orderId]
    );
    const bySubscription = new Map();
    for (const row of items) {
        if (!bySubscription.has(row.subscription_id)) bySubscription.set(row.subscription_id, row);
    }
    return {
        to: order.user_email,
        name: order.user_name,
        orderCode: order.order_code,
        total: Number(order.total || 0),
        currency: order.currency || "COP",
        results: [...bySubscription.values()].map((row) => ({
            subscriptionId: row.subscription_id,
            expiresAt: row.expires_at,
            token: row.token,
            purchasedPlatformName: row.platform_name,
            plan: {
                platform_name: row.platform_name,
                platform_slug: row.platform_slug,
                type: row.platform_type,
                show_device_rule: row.show_device_rule,
            },
            account: row.account_email ? {
                email: row.account_email,
                password: row.account_password,
                access_url: row.account_access_url,
                pin: row.account_pin,
                two_factor_secret: row.account_two_factor_secret,
                profile_number: row.account_profile,
            } : null,
        })),
    };
}

async function dispatchNotification(item) {
    const payload = safeJson(item.payload_json);
    if (item.channel === "telegram" && item.event_type === "sale") {
        const { notifySale } = require("./telegramBot");
        await notifySale(payload);
        return { ok: true, delivery: "telegram" };
    }
    if (item.channel === "telegram" && item.event_type === "renewal_sale") {
        const { notifyRenewalSale } = require("./telegramBot");
        await notifyRenewalSale(payload);
        return { ok: true, delivery: "telegram" };
    }
    if (item.event_type === "order_delivery") {
        return sendOrderDeliveryEmail(await buildOrderDeliveryPayload(payload.orderId));
    }
    if (item.event_type === "stock_available") {
        return sendStockAvailableEmail(payload);
    }
    if (item.event_type === "support_created") {
        if (item.channel === "telegram") {
            const { notifySupportTicketCreated } = require("./telegramBot");
            await notifySupportTicketCreated(payload.ticket);
            return { ok: true, delivery: "telegram" };
        }
        return sendSupportTicketCreatedEmails(payload);
    }
    if (item.event_type === "support_resolved") {
        return sendSupportTicketResolvedEmail(payload);
    }
    if (item.event_type === "support_no_stock") {
        const { notifySupportTicketAutoNoStock } = require("./telegramBot");
        await notifySupportTicketAutoNoStock(payload.ticket, payload.masterAccount);
        return { ok: true, delivery: "telegram" };
    }
    throw new Error(`Evento de notificación no soportado: ${item.event_type}`);
}

async function claimNotifications(limit = 10) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query(
            `SELECT *
               FROM notification_outbox
              WHERE (
                    status IN ('pending', 'failed')
                    AND available_at <= UTC_TIMESTAMP()
              ) OR (
                    status = 'processing'
                    AND updated_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${STALE_PROCESSING_MINUTES} MINUTE)
              )
              ORDER BY id ASC
              LIMIT ?
              FOR UPDATE SKIP LOCKED`,
            [Math.max(1, Math.min(50, Number(limit) || 10))]
        );
        if (rows.length) {
            const placeholders = rows.map(() => "?").join(",");
            await conn.query(
                `UPDATE notification_outbox
                    SET status = 'processing', attempts = attempts + 1, last_error = NULL
                  WHERE id IN (${placeholders})`,
                rows.map((row) => row.id)
            );
        }
        await conn.commit();
        return rows;
    } catch (error) {
        await conn.rollback().catch(() => {});
        throw error;
    } finally {
        conn.release();
    }
}

async function markNotificationResult(item, delivery) {
    if (delivery?.ok) {
        await pool.query(
            `UPDATE notification_outbox
                SET status = 'sent', sent_at = UTC_TIMESTAMP(), last_error = NULL
              WHERE id = ?`,
            [item.id]
        );
        return;
    }
    const attempts = Number(item.attempts || 0) + 1;
    const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.min(attempts, 6)));
    await pool.query(
        `UPDATE notification_outbox
            SET status = 'failed',
                available_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE),
                last_error = ?
          WHERE id = ?`,
        [delayMinutes, String(delivery?.message || "No se pudo entregar la notificación.").slice(0, 3000), item.id]
    );
}

async function processNotificationOutbox(limit = 10) {
    if (workerRunning) return { skipped: true };
    workerRunning = true;
    try {
        const items = await claimNotifications(limit);
        for (const item of items) {
            try {
                const delivery = await dispatchNotification(item);
                await markNotificationResult(item, delivery);
            } catch (error) {
                await markNotificationResult(item, { ok: false, message: error?.message || String(error) });
            }
        }
        return { processed: items.length };
    } finally {
        workerRunning = false;
    }
}

function startNotificationOutbox() {
    const interval = Math.max(5000, Number(process.env.NOTIFICATION_OUTBOX_INTERVAL_MS || DEFAULT_INTERVAL_MS));
    processNotificationOutbox().catch(() => {});
    setInterval(() => processNotificationOutbox().catch(() => {}), interval).unref();
}

module.exports = {
    enqueueNotification,
    processNotificationOutbox,
    startNotificationOutbox,
    buildOrderDeliveryPayload,
};
