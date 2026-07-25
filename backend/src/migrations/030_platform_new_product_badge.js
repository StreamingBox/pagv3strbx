const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];

module.exports = {
    id: "030_platform_new_product_badge",
    name: "Add optional new product catalog badge",
    async up({ query }) {
        await query(
            "ALTER TABLE platforms ADD COLUMN is_new_product TINYINT(1) NOT NULL DEFAULT 0 AFTER show_promo_last_units",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
    },
};
