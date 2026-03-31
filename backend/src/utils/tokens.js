const crypto = require("crypto");

// ✅ Token fuerte (base64url) y reintento si choca UNIQUE
function randomToken(len = 10) {
    return crypto.randomBytes(24).toString("base64url").slice(0, len);
}

async function insertCredentialLinkWithRetry(conn, { subscriptionId, createdByUserId, showWhatsapp }) {
    const maxTries = 12;

    for (let i = 0; i < maxTries; i++) {
        const token = randomToken(10);

        try {
            await conn.query(
                `INSERT INTO credential_links (subscription_id, token, created_by_user_id, show_whatsapp)
         VALUES (?, ?, ?, ?)`,
                [subscriptionId, token, createdByUserId, showWhatsapp ? 1 : 0]
            );

            return token; // ✅ éxito
        } catch (err) {
            if (err && err.code === "ER_DUP_ENTRY") continue; // reintenta
            throw err;
        }
    }

    throw new Error("No se pudo generar un token único. Intenta nuevamente.");
}

module.exports = { randomToken, insertCredentialLinkWithRetry };
