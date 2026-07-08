const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];
const IGNORE_DUP_KEY = ["ER_DUP_KEYNAME"];

module.exports = {
    id: "020_support_ticket_resolution_subtypes",
    name: "Add support ticket resolution subtypes",
    async up({ query }) {
        await query(
            "ALTER TABLE support_tickets ADD COLUMN resolution_subtype VARCHAR(64) NULL AFTER resolution_type",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(
            "CREATE INDEX idx_support_tickets_resolution ON support_tickets(status, resolution_type, resolution_subtype)",
            [],
            { ignoreCodes: IGNORE_DUP_KEY }
        );
    },
};
