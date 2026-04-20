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
        s.platform_account_id AS platformAccountId,
        pa.email AS accountEmail,
        pa.password AS accountPassword,
        pa.pin AS accountPin
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
       AND LOWER(platform_slug) = ?
       AND status = 'delivered'
     ORDER BY created_at DESC
     LIMIT 1`,
        [Number(orderId), platformSlugLower]
    );
    return rows?.[0] || null;
}

async function countDeliveredByFingerprint({
    orderId,
    platformSlugLower,
    credentialFingerprint,
    requireCodeValue = false,
}) {
    const where = [
        "order_id = ?",
        "LOWER(platform_slug) = ?",
        "status = 'delivered'",
        "credential_fingerprint = ?",
    ];
    const params = [Number(orderId), String(platformSlugLower || "").toLowerCase(), String(credentialFingerprint || "")];

    if (requireCodeValue) {
        where.push("delivered_code IS NOT NULL");
        where.push("delivered_code <> ''");
    }

    const [[row]] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM code_deliveries
         WHERE ${where.join(" AND ")}`,
        params
    );

    return Number(row?.total || 0);
}

module.exports = {
    getCodePlatformBySlug,
    getSubscriptionWithAccount,
    getLastDelivered,
    countDeliveredByFingerprint,
};
