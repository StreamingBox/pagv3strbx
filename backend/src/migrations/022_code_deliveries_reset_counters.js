const IGNORE_DUP_KEY = ["ER_DUP_KEYNAME"];

module.exports = {
    id: "022_code_deliveries_reset_counters",
    name: "Optimize code delivery reset counters",
    async up({ query }) {
        await query("ALTER TABLE code_deliveries MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'error'");
        await query(
            "CREATE INDEX idx_code_deliveries_counter ON code_deliveries(order_id, platform_slug, credential_fingerprint, status, id)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );
        await query(
            "CREATE INDEX idx_code_deliveries_account ON code_deliveries(platform_account_id, credential_fingerprint, created_at)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );
    },
};
