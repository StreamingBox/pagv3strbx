const pool = require("../db");
const { getRenewalEligibility } = require("../utils/renewals");

async function getOrdersHistory({ userId, from, to, platformId, q, page = 1, limit = 5 }) {
    const where = [`o.user_id = ?`];
    const params = [userId];

    const safePage = Math.max(parseInt(page || "1", 10), 1);
    const safeLimit = Math.min(Math.max(parseInt(limit || "5", 10), 1), 50);
    const offset = (safePage - 1) * safeLimit;

    if (from) { where.push(`o.created_at >= ?`); params.push(`${from} 00:00:00`); }
    if (to) { where.push(`o.created_at <= ?`); params.push(`${to} 23:59:59`); }

    if (platformId) {
        where.push(`EXISTS (
      SELECT 1 FROM order_items oi2
      WHERE oi2.order_id = o.id AND oi2.platform_id = ?
    )`);
        params.push(Number(platformId));
    }

    if (q) {
        const searchTerm = `%${q.trim()}%`;
        where.push(`(
          o.order_code LIKE ? OR 
          EXISTS (
            SELECT 1 FROM order_items oi3 
            LEFT JOIN subscriptions s ON s.id = oi3.subscription_id 
            LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id 
            WHERE oi3.order_id = o.id AND (
              oi3.subscription_id LIKE ? OR 
              pa.email LIKE ? OR 
              pa.pin LIKE ?
            )
          )
        )`);
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Obtener total verdadero para la paginación
    const [countResult] = await pool.query(
        `SELECT COUNT(*) as total FROM orders o WHERE ${where.join(" AND ")}`,
        params
    );
    const totalCount = countResult[0].total;

    const [orders] = await pool.query(
        `SELECT o.id, o.order_code, o.total, o.currency, o.created_at
     FROM orders o
     WHERE ${where.join(" AND ")}
     ORDER BY o.created_at DESC
     LIMIT ?, ?`,
        [...params, offset, safeLimit]
    );

    if (!orders.length) return { orders: [], total: totalCount, page: safePage };

    const orderIds = orders.map((o) => o.id);
    const placeholders = orderIds.map(() => "?").join(",");

    const [items] = await pool.query(
        `SELECT
       oi.id AS item_id,
       oi.order_id,
       oi.subscription_id,
       oi.platform_id,
       oi.platform_price_id,
       oi.price,
       p.name AS platform_name,
       p.slug AS platform_slug
     FROM order_items oi
     JOIN platforms p ON p.id = oi.platform_id
     WHERE oi.order_id IN (${placeholders})
     ORDER BY oi.id ASC`,
        orderIds
    );

    const subscriptionIds = items.map((i) => i.subscription_id).filter(Boolean);
    const detailsMap = new Map();

    if (subscriptionIds.length) {
        const subPlaceholders = subscriptionIds.map(() => "?").join(",");
        const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";

        const [details] = await pool.query(
            `SELECT
         s.id AS subscription_id,
         s.status AS subscription_status,
         s.is_attended,
         s.starts_at,
         s.expires_at AS subscription_expires_at,
         s.price AS subscription_price,
         s.currency AS subscription_currency,
         s.platform_price_id,
         d.name AS duration_name,
         pp.is_renewable,
         pp.price AS renewal_price,
         a.id AS platform_account_id,
         a.email,
         a.password,
         a.pin,
         a.profile_number,
         a.access_url,
         a.expires_at AS account_expires_at,
         cl.token
       FROM subscriptions s
       LEFT JOIN durations d ON d.id = s.duration_id
       LEFT JOIN platform_prices pp ON pp.id = s.platform_price_id
       LEFT JOIN platform_accounts a ON a.id = s.platform_account_id
       LEFT JOIN credential_links cl ON cl.subscription_id = s.id
       LEFT JOIN (
         SELECT subscription_id, COUNT(*) AS renewal_count
         FROM subscription_renewal_logs
         GROUP BY subscription_id
       ) rl ON rl.subscription_id = s.id
       WHERE s.user_id = ? AND s.id IN (${subPlaceholders})`,
            [userId, ...subscriptionIds]
        );

        for (const r of details) {
            detailsMap.set(r.subscription_id, {
                subscription_status: r.subscription_status,
                is_attended: r.is_attended,
                starts_at: r.starts_at,
                expires_at: r.account_expires_at || r.subscription_expires_at,
                expires_at_is_date_only: !r.account_expires_at,
                duration_name: r.duration_name,
                renewal_count: Number(r.renewal_count || 0),
                renewal_price: Number(r.renewal_price ?? r.subscription_price ?? 0),
                renewal_currency: r.subscription_currency,
                is_renewable: Number(r.is_renewable) === 1,
                account: r.platform_account_id
                    ? {
                        id: r.platform_account_id,
                        email: r.email,
                        password: r.password,
                        pin: r.pin,
                        profile_number: r.profile_number,
                        access_url: r.access_url,
                    }
                    : null,
                credential_url: r.token ? `${baseUrl}/s/${r.token}` : null,
            });
        }
    }

    const map = new Map();
    for (const o of orders) map.set(o.id, { ...o, items: [] });

    for (const it of items) {
        const extra = detailsMap.get(it.subscription_id) || null;
        const renewal = getRenewalEligibility({
            expiresAt: extra?.expires_at ?? null,
            expiresAtIsDateOnly: Boolean(extra?.expires_at_is_date_only),
            isRenewable: Boolean(extra?.is_renewable),
            status: extra?.subscription_status ?? null,
            isAttended: extra?.is_attended ?? 0,
            renewalCount: extra?.renewal_count ?? 0,
            platformSlug: it.platform_slug,
            platformName: it.platform_name,
        });

        map.get(it.order_id)?.items.push({
            ...it,
            duration_name: extra?.duration_name ?? null,
            subscription_status: extra?.subscription_status ?? null,
            subscription_starts_at: extra?.starts_at ?? null,
            subscription_expires_at: extra?.expires_at ?? null,
            renewal: {
                is_renewable: Boolean(extra?.is_renewable),
                can_renew_now: renewal.canRenew,
                block_reason: renewal.reason,
                eligible_until_date: renewal.expiresOnDate,
                renewal_price: Number(extra?.renewal_price ?? 0),
                currency: extra?.renewal_currency ?? null,
                renewal_count: Number(extra?.renewal_count || 0),
            },
            account: extra?.account ?? null,
            credential_url: extra?.credential_url ?? null,
        });
    }

    return { orders: Array.from(map.values()), total: totalCount, page: safePage };
}

async function getRenewalsHistory({
    userId,
    q,
    platformId,
    availability = "available",
    page = 1,
    limit = 10,
}) {
    const effectiveExpiresSql = "COALESCE(pa.expires_at, s.expires_at)";
    const effectiveExpiresDateSql =
        "CASE WHEN pa.expires_at IS NOT NULL THEN DATE(DATE_SUB(pa.expires_at, INTERVAL 5 HOUR)) ELSE DATE(s.expires_at) END";
    const where = [
        `s.user_id = ?`,
        `COALESCE(pp.is_renewable, 0) = 1`,
    ];
    const params = [userId];

    const safePage = Math.max(parseInt(page || "1", 10), 1);
    const safeLimit = Math.min(Math.max(parseInt(limit || "10", 10), 1), 50);
    const offset = (safePage - 1) * safeLimit;

    if (platformId) {
        where.push(`s.platform_id = ?`);
        params.push(Number(platformId));
    }

    if (q) {
        const searchTerm = `%${String(q).trim()}%`;
        where.push(`(
          CAST(s.id AS CHAR) LIKE ? OR
          o.order_code LIKE ? OR
          pa.email LIKE ? OR
          pa.pin LIKE ?
        )`);
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (availability === "available") {
        where.push(`LOWER(COALESCE(s.status, '')) != 'cancelled'`);
        where.push(`COALESCE(s.is_attended, 0) = 0`);
        where.push(`${effectiveExpiresSql} IS NOT NULL`);
        where.push(`${effectiveExpiresDateSql} >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))`);
        where.push(`NOT (
          (LOWER(COALESCE(p.slug, '')) IN ('youtube-music', 'youtubemusic')
            OR (LOWER(COALESCE(p.name, '')) LIKE '%youtube%' AND LOWER(COALESCE(p.name, '')) LIKE '%music%'))
          AND COALESCE(rl.renewal_count, 0) >= 2
        )`);
    }

    if (availability === "blocked") {
        where.push(`(
          LOWER(COALESCE(s.status, '')) = 'cancelled' OR
          COALESCE(s.is_attended, 0) = 1 OR
          ${effectiveExpiresSql} IS NULL OR
          ${effectiveExpiresDateSql} < DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)) OR
          (
            (LOWER(COALESCE(p.slug, '')) IN ('youtube-music', 'youtubemusic')
              OR (LOWER(COALESCE(p.name, '')) LIKE '%youtube%' AND LOWER(COALESCE(p.name, '')) LIKE '%music%'))
            AND COALESCE(rl.renewal_count, 0) >= 2
          )
        )`);
    }

    const whereSql = where.join(" AND ");

    const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM subscriptions s
         JOIN order_items oi ON oi.subscription_id = s.id
         JOIN orders o ON o.id = oi.order_id
         JOIN platforms p ON p.id = s.platform_id
         LEFT JOIN durations d ON d.id = s.duration_id
         LEFT JOIN platform_prices pp ON pp.id = s.platform_price_id
         LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
         LEFT JOIN (
           SELECT subscription_id, COUNT(*) AS renewal_count
           FROM subscription_renewal_logs
           GROUP BY subscription_id
         ) rl ON rl.subscription_id = s.id
         WHERE ${whereSql}`,
        params
    );
    const totalCount = Number(countRows?.[0]?.total || 0);

    const [rows] = await pool.query(
        `SELECT
           o.id AS order_id,
           o.order_code,
           o.total AS order_total,
           o.currency AS order_currency,
           o.created_at AS order_created_at,
           oi.id AS item_id,
           s.id AS subscription_id,
           s.status AS subscription_status,
           s.is_attended,
           s.starts_at AS subscription_starts_at,
           s.expires_at AS subscription_expires_at,
           pa.expires_at AS account_expires_at,
           ${effectiveExpiresSql} AS effective_expires_at,
           s.price AS subscription_price,
           s.currency AS subscription_currency,
           p.id AS platform_id,
           p.name AS platform_name,
           p.slug AS platform_slug,
           d.name AS duration_name,
           pp.price AS renewal_price,
           COALESCE(rl.renewal_count, 0) AS renewal_count,
           pa.id AS platform_account_id,
           pa.email,
           pa.password,
           pa.pin,
           pa.profile_number
         FROM subscriptions s
         JOIN order_items oi ON oi.subscription_id = s.id
         JOIN orders o ON o.id = oi.order_id
         JOIN platforms p ON p.id = s.platform_id
         LEFT JOIN durations d ON d.id = s.duration_id
         LEFT JOIN platform_prices pp ON pp.id = s.platform_price_id
         LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
         LEFT JOIN (
           SELECT subscription_id, COUNT(*) AS renewal_count
           FROM subscription_renewal_logs
           GROUP BY subscription_id
         ) rl ON rl.subscription_id = s.id
         WHERE ${whereSql}
         ORDER BY
           CASE
             WHEN ${effectiveExpiresDateSql} = DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)) THEN 0
             ELSE 1
           END ASC,
           ${effectiveExpiresSql} ASC,
           o.created_at DESC
         LIMIT ?, ?`,
        [...params, offset, safeLimit]
    );

    const items = rows.map((row) => {
        const renewal = getRenewalEligibility({
            expiresAt: row.effective_expires_at || row.subscription_expires_at,
            expiresAtIsDateOnly: !row.account_expires_at,
            isRenewable: true,
            status: row.subscription_status,
            isAttended: row.is_attended,
            renewalCount: row.renewal_count,
            platformSlug: row.platform_slug,
            platformName: row.platform_name,
        });

        return {
            order_id: row.order_id,
            order_code: row.order_code,
            order_total: row.order_total,
            order_currency: row.order_currency,
            order_created_at: row.order_created_at,
            item_id: row.item_id,
            subscription_id: row.subscription_id,
            platform_id: row.platform_id,
            platform_name: row.platform_name,
            platform_slug: row.platform_slug,
            duration_name: row.duration_name,
            subscription_status: row.subscription_status,
            subscription_starts_at: row.subscription_starts_at,
            subscription_expires_at: row.effective_expires_at || row.subscription_expires_at,
            original_subscription_expires_at: row.subscription_expires_at,
            account_expires_at: row.account_expires_at,
            renewal: {
                is_renewable: true,
                can_renew_now: renewal.canRenew,
                block_reason: renewal.reason,
                eligible_until_date: renewal.expiresOnDate,
                renewal_price: Number(row.renewal_price ?? row.subscription_price ?? 0),
                currency: row.subscription_currency || row.order_currency,
                renewal_count: Number(row.renewal_count || 0),
            },
            account: row.platform_account_id
                ? {
                    id: row.platform_account_id,
                    email: row.email,
                    password: row.password,
                    pin: row.pin,
                    profile_number: row.profile_number,
                }
                : null,
        };
    });

    return {
        items,
        total: totalCount,
        page: safePage,
        limit: safeLimit,
        pages: Math.max(1, Math.ceil(totalCount / safeLimit)),
    };
}

module.exports = { getOrdersHistory, getRenewalsHistory };
