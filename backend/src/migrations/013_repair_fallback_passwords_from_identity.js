module.exports = {
    id: "013_repair_fallback_passwords_from_identity",
    name: "Repair fallback password sync from latest upload identity",
    async up({ query }) {
        await query(`
            UPDATE platform_accounts target
            JOIN subscriptions s
              ON s.platform_account_id = target.id
             AND s.status = 'active'
            JOIN (
                SELECT target_source.target_id, MAX(target_source.source_id) AS source_id
                FROM (
                    SELECT
                        target_inner.id AS target_id,
                        source.id AS source_id
                    FROM platform_accounts target_inner
                    JOIN subscriptions active_sub
                      ON active_sub.platform_account_id = target_inner.id
                     AND active_sub.status = 'active'
                    JOIN platform_accounts source
                      ON LOWER(TRIM(source.email)) = LOWER(TRIM(target_inner.email))
                     AND source.password IS NOT NULL
                     AND TRIM(source.password) <> ''
                     AND LOWER(TRIM(COALESCE(source.status, ''))) NOT IN ('inactive', 'disabled', 'down')
                     AND (
                        source.platform_id = target_inner.platform_id
                        OR EXISTS (
                            SELECT 1
                            FROM platform_fallbacks pf
                            WHERE COALESCE(pf.is_active, 1) = 1
                              AND (
                                  (pf.source_platform_id = target_inner.platform_id AND pf.fallback_platform_id = source.platform_id)
                                  OR (pf.source_platform_id = source.platform_id AND pf.fallback_platform_id = target_inner.platform_id)
                              )
                        )
                     )
                    WHERE target_inner.email IS NOT NULL
                      AND TRIM(target_inner.email) <> ''
                      AND LOWER(TRIM(COALESCE(target_inner.status, ''))) NOT IN ('inactive', 'disabled', 'down')
                      AND (
                        target_inner.expires_at IS NULL
                        OR target_inner.expires_at >= UTC_TIMESTAMP()
                        OR active_sub.expires_at >= UTC_TIMESTAMP()
                      )
                ) target_source
                GROUP BY target_source.target_id
            ) latest
              ON latest.target_id = target.id
            JOIN platform_accounts source
              ON source.id = latest.source_id
            LEFT JOIN account_identities source_identity
              ON source_identity.id = source.identity_id
            SET target.password = COALESCE(NULLIF(source_identity.last_password, ''), source.password),
                target.updated_at = CURRENT_TIMESTAMP
            WHERE LOWER(TRIM(COALESCE(target.status, ''))) NOT IN ('inactive', 'disabled', 'down')
              AND (
                target.expires_at IS NULL
                OR target.expires_at >= UTC_TIMESTAMP()
                OR s.expires_at >= UTC_TIMESTAMP()
              )
              AND (
                target.password IS NULL
                OR BINARY target.password <> BINARY COALESCE(NULLIF(source_identity.last_password, ''), source.password)
              )
        `);
    },
};
