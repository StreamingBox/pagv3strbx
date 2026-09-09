function normalizeMasterEmail(value) {
    return String(value || "").trim().toLowerCase();
}

/**
 * Propagates a master-account failure only to inventory that is still free.
 * Assigned/sold records must remain untouched for subscription traceability.
 */
async function markAvailableAccountsDown(conn, { platformId, accountEmail }) {
    const normalizedEmail = normalizeMasterEmail(accountEmail);
    const normalizedPlatformId = Number(platformId);
    if (!Number.isInteger(normalizedPlatformId) || normalizedPlatformId <= 0 || !normalizedEmail) {
        return 0;
    }

    const [result] = await conn.query(
        `UPDATE platform_accounts
            SET status = 'down',
                updated_at = CURRENT_TIMESTAMP
          WHERE platform_id = ?
            AND status = 'available'
            AND LOWER(TRIM(COALESCE(email, ''))) = ?`,
        [normalizedPlatformId, normalizedEmail]
    );

    return Number(result?.affectedRows || 0);
}

function mapMasterAccount(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        platformId: Number(row.platform_id),
        platformName: row.platform_name || "",
        accountEmail: row.account_email || "",
        status: row.status || "inactive",
        notes: row.notes || "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

async function findInactiveMasterForSubscription(conn, subscriptionId) {
    const [rows] = await conn.query(
        `SELECT ma.*, p.name AS platform_name,
                pa.id AS current_account_id,
                pa.email AS current_account_email
           FROM subscriptions s
           JOIN platform_accounts pa ON pa.id = s.platform_account_id
           JOIN master_accounts ma
             ON LOWER(ma.account_email) = LOWER(pa.email)
            AND ma.status = 'inactive'
            AND ma.platform_id IN (s.platform_id, pa.platform_id, COALESCE(s.delivered_platform_id, s.platform_id))
           JOIN platforms p ON p.id = ma.platform_id
          WHERE s.id = ?
          ORDER BY
            CASE
                WHEN ma.platform_id = pa.platform_id THEN 0
                WHEN ma.platform_id = s.platform_id THEN 1
                ELSE 2
            END,
            ma.updated_at DESC
          LIMIT 1`,
        [subscriptionId]
    );
    return rows[0] || null;
}

module.exports = {
    normalizeMasterEmail,
    mapMasterAccount,
    findInactiveMasterForSubscription,
    markAvailableAccountsDown,
};
