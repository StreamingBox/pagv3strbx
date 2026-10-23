const TODAY_BOGOTA_SQL = "DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-05:00'))";

function buildExpirationDatePredicates({ expiryFilter, includeUpcomingWindow = true } = {}) {
    const predicates = [];

    if (includeUpcomingWindow) {
        predicates.push(`s.expires_at < DATE_ADD(${TODAY_BOGOTA_SQL}, INTERVAL 8 DAY)`);
    }

    if (expiryFilter === "vencidos") {
        predicates.push(`s.expires_at < ${TODAY_BOGOTA_SQL}`);
    } else if (expiryFilter === "hoy") {
        predicates.push(`s.expires_at >= ${TODAY_BOGOTA_SQL}`);
        predicates.push(`s.expires_at < DATE_ADD(${TODAY_BOGOTA_SQL}, INTERVAL 1 DAY)`);
    }

    return predicates;
}

const LATEST_SUBSCRIPTION_ORDERS_CTES = `
ranked_subscription_orders AS (
    SELECT
        oi.subscription_id,
        o.id AS order_id,
        o.order_code,
        o.created_at,
        ROW_NUMBER() OVER (
            PARTITION BY oi.subscription_id
            ORDER BY o.created_at DESC, oi.id DESC
        ) AS order_rank
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
),
latest_subscription_orders AS (
    SELECT subscription_id, order_id, order_code, created_at
    FROM ranked_subscription_orders
    WHERE order_rank = 1
)`;

const ACCOUNT_FIRST_EXPIRATION_CTE = `
account_first_expiration AS (
    SELECT platform_account_id, MIN(DATE(expires_at)) AS first_expiration_date
    FROM subscriptions
    WHERE status != 'cancelled'
      AND platform_account_id IS NOT NULL
    GROUP BY platform_account_id
)`;

function buildExpirationCtes({ includeAccountFirstExpiration = false } = {}) {
    return `WITH ${[
        LATEST_SUBSCRIPTION_ORDERS_CTES,
        includeAccountFirstExpiration ? ACCOUNT_FIRST_EXPIRATION_CTE : null,
    ].filter(Boolean).join(",")}`;
}

function buildLaterSubscriptionExclusionSql() {
    // The production email collation is case-insensitive, so this equality stays indexable.
    return `
        NOT EXISTS (
            SELECT 1
            FROM platform_accounts acc_later
            JOIN subscriptions s_later ON s_later.platform_account_id = acc_later.id
            JOIN latest_subscription_orders later_order ON later_order.subscription_id = s_later.id
            WHERE s_later.id <> s.id
              AND s_later.status != 'cancelled'
              AND acc.identity_id IS NOT NULL
              AND acc_later.identity_id = acc.identity_id
              AND later_order.created_at > COALESCE(current_order.created_at, '1000-01-01')
        )
        AND NOT EXISTS (
            SELECT 1
            FROM platform_accounts acc_later
            JOIN subscriptions s_later ON s_later.platform_account_id = acc_later.id
            JOIN latest_subscription_orders later_order ON later_order.subscription_id = s_later.id
            WHERE s_later.id <> s.id
              AND s_later.status != 'cancelled'
              AND COALESCE(acc.email, '') <> ''
              AND acc_later.email = acc.email
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
              AND later_order.created_at > COALESCE(current_order.created_at, '1000-01-01')
        )`;
}

module.exports = {
    buildExpirationCtes,
    buildExpirationDatePredicates,
    buildLaterSubscriptionExclusionSql,
};
