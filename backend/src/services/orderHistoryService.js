const pool = require("../db");

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
         s.starts_at,
         s.expires_at AS subscription_expires_at,
         d.name AS duration_name,
         a.id AS platform_account_id,
         a.email,
         a.password,
         a.pin,
         a.profile_number,
         a.access_url,
         cl.token
       FROM subscriptions s
       LEFT JOIN durations d ON d.id = s.duration_id
       LEFT JOIN platform_accounts a ON a.id = s.platform_account_id
       LEFT JOIN credential_links cl ON cl.subscription_id = s.id
       WHERE s.user_id = ? AND s.id IN (${subPlaceholders})`,
            [userId, ...subscriptionIds]
        );

        for (const r of details) {
            detailsMap.set(r.subscription_id, {
                subscription_status: r.subscription_status,
                starts_at: r.starts_at,
                expires_at: r.subscription_expires_at,
                duration_name: r.duration_name,
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

        map.get(it.order_id)?.items.push({
            ...it,
            duration_name: extra?.duration_name ?? null,
            subscription_status: extra?.subscription_status ?? null,
            subscription_starts_at: extra?.starts_at ?? null,
            subscription_expires_at: extra?.expires_at ?? null,
            account: extra?.account ?? null,
            credential_url: extra?.credential_url ?? null,
        });
    }

    return { orders: Array.from(map.values()), total: totalCount, page: safePage };
}

module.exports = { getOrdersHistory };
