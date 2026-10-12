module.exports = {
    id: "047_youtube_premium_totp_secrets",
    name: "Store encrypted YouTube Premium authenticator secrets",
    async up({ query }) {
        await query(`
            CREATE TABLE IF NOT EXISTS platform_account_totp_secrets (
                platform_account_id INT NOT NULL PRIMARY KEY,
                encrypted_secret VARBINARY(128) NOT NULL,
                secret_iv BINARY(12) NOT NULL,
                secret_auth_tag BINARY(16) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_platform_account_totp_updated (updated_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
};
