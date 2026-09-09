const IGNORE_DUPLICATE_COLUMN = ["ER_DUP_FIELDNAME"];

module.exports = {
    id: "037_account_code_provider",
    name: "Store code provider per inventory account",

    async up({ query }) {
        await query(
            "ALTER TABLE platform_accounts ADD COLUMN code_provider VARCHAR(40) NOT NULL DEFAULT 'strbx' AFTER two_factor_secret",
            [],
            { ignoreCodes: IGNORE_DUPLICATE_COLUMN }
        );

        await query(`
            UPDATE platform_accounts
               SET code_provider = 'strbx'
             WHERE code_provider IS NULL OR TRIM(code_provider) = ''
        `);
    },
};
