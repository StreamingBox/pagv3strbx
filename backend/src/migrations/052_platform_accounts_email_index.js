module.exports = {
    id: "052_platform_accounts_email_index",
    name: "Index platform account email searches",
    async up({ query }) {
        const [indexes] = await query(
            `SHOW INDEX FROM platform_accounts WHERE Key_name = ?`,
            ["idx_platform_accounts_email"]
        );

        if (!indexes.length) {
            await query("CREATE INDEX idx_platform_accounts_email ON platform_accounts(email)");
        }
    },
};
