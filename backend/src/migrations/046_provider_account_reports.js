const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];

module.exports = {
    id: "046_provider_account_reports",
    name: "Track provider account reports",
    async up({ query }) {
        await query(
            `ALTER TABLE provider_accounts
                ADD COLUMN provider_reported_at TIMESTAMP NULL,
                ADD COLUMN provider_report_note VARCHAR(255) NULL,
                ADD COLUMN provider_reported_by INT NULL,
                ADD INDEX idx_provider_accounts_reported (provider_reported_at)`,
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
    },
};
