const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];
const IGNORE_DUP_KEY = ["ER_DUP_KEYNAME"];

module.exports = {
    id: "010_lite_catalog_cop",
    name: "Add COP-only Lite catalog controls",
    async up({ query }) {
        await query(
            "ALTER TABLE platform_prices ADD COLUMN lite_price_cop DECIMAL(12,2) NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE platform_prices ADD COLUMN show_in_lite TINYINT(1) NOT NULL DEFAULT 0",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "CREATE INDEX idx_platform_prices_lite ON platform_prices(currency, show_in_lite, lite_price_cop)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );

        await query(
            "ALTER TABLE combo_prices ADD COLUMN lite_price_cop DECIMAL(12,2) NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE combo_prices ADD COLUMN show_in_lite TINYINT(1) NOT NULL DEFAULT 0",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "CREATE INDEX idx_combo_prices_lite ON combo_prices(currency, show_in_lite, lite_price_cop)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );

        await query(
            "ALTER TABLE users ADD COLUMN account_type VARCHAR(32) NOT NULL DEFAULT 'reseller'",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "CREATE INDEX idx_users_account_type ON users(account_type)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );
    },
};
