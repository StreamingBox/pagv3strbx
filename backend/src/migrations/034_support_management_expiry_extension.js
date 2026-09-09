const IGNORE_DUP_COLUMN = ["ER_DUP_FIELDNAME"];

module.exports = {
    id: "034_support_management_expiry_extension",
    name: "Track support management expiry extensions",
    async up({ query }) {
        await query(
            "ALTER TABLE support_tickets ADD COLUMN management_extension_days TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER resolved_at",
            [],
            { ignoreCodes: IGNORE_DUP_COLUMN }
        );
        await query(`
            ALTER TABLE support_ticket_events
            MODIFY COLUMN event_type ENUM(
                'created',
                'in_progress',
                'resolved',
                'replaced',
                'reopened',
                'auto_replaced',
                'auto_no_stock',
                'management_extension'
            ) NOT NULL
        `);
    },
};
