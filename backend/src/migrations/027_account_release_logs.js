const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];
const IGNORE_DUP_KEY = ["ER_DUP_KEYNAME", "ER_DUP_ENTRY"];

module.exports = {
    id: "027_account_release_logs",
    name: "Audit forced inventory account releases",
    async up({ query }) {
        await query(`
            CREATE TABLE IF NOT EXISTS account_release_logs (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                account_id BIGINT NOT NULL,
                subscription_id BIGINT NULL,
                order_id BIGINT NULL,
                order_code VARCHAR(64) NULL,
                user_id BIGINT NULL,
                admin_user_id BIGINT NULL,
                previous_status VARCHAR(24) NULL,
                previous_assigned_to_user_id BIGINT NULL,
                previous_expires_at DATETIME NULL,
                reason TEXT NULL,
                forced TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_account_release_logs_account (account_id, created_at),
                INDEX idx_account_release_logs_subscription (subscription_id),
                INDEX idx_account_release_logs_created (created_at)
            )
        `);

        await query(
            "ALTER TABLE account_release_logs ADD COLUMN reason TEXT NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "CREATE INDEX idx_account_release_logs_account ON account_release_logs(account_id, created_at)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );
        await query(
            "CREATE INDEX idx_account_release_logs_subscription ON account_release_logs(subscription_id)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );
    },
};
