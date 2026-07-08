const IGNORE_DUP_KEY = ["ER_DUP_KEYNAME"];

module.exports = {
    id: "019_support_tickets",
    name: "Add customer support tickets",
    async up({ query }) {
        await query(`
            CREATE TABLE IF NOT EXISTS support_tickets (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                ticket_code VARCHAR(32) NOT NULL,
                subscription_id INT NOT NULL,
                user_id INT NOT NULL,
                platform_id INT NOT NULL,
                order_id INT NULL,
                order_code VARCHAR(64) NULL,
                status ENUM('open', 'in_progress', 'resolved') NOT NULL DEFAULT 'open',
                observation TEXT NOT NULL,
                attachment_name VARCHAR(255) NOT NULL,
                attachment_file VARCHAR(160) NOT NULL,
                attachment_mime VARCHAR(100) NOT NULL,
                attachment_size INT UNSIGNED NOT NULL DEFAULT 0,
                resolution_type ENUM('repaired', 'replaced', 'other') NULL,
                resolution_message TEXT NULL,
                old_account_id INT NULL,
                new_account_id INT NULL,
                resolved_by_user_id INT NULL,
                resolved_at DATETIME NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_support_tickets_code (ticket_code),
                INDEX idx_support_tickets_user (user_id, created_at),
                INDEX idx_support_tickets_status (status, created_at),
                INDEX idx_support_tickets_subscription (subscription_id, status)
            )
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS support_ticket_events (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                ticket_id BIGINT NOT NULL,
                actor_user_id INT NULL,
                event_type ENUM('created', 'in_progress', 'resolved', 'replaced') NOT NULL,
                message TEXT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_support_ticket_events_ticket (ticket_id, created_at)
            )
        `);

        await query(
            "CREATE INDEX idx_support_tickets_user ON support_tickets(user_id, created_at)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );
        await query(
            "CREATE INDEX idx_support_tickets_status ON support_tickets(status, created_at)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );
        await query(
            "CREATE INDEX idx_support_tickets_subscription ON support_tickets(subscription_id, status)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );
        await query(
            "CREATE INDEX idx_support_ticket_events_ticket ON support_ticket_events(ticket_id, created_at)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );
    },
};
