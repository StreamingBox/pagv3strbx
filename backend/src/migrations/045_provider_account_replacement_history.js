module.exports = {
    id: "045_provider_account_replacement_history",
    name: "Track provider account replacement history",
    async up({ query }) {
        await query(`
            CREATE TABLE IF NOT EXISTS provider_account_replacement_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                old_account_id INT NOT NULL,
                new_account_id INT NOT NULL,
                reason VARCHAR(255) NULL,
                admin_user_id INT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_provider_replacement_old (old_account_id),
                INDEX idx_provider_replacement_new (new_account_id),
                INDEX idx_provider_replacement_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
};
