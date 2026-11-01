module.exports = {
    id: "059_account_replacement_review",
    name: "Add admin review archive for support replacements",
    async up({ query }) {
        const [reviewedAtColumns] = await query(
            "SHOW COLUMNS FROM account_replacement_logs LIKE ?",
            ["reviewed_at"]
        );
        if (!reviewedAtColumns.length) {
            await query("ALTER TABLE account_replacement_logs ADD COLUMN reviewed_at DATETIME NULL");
        }

        const [reviewerColumns] = await query(
            "SHOW COLUMNS FROM account_replacement_logs LIKE ?",
            ["reviewed_by_user_id"]
        );
        if (!reviewerColumns.length) {
            await query("ALTER TABLE account_replacement_logs ADD COLUMN reviewed_by_user_id INT NULL");
        }

        const [indexes] = await query(
            "SHOW INDEX FROM account_replacement_logs WHERE Key_name = ?",
            ["idx_replacement_review_created"]
        );
        if (!indexes.length) {
            await query("CREATE INDEX idx_replacement_review_created ON account_replacement_logs(reviewed_at, created_at)");
        }
    },
};
