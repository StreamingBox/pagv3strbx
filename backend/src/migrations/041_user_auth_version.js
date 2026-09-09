const IGNORE_DUPLICATE_COLUMN = ["ER_DUP_FIELDNAME"];

module.exports = {
    id: "041_user_auth_version",
    name: "Add persistent user auth version for session revocation",

    async up({ query }) {
        await query(
            "ALTER TABLE users ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER status",
            [],
            { ignoreCodes: IGNORE_DUPLICATE_COLUMN }
        );
    },
};
