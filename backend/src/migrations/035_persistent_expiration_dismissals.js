const IGNORE_DUPLICATE_COLUMN = ["ER_DUP_FIELDNAME"];
const IGNORE_DUPLICATE_INDEX = ["ER_DUP_KEYNAME"];

module.exports = {
    id: "035_persistent_expiration_dismissals",
    name: "Persist manual expiration dismissals",
    async up({ query }) {
        await query(
            "ALTER TABLE subscriptions ADD COLUMN expiration_hidden_at DATETIME NULL AFTER is_attended",
            [],
            { ignoreCodes: IGNORE_DUPLICATE_COLUMN }
        );

        await query(
            "ALTER TABLE subscriptions ADD INDEX idx_subscriptions_expiration_hidden (expiration_hidden_at)",
            [],
            { ignoreCodes: IGNORE_DUPLICATE_INDEX }
        );

        // Preserve the meaning of the existing manual "retirado" flag after
        // separating it from is_attended, without changing dates or ownership.
        await query(`
            UPDATE subscriptions
               SET expiration_hidden_at = UTC_TIMESTAMP()
             WHERE COALESCE(is_attended, 0) = 1
               AND expiration_hidden_at IS NULL
        `);
    },
};
