module.exports = {
    id: "011_sync_active_account_passwords",
    name: "Sync active account passwords from latest upload",
    async up({ query }) {
        await query(`
            UPDATE platform_accounts target
            JOIN subscriptions s
              ON s.platform_account_id = target.id
             AND s.status = 'active'
            JOIN (
                SELECT latest.platform_id, latest.email_key, source.id AS source_id, source.password
                FROM (
                    SELECT
                        platform_id,
                        LOWER(TRIM(email)) AS email_key,
                        MAX(id) AS latest_id
                    FROM platform_accounts
                    WHERE email IS NOT NULL
                      AND TRIM(email) <> ''
                      AND password IS NOT NULL
                      AND TRIM(password) <> ''
                    GROUP BY platform_id, LOWER(TRIM(email))
                ) latest
                JOIN platform_accounts source ON source.id = latest.latest_id
            ) src
              ON src.platform_id = target.platform_id
             AND src.email_key = LOWER(TRIM(target.email))
            SET target.password = src.password,
                target.updated_at = CURRENT_TIMESTAMP
            WHERE target.id <> src.source_id
              AND LOWER(TRIM(COALESCE(target.status, ''))) NOT IN ('inactive', 'disabled', 'down')
              AND (target.password IS NULL OR target.password <> src.password)
              AND (
                target.expires_at IS NULL
                OR target.expires_at >= UTC_TIMESTAMP()
                OR s.expires_at >= UTC_TIMESTAMP()
              )
        `);
    },
};
