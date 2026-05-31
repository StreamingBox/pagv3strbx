module.exports = {
    id: "003_reopen_warranty_replacement_expirations",
    name: "Reopen warranty replacement expirations",
    async up({ query }) {
        await query(`
            UPDATE subscriptions s
            JOIN (
                SELECT subscription_id, MAX(created_at) AS last_replaced_at
                FROM account_replacement_logs
                GROUP BY subscription_id
            ) replacements ON replacements.subscription_id = s.id
            LEFT JOIN platform_accounts acc ON acc.id = s.platform_account_id
            SET s.is_attended = 0
            WHERE s.status = 'active'
              AND COALESCE(s.is_attended, 0) = 1
              AND COALESCE(acc.expires_at, s.expires_at) <= DATE_ADD(NOW(), INTERVAL 7 DAY)
        `);
    },
};
