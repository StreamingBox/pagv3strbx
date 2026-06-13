const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];

module.exports = {
    id: "016_platform_product_details",
    name: "Add customer-facing product details and purchase snapshots",
    async up({ query }) {
        await query(
            "ALTER TABLE platforms ADD COLUMN product_details TEXT NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE order_items ADD COLUMN product_details_snapshot TEXT NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
    },
};
