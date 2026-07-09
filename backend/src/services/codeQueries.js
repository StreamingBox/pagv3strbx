const pool = require("../db");

async function getCodePlatformBySlug(slugLower) {
    const [rows] = await pool.query(
        `SELECT slug, gmail_from, code_regex, max_age_minutes, is_active
     FROM code_platforms
     WHERE LOWER(slug) = ?
     LIMIT 1`,
        [slugLower]
    );
    return rows?.[0] || null;
}

async function getSubscriptionWithAccount(orderId) {
    const [rows] = await pool.query(
        `SELECT
        s.id AS subscriptionId,
        s.user_id AS userId,
        s.status,
        s.expires_at,
        u.email AS userEmail,
        p.slug AS platformSlug,
        p.name AS platformName,
        s.platform_account_id AS platformAccountId,
        pa.email AS accountEmail,
        pa.password AS accountPassword,
        pa.pin AS accountPin,
        pa.profile_number AS accountProfile,
        (
            SELECT o.order_code
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.subscription_id = s.id
            ORDER BY o.created_at DESC, o.id DESC
            LIMIT 1
        ) AS orderCode
     FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     JOIN platforms p ON p.id = s.platform_id
     LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
     WHERE s.id = ?
     LIMIT 1`,
        [Number(orderId)]
    );
    return rows?.[0] || null;
}

async function getLastDelivered(orderId, platformSlugLower) {
    const [rows] = await pool.query(
        `SELECT id, credential_fingerprint, created_at
     FROM code_deliveries
     WHERE order_id = ?
       AND platform_slug = ?
       AND status = 'delivered'
     ORDER BY created_at DESC
     LIMIT 1`,
        [Number(orderId), String(platformSlugLower || "").toLowerCase()]
    );
    return rows?.[0] || null;
}

async function countDeliveredByFingerprint({
    orderId,
    platformSlugLower,
    credentialFingerprint,
    requireCodeValue = false,
    requireEmptyCode = false,
    messageLike = null,
    messageNotLike = null,
    honorAdminResets = true,
}) {
    const where = [
        "order_id = ?",
        "platform_slug = ?",
        "status = 'delivered'",
        "credential_fingerprint = ?",
    ];
    const params = [Number(orderId), String(platformSlugLower || "").toLowerCase(), String(credentialFingerprint || "")];

    if (requireCodeValue) {
        where.push("delivered_code IS NOT NULL");
        where.push("delivered_code <> ''");
    }
    if (requireEmptyCode) {
        where.push("(delivered_code IS NULL OR delivered_code = '')");
    }
    if (messageLike) {
        where.push("message LIKE ?");
        params.push(String(messageLike));
    }
    if (messageNotLike) {
        where.push("(message IS NULL OR message NOT LIKE ?)");
        params.push(String(messageNotLike));
    }
    if (honorAdminResets) {
        where.push(`id > COALESCE((
            SELECT MAX(reset_rows.id)
            FROM code_deliveries reset_rows
            WHERE reset_rows.order_id = ?
              AND reset_rows.platform_slug = ?
              AND reset_rows.credential_fingerprint = ?
              AND reset_rows.status = 'reset'
        ), 0)`);
        params.push(Number(orderId), String(platformSlugLower || "").toLowerCase(), String(credentialFingerprint || ""));
    }

    const [[row]] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM code_deliveries
         WHERE ${where.join(" AND ")}`,
        params
    );

    return Number(row?.total || 0);
}

async function getDeliveryCountersByFingerprint({ orderId, platformSlugLower, credentialFingerprint }) {
    const id = Number(orderId);
    const slug = String(platformSlugLower || "").toLowerCase();
    const fingerprint = String(credentialFingerprint || "");

    const [[row]] = await pool.query(
        `SELECT
            COUNT(*) AS totalAfterReset,
            SUM(CASE
                WHEN delivered_code IS NOT NULL
                 AND delivered_code <> ''
                 AND (message IS NULL OR message NOT LIKE 'OK:temporary%')
                THEN 1 ELSE 0 END) AS loginCodes,
            SUM(CASE
                WHEN delivered_code IS NOT NULL
                 AND delivered_code <> ''
                 AND message LIKE 'OK:temporary%'
                THEN 1 ELSE 0 END) AS temporaryCodes,
            SUM(CASE
                WHEN (delivered_code IS NULL OR delivered_code = '')
                 AND message LIKE 'OK:approve-confirmed%'
                THEN 1 ELSE 0 END) AS approvals
         FROM code_deliveries
         WHERE order_id = ?
           AND platform_slug = ?
           AND status = 'delivered'
           AND credential_fingerprint = ?
           AND id > COALESCE((
                SELECT MAX(reset_rows.id)
                FROM code_deliveries reset_rows
                WHERE reset_rows.order_id = ?
                  AND reset_rows.platform_slug = ?
                  AND reset_rows.credential_fingerprint = ?
                  AND reset_rows.status = 'reset'
           ), 0)`,
        [id, slug, fingerprint, id, slug, fingerprint]
    );

    return {
        totalAfterReset: Number(row?.totalAfterReset || 0),
        loginCodes: Number(row?.loginCodes || 0),
        temporaryCodes: Number(row?.temporaryCodes || 0),
        approvals: Number(row?.approvals || 0),
    };
}

async function getLastCodeReset({ orderId, platformSlugLower, credentialFingerprint }) {
    const [rows] = await pool.query(
        `SELECT
            cd.id,
            cd.created_at,
            cd.message,
            u.email AS requested_by
         FROM code_deliveries cd
         LEFT JOIN users u ON u.id = cd.requested_by_user_id
         WHERE cd.order_id = ?
           AND cd.platform_slug = ?
           AND cd.credential_fingerprint = ?
           AND cd.status = 'reset'
         ORDER BY cd.id DESC
         LIMIT 1`,
        [Number(orderId), String(platformSlugLower || "").toLowerCase(), String(credentialFingerprint || "")]
    );
    return rows?.[0] || null;
}

module.exports = {
    getCodePlatformBySlug,
    getSubscriptionWithAccount,
    getLastDelivered,
    countDeliveredByFingerprint,
    getDeliveryCountersByFingerprint,
    getLastCodeReset,
};
