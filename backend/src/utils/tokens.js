const crypto = require("crypto");

// ✅ Token fuerte (base64url) y reintento si choca UNIQUE
function randomToken(len = 10) {
    return crypto.randomBytes(24).toString("base64url").slice(0, len);
}

async function cleanupExpiredCredentialLinks(connOrPool) {
    const [result] = await connOrPool.query(
        `DELETE cl
           FROM credential_links cl
           LEFT JOIN subscriptions s ON s.id = cl.subscription_id
           LEFT JOIN platform_accounts a ON a.id = s.platform_account_id
          WHERE s.id IS NULL
             OR s.status <> 'active'
             OR (a.expires_at IS NOT NULL AND a.expires_at < UTC_TIMESTAMP())
             OR (a.expires_at IS NULL AND s.expires_at < DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)))`
    );
    return Number(result?.affectedRows || 0);
}

async function insertCredentialLinkWithRetry(conn, { subscriptionId, createdByUserId }) {
    const maxTries = 12;

    for (let i = 0; i < maxTries; i++) {
        const token = randomToken(10);

        try {
            await conn.query(
                `INSERT INTO credential_links (subscription_id, token, created_by_user_id)
         VALUES (?, ?, ?)`,
                [subscriptionId, token, createdByUserId]
            );

            return token; // ✅ éxito
        } catch (err) {
            if (err && err.code === "ER_DUP_ENTRY") continue; // reintenta
            throw err;
        }
    }

    throw new Error("No se pudo generar un token único. Intenta nuevamente.");
}

module.exports = { randomToken, insertCredentialLinkWithRetry, cleanupExpiredCredentialLinks };
