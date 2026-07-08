const IGNORE_DUP_KEY = ["ER_DUP_KEYNAME"];

module.exports = {
    id: "021_master_accounts_and_support_reopen",
    name: "Add master accounts and support reopen traceability",
    async up({ query }) {
        await query(`
            CREATE TABLE IF NOT EXISTS master_accounts (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                platform_id INT NOT NULL,
                account_email VARCHAR(255) NOT NULL,
                status ENUM('active', 'inactive') NOT NULL DEFAULT 'inactive',
                notes TEXT NULL,
                created_by_user_id INT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_master_accounts_platform_email (platform_id, account_email),
                INDEX idx_master_accounts_status (status, platform_id)
            )
        `);

        await query(
            "CREATE INDEX idx_master_accounts_email ON master_accounts(account_email)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );

        await query(`
            ALTER TABLE support_ticket_events
            MODIFY COLUMN event_type ENUM(
                'created',
                'in_progress',
                'resolved',
                'replaced',
                'reopened',
                'auto_replaced',
                'auto_no_stock'
            ) NOT NULL
        `);
    },
};
