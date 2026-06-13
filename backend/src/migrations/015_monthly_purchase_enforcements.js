module.exports = {
    id: "015_monthly_purchase_enforcements",
    name: "Audit monthly minimum purchase enforcement",
    async up({ query }) {
        await query(`
            CREATE TABLE IF NOT EXISTS monthly_purchase_enforcements (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                period_start DATE NOT NULL,
                period_end DATE NOT NULL,
                currency VARCHAR(8) NOT NULL,
                purchase_total DECIMAL(14,2) NOT NULL DEFAULT 0,
                required_total DECIMAL(14,2) NOT NULL,
                previous_status VARCHAR(32) NULL,
                resulting_status VARCHAR(32) NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_monthly_purchase_user_period (user_id, period_start),
                INDEX idx_monthly_purchase_period (period_start, resulting_status),
                INDEX idx_monthly_purchase_user (user_id, created_at)
            )
        `);
    },
};
