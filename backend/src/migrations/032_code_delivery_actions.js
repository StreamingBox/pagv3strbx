const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];

module.exports = {
    id: "032_code_delivery_actions",
    name: "Track requested code action",
    async up({ query }) {
        await query(
            "ALTER TABLE code_deliveries ADD COLUMN action VARCHAR(32) NULL AFTER platform_slug",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
    },
};
