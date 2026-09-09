const MANAGEMENT_EXTENSION_THRESHOLD_MINUTES = 5 * 60;

function minutesBetween(start, end) {
    if (!start || !end) return null;
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null;
    return Math.round((endMs - startMs) / 60000);
}

function getManagementMinutes({ createdAt, firstInProgressAt = null, closedAt = null, now = new Date() }) {
    return minutesBetween(firstInProgressAt || createdAt, closedAt || now);
}

function shouldGrantManagementExtension({ managementMinutes, alreadyGranted = false }) {
    return !alreadyGranted
        && Number.isFinite(Number(managementMinutes))
        && Number(managementMinutes) > MANAGEMENT_EXTENSION_THRESHOLD_MINUTES;
}

async function grantManagementExtension(conn, { ticketId, subscriptionId, closedAt = new Date() }) {
    const [timingRows] = await conn.query(
        `SELECT st.created_at,
                st.management_extension_days,
                MIN(CASE WHEN ste.event_type = 'in_progress' THEN ste.created_at END) AS first_in_progress_at
           FROM support_tickets st
           LEFT JOIN support_ticket_events ste ON ste.ticket_id = st.id
          WHERE st.id = ?
          GROUP BY st.id, st.created_at, st.management_extension_days`,
        [ticketId]
    );
    const timing = timingRows[0];
    const managementMinutes = timing
        ? getManagementMinutes({
            createdAt: timing.created_at,
            firstInProgressAt: timing.first_in_progress_at,
            closedAt,
        })
        : null;

    if (!shouldGrantManagementExtension({
        managementMinutes,
        alreadyGranted: Number(timing?.management_extension_days || 0) > 0,
    })) {
        return { granted: false, managementMinutes, days: 0 };
    }

    const [subscriptionRows] = await conn.query(
        "SELECT id, expires_at FROM subscriptions WHERE id = ? FOR UPDATE",
        [subscriptionId]
    );
    if (!subscriptionRows.length) return { granted: false, managementMinutes, days: 0 };

    const previousExpiresAt = subscriptionRows[0].expires_at;
    if (!previousExpiresAt) {
        return {
            granted: false,
            managementMinutes,
            days: 0,
            reason: "missing_expiration",
        };
    }
    await conn.query(
        "UPDATE subscriptions SET expires_at = DATE_ADD(expires_at, INTERVAL 1 DAY) WHERE id = ?",
        [subscriptionId]
    );
    await conn.query(
        `UPDATE platform_accounts pa
           JOIN subscriptions s ON s.platform_account_id = pa.id
           SET pa.expires_at = s.expires_at
         WHERE s.id = ?`,
        [subscriptionId]
    );
    const [updatedRows] = await conn.query(
        "SELECT expires_at FROM subscriptions WHERE id = ? LIMIT 1",
        [subscriptionId]
    );
    const newExpiresAt = updatedRows[0]?.expires_at || null;
    const previousDate = previousExpiresAt ? String(previousExpiresAt).slice(0, 10) : "-";
    const newDate = newExpiresAt ? String(newExpiresAt).slice(0, 10) : "-";
    const message = `Se agrego 1 dia por tiempo de gestion superior a 5 horas (${managementMinutes} min). Expiracion: ${previousDate} -> ${newDate}.`;

    await conn.query(
        "UPDATE support_tickets SET management_extension_days = 1 WHERE id = ?",
        [ticketId]
    );
    await conn.query(
        `INSERT INTO support_ticket_events (ticket_id, actor_user_id, event_type, message)
         VALUES (?, NULL, 'management_extension', ?)`,
        [ticketId, message]
    );

    return {
        granted: true,
        managementMinutes,
        days: 1,
        previousExpiresAt,
        newExpiresAt,
        message,
    };
}

module.exports = {
    MANAGEMENT_EXTENSION_THRESHOLD_MINUTES,
    getManagementMinutes,
    grantManagementExtension,
    minutesBetween,
    shouldGrantManagementExtension,
};
