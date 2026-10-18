module.exports = {
    id: "055_platform_account_sale_priority",
    name: "Add account-level priority for automatic sales",
    async up({ query }) {
        const [columns] = await query(
            "SHOW COLUMNS FROM platform_accounts LIKE 'sale_priority'"
        );

        if (!columns.length) {
            await query(
                "ALTER TABLE platform_accounts ADD COLUMN sale_priority TINYINT(1) NOT NULL DEFAULT 0"
            );
        }
    },
};
