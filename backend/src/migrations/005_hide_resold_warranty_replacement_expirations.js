module.exports = {
    id: "005_hide_resold_warranty_replacement_expirations",
    name: "Hide warranty replacements resold later",
    async up({ query }) {
        const [rows] = await query(`
            SELECT DISTINCT s.id
            FROM subscriptions s
            JOIN (
                SELECT subscription_id, MAX(created_at) AS last_replaced_at
                FROM account_replacement_logs
                GROUP BY subscription_id
            ) replacements ON replacements.subscription_id = s.id
            JOIN platform_accounts acc ON acc.id = s.platform_account_id
            WHERE s.status = 'active'
              AND COALESCE(s.is_attended, 0) = 0
              AND EXISTS (
                  SELECT 1
                  FROM order_items oi_later
                  JOIN orders o_later ON o_later.id = oi_later.order_id
                  JOIN subscriptions s_later ON s_later.id = oi_later.subscription_id
                  JOIN platform_accounts acc_later ON acc_later.id = s_later.platform_account_id
                  WHERE s_later.id <> s.id
                    AND s_later.status != 'cancelled'
                    AND (
                        (acc.identity_id IS NOT NULL AND acc_later.identity_id = acc.identity_id)
                        OR (
                            COALESCE(acc.email, '') <> ''
                            AND LOWER(COALESCE(acc_later.email, '')) = LOWER(COALESCE(acc.email, ''))
                            AND COALESCE(CAST(acc_later.profile_number AS CHAR), '') = COALESCE(CAST(acc.profile_number AS CHAR), '')
                            AND (
                                acc_later.platform_id = acc.platform_id
                                OR EXISTS (
                                    SELECT 1
                                    FROM platform_fallbacks pf
                                    WHERE COALESCE(pf.is_active, 1) = 1
                                      AND (
                                          (pf.source_platform_id = acc.platform_id AND pf.fallback_platform_id = acc_later.platform_id)
                                          OR (pf.source_platform_id = acc_later.platform_id AND pf.fallback_platform_id = acc.platform_id)
                                      )
                                )
                            )
                        )
                    )
                    AND o_later.created_at > COALESCE((
                        SELECT MAX(o_current.created_at)
                        FROM order_items oi_current
                        JOIN orders o_current ON o_current.id = oi_current.order_id
                        WHERE oi_current.subscription_id = s.id
                    ), '1000-01-01')
              )
        `);

        const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
        for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500);
            const placeholders = chunk.map(() => "?").join(",");
            await query(
                `UPDATE subscriptions SET is_attended = 1 WHERE id IN (${placeholders})`,
                chunk
            );
        }
    },
};
