module.exports = {
    id: "004_reopen_all_warranty_replacement_expirations",
    name: "Reopen all active warranty replacement expirations",
    async up({ query }) {
        await query(`
            UPDATE subscriptions s
            JOIN (
                SELECT subscription_id, MAX(created_at) AS last_replaced_at
                FROM account_replacement_logs
                GROUP BY subscription_id
            ) replacements ON replacements.subscription_id = s.id
            SET s.is_attended = 0
            WHERE s.status = 'active'
              AND COALESCE(s.is_attended, 0) = 1
        `);
    },
};
