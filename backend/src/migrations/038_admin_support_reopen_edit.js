module.exports = {
    id: "038_admin_support_reopen_edit",
    name: "Allow admin support reopen and response edits",

    async up({ query }) {
        await query(`
            ALTER TABLE support_ticket_events
            MODIFY COLUMN event_type ENUM(
                'created',
                'in_progress',
                'resolved',
                'replaced',
                'reopened',
                'admin_reopened',
                'response_edited',
                'auto_replaced',
                'auto_no_stock',
                'management_extension'
            ) NOT NULL
        `);
    },
};
