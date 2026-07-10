const pool = require("../db");

const RESERVATION_SECONDS = 35;

function normalizeAction(value) {
    return String(value || "code").trim().toLowerCase().slice(0, 32) || "code";
}

async function reserveCodeRequest({
    orderId,
    platformSlug,
    action,
    credentialFingerprint,
    resetMarker = 0,
    allowCompletedReuse = false,
}) {
    const normalizedOrderId = Number(orderId);
    const normalizedPlatform = String(platformSlug || "").trim().toLowerCase();
    const normalizedFingerprint = String(credentialFingerprint || "").trim();
    if (!Number.isInteger(normalizedOrderId) || normalizedOrderId <= 0 || !normalizedPlatform || !normalizedFingerprint) {
        throw new Error("No se pudo reservar la solicitud de codigo.");
    }

    const params = [
        normalizedOrderId,
        normalizedPlatform,
        normalizeAction(action),
        normalizedFingerprint,
        Number(resetMarker || 0),
    ];
    try {
        const [insert] = await pool.query(
            `INSERT INTO code_request_reservations
                (order_id, platform_slug, action, credential_fingerprint, reset_marker, status, expires_at)
             VALUES (?, ?, ?, ?, ?, 'pending', DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${RESERVATION_SECONDS} SECOND))`,
            params
        );
        return { id: insert.insertId };
    } catch (error) {
        if (error?.code !== "ER_DUP_ENTRY") throw error;
    }

    const [[existing]] = await pool.query(
        `SELECT id, status, expires_at
           FROM code_request_reservations
          WHERE order_id = ?
            AND platform_slug = ?
            AND action = ?
            AND credential_fingerprint = ?
            AND reset_marker = ?
          LIMIT 1`,
        params
    );
    if (!existing) {
        const error = new Error("No se pudo reservar la solicitud de codigo. Intenta nuevamente.");
        error.status = 409;
        throw error;
    }

    if (existing.status === "pending" && new Date(existing.expires_at).getTime() > Date.now()) {
        return { inProgress: true };
    }
    if (existing.status === "completed" && !allowCompletedReuse) {
        return { completed: true };
    }

    const [claim] = await pool.query(
        `UPDATE code_request_reservations
            SET status = 'pending',
                expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${RESERVATION_SECONDS} SECOND)
          WHERE id = ?
            AND (
                status = 'failed'
                OR status = 'completed'
                OR expires_at <= UTC_TIMESTAMP()
            )`,
        [existing.id]
    );
    if (!claim.affectedRows) return { inProgress: true };
    return { id: existing.id };
}

async function finishCodeRequestReservation(reservation, status) {
    if (!reservation?.id) return;
    const finalStatus = status === "completed" ? "completed" : "failed";
    await pool.query(
        `UPDATE code_request_reservations
            SET status = ?, expires_at = UTC_TIMESTAMP()
          WHERE id = ? AND status = 'pending'`,
        [finalStatus, reservation.id]
    ).catch(() => {});
}

module.exports = {
    reserveCodeRequest,
    finishCodeRequestReservation,
};
