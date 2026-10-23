module.exports = {
    id: "056_recharge_bonus_promotion",
    name: "Add configurable recharge bonus promotion",
    async up({ query }) {
        await query(`
            CREATE TABLE IF NOT EXISTS app_settings (
                setting_key VARCHAR(128) PRIMARY KEY,
                setting_value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        const columnsToAdd = [
            ["promo_bonus_amount", "DECIMAL(12,2) NOT NULL DEFAULT 0"],
            ["promo_bonus_percent", "DECIMAL(5,2) NOT NULL DEFAULT 0"],
            ["promo_campaign", "VARCHAR(32) NULL"],
        ];
        for (const [column, definition] of columnsToAdd) {
            const [existing] = await query(
                "SHOW COLUMNS FROM manual_topup_requests LIKE ?",
                [column]
            );
            if (!existing.length) {
                await query(`ALTER TABLE manual_topup_requests ADD COLUMN ${column} ${definition}`);
            }
        }
    },
};
