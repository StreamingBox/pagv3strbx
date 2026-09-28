const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];

module.exports = {
    id: "044_provider_account_card_renewal_date",
    name: "Add card renewal date to provider accounts",
    async up({ query }) {
        await query(
            "ALTER TABLE provider_accounts ADD COLUMN card_renewal_date DATE NULL AFTER expires_at",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
    },
};
