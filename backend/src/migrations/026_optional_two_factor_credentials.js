const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];

module.exports = {
    id: "026_optional_two_factor_credentials",
    name: "Add optional two-factor credentials to inventory accounts",
    async up({ query }) {
        await query(
            "ALTER TABLE platform_accounts ADD COLUMN two_factor_secret TEXT NULL AFTER pin",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
    },
};
