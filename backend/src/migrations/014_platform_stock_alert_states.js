module.exports = {
    id: "014_platform_stock_alert_states",
    name: "Track Telegram out-of-stock alerts by platform",
    async up({ query }) {
        await query(`
            CREATE TABLE IF NOT EXISTS platform_stock_alert_states (
                platform_id INT PRIMARY KEY,
                last_stock INT NOT NULL DEFAULT 0,
                is_out_of_stock TINYINT(1) NOT NULL DEFAULT 0,
                last_notified_at DATETIME NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_platform_stock_alert_out (is_out_of_stock)
            )
        `);
    },
};
