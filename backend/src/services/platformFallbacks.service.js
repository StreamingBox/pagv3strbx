async function getPlatformFallbacks(conn, sourcePlatformId = null) {
    const params = [];
    const where = [];

    if (sourcePlatformId) {
        where.push("pf.source_platform_id = ?");
        params.push(Number(sourcePlatformId));
    }

    const [rows] = await conn.query(
        `SELECT
            pf.id,
            pf.source_platform_id,
            source.name AS source_platform_name,
            source.slug AS source_platform_slug,
            pf.fallback_platform_id,
            fallback.name AS fallback_platform_name,
            fallback.slug AS fallback_platform_slug,
            pf.priority,
            pf.is_active,
            COALESCE(stock.stock, 0) AS fallback_stock
         FROM platform_fallbacks pf
         JOIN platforms source ON source.id = pf.source_platform_id
         JOIN platforms fallback ON fallback.id = pf.fallback_platform_id
         LEFT JOIN (
            SELECT platform_id, COUNT(*) AS stock
            FROM platform_accounts
            WHERE status = 'available'
              AND (expires_at IS NULL OR DATE(DATE_SUB(expires_at, INTERVAL 5 HOUR)) >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)))
            GROUP BY platform_id
         ) stock ON stock.platform_id = pf.fallback_platform_id
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY source.name ASC, pf.priority ASC, fallback.name ASC`,
        params
    );

    return rows;
}

async function findAvailableAccountForPlatform(conn, platformId, options = {}) {
    const requestedPlatformId = Number(platformId);
    const excludeAccountId = Number(options.excludeAccountId || 0);
    const specificAccountId = Number(options.accountId || 0);

    if (!Number.isInteger(requestedPlatformId) || requestedPlatformId <= 0) {
        const err = new Error("platformId invalido.");
        err.status = 400;
        throw err;
    }

    if (specificAccountId > 0) {
        const [specificRows] = await conn.query(
            `SELECT pa.id, pa.platform_id, pa.email, pa.password, pa.pin, pa.profile_number, pa.access_url, pa.unit_cost,
                    p.name AS delivered_platform_name, p.slug AS delivered_platform_slug
             FROM platform_accounts pa
             JOIN platforms p ON p.id = pa.platform_id
             WHERE pa.id = ?
               AND pa.status = 'available'
               AND pa.id <> ?
               AND (
                    pa.platform_id = ?
                    OR pa.platform_id IN (
                        SELECT fallback_platform_id
                        FROM platform_fallbacks
                        WHERE source_platform_id = ? AND is_active = 1
                    )
               )
               AND (pa.expires_at IS NULL OR DATE(DATE_SUB(pa.expires_at, INTERVAL 5 HOUR)) >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)))
             LIMIT 1
             FOR UPDATE`,
            [specificAccountId, excludeAccountId || 0, requestedPlatformId, requestedPlatformId]
        );

        return specificRows[0]
            ? {
                account: specificRows[0],
                requestedPlatformId,
                deliveredPlatformId: Number(specificRows[0].platform_id),
                usedFallback: Number(specificRows[0].platform_id) !== requestedPlatformId,
            }
            : null;
    }

    const [rows] = await conn.query(
        `SELECT pa.id, pa.platform_id, pa.email, pa.password, pa.pin, pa.profile_number, pa.access_url, pa.unit_cost,
                p.name AS delivered_platform_name, p.slug AS delivered_platform_slug,
                candidate.priority
         FROM (
            SELECT ? AS platform_id, 0 AS priority
            UNION ALL
            SELECT fallback_platform_id AS platform_id, priority
            FROM platform_fallbacks
            WHERE source_platform_id = ? AND is_active = 1
         ) candidate
         JOIN platform_accounts pa ON pa.platform_id = candidate.platform_id
         JOIN platforms p ON p.id = pa.platform_id AND p.is_active = 1
         WHERE pa.status = 'available'
           AND pa.id <> ?
           AND (pa.expires_at IS NULL OR DATE(DATE_SUB(pa.expires_at, INTERVAL 5 HOUR)) >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)))
         ORDER BY candidate.priority ASC, pa.id ASC
         LIMIT 1
         FOR UPDATE`,
        [requestedPlatformId, requestedPlatformId, excludeAccountId || 0]
    );

    return rows[0]
        ? {
            account: rows[0],
            requestedPlatformId,
            deliveredPlatformId: Number(rows[0].platform_id),
            usedFallback: Number(rows[0].platform_id) !== requestedPlatformId,
        }
        : null;
}

module.exports = {
    getPlatformFallbacks,
    findAvailableAccountForPlatform,
};
