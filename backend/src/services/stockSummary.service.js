const pool = require("../db");

const STOCK_SUMMARY_QUERY = `
    SELECT
        p.id AS platform_id,
        p.name AS platform,
        p.slug AS slug,
        COUNT(pa.id) AS available,
        (
            SELECT COUNT(*)
            FROM platform_accounts pa2
            WHERE pa2.platform_id = p.id
              AND pa2.status != 'disabled'
        ) AS total
    FROM platforms p
    LEFT JOIN platform_accounts pa
        ON pa.platform_id = p.id
       AND pa.status = 'available'
    WHERE p.is_active = 1
    GROUP BY p.id, p.name, p.slug
    HAVING available > 0
    ORDER BY available DESC, p.name ASC
`;

/**
 * Returns the same stock view used by the internal Telegram bot.
 * Only aggregate counts are exposed; account credentials never leave the server.
 */
async function getStockSummary(db = pool) {
    const [rows] = await db.query(STOCK_SUMMARY_QUERY);

    return rows.map((row) => ({
        platformId: Number(row.platform_id),
        platform: String(row.platform || ""),
        slug: row.slug == null ? null : String(row.slug),
        available: Number(row.available || 0),
        total: Number(row.total || 0),
    }));
}

module.exports = {
    getStockSummary,
    __testing: { STOCK_SUMMARY_QUERY },
};
