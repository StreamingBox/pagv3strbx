module.exports = {
    id: "029_sales_adjustments",
    name: "Add auditable sales adjustments for analytics",
    async up({ query }) {
        await query(`
            CREATE TABLE IF NOT EXISTS sales_adjustments (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                adjustment_date DATE NOT NULL,
                currency VARCHAR(10) NOT NULL DEFAULT 'COP',
                amount DECIMAL(12,2) NOT NULL,
                reason TEXT NULL,
                created_by_user_id BIGINT UNSIGNED NULL,
                applies_to_user_id BIGINT UNSIGNED NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_sales_adjustments_period (currency, adjustment_date),
                KEY idx_sales_adjustments_user (applies_to_user_id, adjustment_date),
                CONSTRAINT fk_sales_adjustments_created_by
                    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
                    ON DELETE SET NULL,
                CONSTRAINT fk_sales_adjustments_applies_to
                    FOREIGN KEY (applies_to_user_id) REFERENCES users(id)
                    ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    },
};
