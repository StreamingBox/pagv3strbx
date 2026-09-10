const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];

module.exports = {
    id: "043_platform_price_drop_badges",
    name: "Track platform price drops for catalog badges",
    async up({ query }) {
        await query(
            "ALTER TABLE platform_prices ADD COLUMN previous_price DECIMAL(12,2) NULL AFTER price",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE platform_prices ADD COLUMN previous_lite_price_cop DECIMAL(12,2) NULL AFTER lite_price_cop",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
    },
};
