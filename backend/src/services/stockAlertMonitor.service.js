const pool = require("../db");
const { notifyOutOfStockPlatforms } = require("./telegramBot");
const { calculateStockAlertTransitions } = require("../utils/stockAlertTransitions");

const DEFAULT_INTERVAL_MS = 2 * 60 * 1000;
let checkRunning = false;

async function getPublishedPlatformStock() {
    const [rows] = await pool.query(`
        SELECT
            p.id AS platform_id,
            p.name AS platform_name,
            COALESCE(direct_stock.stock, 0) AS direct_stock,
            COALESCE(fallback_stock.stock, 0) AS fallback_stock,
            CASE
                WHEN COALESCE(direct_stock.stock, 0) > 0 THEN COALESCE(direct_stock.stock, 0)
                ELSE COALESCE(fallback_stock.stock, 0)
            END AS effective_stock
        FROM platforms p
        JOIN (
            SELECT DISTINCT platform_id
            FROM platform_prices
            WHERE is_active = 1
               OR (show_in_lite = 1 AND lite_price_cop IS NOT NULL)
        ) offers ON offers.platform_id = p.id
        LEFT JOIN (
            SELECT platform_id, COUNT(*) AS stock
            FROM platform_accounts
            WHERE status = 'available'
              AND (
                  expires_at IS NULL
                  OR DATE(DATE_SUB(expires_at, INTERVAL 5 HOUR)) >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))
              )
            GROUP BY platform_id
        ) direct_stock ON direct_stock.platform_id = p.id
        LEFT JOIN (
            SELECT pf.source_platform_id AS platform_id, SUM(COALESCE(stock.stock, 0)) AS stock
            FROM platform_fallbacks pf
            JOIN platforms fallback_platform
              ON fallback_platform.id = pf.fallback_platform_id
             AND fallback_platform.is_active = 1
            LEFT JOIN (
                SELECT platform_id, COUNT(*) AS stock
                FROM platform_accounts
                WHERE status = 'available'
                  AND (
                      expires_at IS NULL
                      OR DATE(DATE_SUB(expires_at, INTERVAL 5 HOUR)) >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))
                  )
                GROUP BY platform_id
            ) stock ON stock.platform_id = pf.fallback_platform_id
            WHERE pf.is_active = 1
            GROUP BY pf.source_platform_id
        ) fallback_stock ON fallback_stock.platform_id = p.id
        WHERE p.is_active = 1
        ORDER BY p.name ASC
    `);
    return rows;
}

async function saveStockStates(stockRows, notifiedPlatformIds) {
    if (!stockRows.length) return;
    const notified = new Set(notifiedPlatformIds.map(Number));
    const placeholders = stockRows.map(() => "(?, ?, ?, ?)").join(", ");
    const params = [];

    for (const row of stockRows) {
        const platformId = Number(row.platform_id);
        const stock = Math.max(0, Number(row.effective_stock || 0));
        const isOutOfStock = stock === 0 && notified.has(platformId) ? 1 : 0;
        params.push(platformId, stock, isOutOfStock, isOutOfStock ? new Date() : null);
    }

    await pool.query(`
        INSERT INTO platform_stock_alert_states
            (platform_id, last_stock, is_out_of_stock, last_notified_at)
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE
            last_stock = VALUES(last_stock),
            last_notified_at = CASE
                WHEN VALUES(is_out_of_stock) = 1 AND platform_stock_alert_states.is_out_of_stock = 0
                    THEN VALUES(last_notified_at)
                ELSE platform_stock_alert_states.last_notified_at
            END,
            is_out_of_stock = VALUES(is_out_of_stock)
    `, params);

    const activePlaceholders = stockRows.map(() => "?").join(", ");
    await pool.query(`
        UPDATE platform_stock_alert_states
        SET last_stock = 0,
            is_out_of_stock = 0
        WHERE platform_id NOT IN (${activePlaceholders})
    `, stockRows.map(row => Number(row.platform_id)));
}

async function checkPlatformStockAlerts() {
    if (checkRunning) return { skipped: true };
    checkRunning = true;
    try {
        const stockRows = await getPublishedPlatformStock();
        const [stateRows] = await pool.query(`
            SELECT platform_id, is_out_of_stock
            FROM platform_stock_alert_states
        `);
        const { outOfStock, recovered } = calculateStockAlertTransitions(stockRows, stateRows);
        let sentCount = 0;

        if (outOfStock.length) {
            sentCount = await notifyOutOfStockPlatforms(outOfStock);
        }

        const previouslyOut = stateRows
            .filter(row => Number(row.is_out_of_stock) === 1)
            .map(row => Number(row.platform_id));
        const notifiedPlatformIds = sentCount > 0
            ? [...previouslyOut, ...outOfStock.map(row => row.platformId)]
            : previouslyOut;

        await saveStockStates(stockRows, notifiedPlatformIds);
        return { checked: stockRows.length, outOfStock, recovered, sentCount };
    } finally {
        checkRunning = false;
    }
}

function startPlatformStockAlertMonitor() {
    const intervalMs = Math.max(
        30 * 1000,
        Number(process.env.STOCK_ALERT_INTERVAL_MS || DEFAULT_INTERVAL_MS)
    );
    const run = () => checkPlatformStockAlerts().catch(error => {
        console.error("[StockAlert] Error revisando inventario:", error?.message || error);
    });

    setTimeout(run, 5000).unref();
    setInterval(run, intervalMs).unref();
    console.log(`[StockAlert] Monitor iniciado cada ${Math.round(intervalMs / 1000)} segundos.`);
}

module.exports = {
    checkPlatformStockAlerts,
    startPlatformStockAlertMonitor,
};
