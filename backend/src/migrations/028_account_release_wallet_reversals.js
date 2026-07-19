const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];
const IGNORE_DUP_KEY = ["ER_DUP_KEYNAME", "ER_DUP_ENTRY"];

module.exports = {
    id: "028_account_release_wallet_reversals",
    name: "Track wallet reversals for forced account releases",
    async up({ query }) {
        await query(
            "ALTER TABLE account_release_logs ADD COLUMN wallet_transaction_id BIGINT NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE account_release_logs ADD COLUMN wallet_amount DECIMAL(12,2) NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "ALTER TABLE account_release_logs ADD COLUMN wallet_currency VARCHAR(10) NULL",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "CREATE INDEX idx_account_release_logs_wallet_tx ON account_release_logs(wallet_transaction_id)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );
    },
};
