module.exports = {
    id: "048_youtube_totp_request_limits",
    name: "Limit YouTube Authenticator code requests per subscription",
    async up({ query }) {
        await query(`
            CREATE TABLE IF NOT EXISTS youtube_totp_request_limits (
                subscription_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
                first_requested_at DATETIME(3) NOT NULL,
                request_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
                INDEX idx_youtube_totp_request_first (first_requested_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
};
