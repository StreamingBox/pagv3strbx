module.exports = {
    id: "050_youtube_totp_shared_google_email",
    name: "Share YouTube authenticator secrets by Google account email",
    async up({ query }) {
        await query(`
            CREATE TABLE IF NOT EXISTS youtube_google_totp_secrets (
                email_normalized VARCHAR(320) NOT NULL PRIMARY KEY,
                encrypted_secret VARBINARY(128) NOT NULL,
                secret_iv BINARY(12) NOT NULL,
                secret_auth_tag BINARY(16) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        await query(`
            INSERT IGNORE INTO youtube_google_totp_secrets
                (email_normalized, encrypted_secret, secret_iv, secret_auth_tag, created_at, updated_at)
            SELECT LOWER(TRIM(a.email)), secret.encrypted_secret, secret.secret_iv,
                   secret.secret_auth_tag, secret.created_at, secret.updated_at
              FROM platform_account_totp_secrets secret
              JOIN platform_accounts a ON a.id = secret.platform_account_id
              JOIN platforms p ON p.id = a.platform_id
             WHERE TRIM(COALESCE(a.email, '')) <> ''
               AND (LOWER(p.name) LIKE '%youtube%' OR LOWER(p.slug) LIKE '%youtube%')
             ORDER BY secret.updated_at DESC, secret.platform_account_id DESC
        `);
    },
};
