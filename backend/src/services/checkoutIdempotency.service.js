const crypto = require("crypto");
const pool = require("../db");

const STALE_PENDING_SECONDS = 180;

function normalizeIdempotencyKey(value) {
    const key = String(value || "").trim();
    if (!key) return null;
    if (key.length < 12 || key.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
        const error = new Error("La clave de compra no es valida. Actualiza la pagina e intenta nuevamente.");
        error.status = 400;
        throw error;
    }
    return key;
}

function requestHash(payload) {
    return crypto.createHash("sha256").update(JSON.stringify(payload || {})).digest("hex");
}

function replayResponse(row, wallet) {
    const stored = (() => {
        try { return JSON.parse(row.response_json || "{}"); } catch { return {}; }
    })();
    return {
        ok: true,
        replayed: true,
        orderId: Number(stored.orderId || row.order_id || 0),
        orderCode: stored.orderCode || row.order_code || null,
        count: Number(stored.count || 0),
        total: Number(stored.total || 0),
        currency: stored.currency || wallet?.currency || "COP",
        deliveryMessage: "Esta compra ya fue procesada. Consulta Historial de Compras para ver las credenciales.",
        wallet: wallet ? {
            balance: Number(wallet.balance || 0),
            profit_total: Number(wallet.profit_total || 0),
            currency: wallet.currency || stored.currency || "COP",
        } : undefined,
    };
}

async function reserveCheckoutIdempotency({ userId, key, payload }) {
    const idempotencyKey = normalizeIdempotencyKey(key);
    if (!idempotencyKey) return null;

    const hash = requestHash(payload);
    try {
        const [insert] = await pool.query(
            `INSERT INTO checkout_idempotency (user_id, idempotency_key, request_hash, status)
             VALUES (?, ?, ?, 'pending')`,
            [userId, idempotencyKey, hash]
        );
        return { id: insert.insertId, key: idempotencyKey, requestHash: hash };
    } catch (error) {
        if (error?.code !== "ER_DUP_ENTRY") throw error;
    }

    const [[existing]] = await pool.query(
        `SELECT id, request_hash, status, order_id, order_code, response_json, updated_at
           FROM checkout_idempotency
          WHERE user_id = ? AND idempotency_key = ?
          LIMIT 1`,
        [userId, idempotencyKey]
    );
    if (!existing) {
        const error = new Error("No se pudo reservar la compra. Intenta nuevamente.");
        error.status = 409;
        throw error;
    }
    if (existing.request_hash !== hash) {
        const error = new Error("La misma clave de compra fue usada con un carrito diferente. Recarga la pagina antes de continuar.");
        error.status = 409;
        throw error;
    }
    if (existing.status === "completed") {
        const [[wallet]] = await pool.query(
            "SELECT balance, profit_total, currency FROM wallets WHERE user_id = ? LIMIT 1",
            [userId]
        );
        return { replay: replayResponse(existing, wallet), id: existing.id, key: idempotencyKey, requestHash: hash };
    }

    const [claim] = await pool.query(
        `UPDATE checkout_idempotency
            SET status = 'pending', updated_at = UTC_TIMESTAMP()
          WHERE id = ?
            AND (
                status = 'failed'
                OR updated_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND)
            )`,
        [existing.id, STALE_PENDING_SECONDS]
    );
    if (!claim.affectedRows) {
        const pending = new Error("Tu compra ya se esta procesando. Espera unos segundos antes de volver a intentarlo.");
        pending.status = 409;
        pending.code = "CHECKOUT_IN_PROGRESS";
        throw pending;
    }
    return { id: existing.id, key: idempotencyKey, requestHash: hash };
}

async function completeCheckoutIdempotency(conn, reservation, result) {
    if (!reservation?.id) return;
    const safeResponse = {
        orderId: result.orderId,
        orderCode: result.orderCode,
        count: result.count,
        total: result.total,
        currency: result.currency,
    };
    await conn.query(
        `UPDATE checkout_idempotency
            SET status = 'completed', order_id = ?, order_code = ?, response_json = ?, completed_at = UTC_TIMESTAMP()
          WHERE id = ? AND status = 'pending'`,
        [result.orderId, result.orderCode, JSON.stringify(safeResponse), reservation.id]
    );
}

async function failCheckoutIdempotency(reservation) {
    if (!reservation?.id) return;
    await pool.query(
        `UPDATE checkout_idempotency
            SET status = 'failed'
          WHERE id = ? AND status = 'pending'`,
        [reservation.id]
    ).catch(() => {});
}

module.exports = {
    reserveCheckoutIdempotency,
    completeCheckoutIdempotency,
    failCheckoutIdempotency,
    normalizeIdempotencyKey,
    requestHash,
};
