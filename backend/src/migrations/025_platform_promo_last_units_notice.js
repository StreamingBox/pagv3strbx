const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];

module.exports = {
    id: "025_platform_promo_last_units_notice",
    name: "Add optional last units notice for promotions",
    async up({ query }) {
        await query(
            "ALTER TABLE platforms ADD COLUMN show_promo_last_units TINYINT(1) NOT NULL DEFAULT 0",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );

        // The notice only has commercial meaning for active promotions.
        await query("UPDATE platforms SET show_promo_last_units = 0 WHERE COALESCE(is_promo, 0) = 0");
    },
};
