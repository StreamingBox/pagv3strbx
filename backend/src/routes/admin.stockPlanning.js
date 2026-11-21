const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { bogotaDateSql, currentBogotaDateOnly } = require("../utils/date");

const router = express.Router();
const HISTORY_DAY_OPTIONS = new Set([30, 60, 90]);
const MAX_FORECAST_DAYS = 365;

function shiftDate(dateOnly, days) {
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function dayDistance(fromDate, toDate) {
    return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000);
}

function isDateOnly(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function normalizeParams(query, now = new Date()) {
    const today = currentBogotaDateOnly(now);
    if (query.targetDate !== undefined && typeof query.targetDate !== "string") {
        return { error: "La fecha objetivo debe tener formato YYYY-MM-DD." };
    }
    if (query.historyDays !== undefined && typeof query.historyDays !== "string") {
        return { error: "El historial debe ser de 30, 60 o 90 días." };
    }

    const targetDate = query.targetDate || shiftDate(today, 7);
    const historyDays = query.historyDays === undefined ? 30 : Number(query.historyDays);

    if (!isDateOnly(targetDate)) return { error: "La fecha objetivo debe tener formato YYYY-MM-DD." };
    const daysAhead = dayDistance(today, targetDate);
    if (daysAhead < 0 || daysAhead > MAX_FORECAST_DAYS) {
        return { error: "La fecha objetivo debe estar entre hoy y los próximos 365 días." };
    }
    if (!HISTORY_DAY_OPTIONS.has(historyDays)) {
        return { error: "El historial debe ser de 30, 60 o 90 días." };
    }

    return {
        today,
        targetDate,
        daysAhead,
        horizonDays: daysAhead + 1,
        historyDays,
        historyStartDate: shiftDate(today, -historyDays),
    };
}

function buildPlanningRows(rows, { historyDays, horizonDays }) {
    return rows.map((row) => {
        const historicalSales = Number(row.historical_sales || 0);
        const averageDailySales = historicalSales / historyDays;
        const estimatedDemand = Math.ceil(averageDailySales * horizonDays);
        const availableStock = Number(row.available_stock || 0);

        return {
            platformId: Number(row.platform_id),
            platformName: String(row.platform_name || ""),
            platformSlug: String(row.platform_slug || ""),
            historicalSales,
            averageDailySales: Number(averageDailySales.toFixed(2)),
            expiringSubscriptions: Number(row.expiring_subscriptions || 0),
            estimatedDemand,
            availableStock,
            suggestedToReplenish: Math.max(estimatedDemand - availableStock, 0),
        };
    });
}

const STOCK_PLANNING_QUERY = `
    SELECT
        p.id AS platform_id,
        p.name AS platform_name,
        p.slug AS platform_slug,
        COALESCE(sales.historical_sales, 0) AS historical_sales,
        COALESCE(stock.available_stock, 0) AS available_stock,
        COALESCE(expiring.expiring_subscriptions, 0) AS expiring_subscriptions
    FROM platforms p
    LEFT JOIN (
        SELECT COALESCE(oi.delivered_platform_id, oi.platform_id) AS platform_id,
               COUNT(*) AS historical_sales
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN subscription_renewal_logs srl ON srl.renewal_order_id = o.id
        WHERE o.created_at >= ?
          AND o.created_at < ?
          AND srl.id IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM sales_adjustments sa
              WHERE sa.order_item_id = oi.id AND sa.item_count_delta < 0
          )
        GROUP BY COALESCE(oi.delivered_platform_id, oi.platform_id)
    ) sales ON sales.platform_id = p.id
    LEFT JOIN (
        SELECT platform_id, COUNT(*) AS available_stock
        FROM platform_accounts
        WHERE status = 'available'
          AND (expires_at IS NULL OR ${bogotaDateSql("expires_at")} >= ?)
        GROUP BY platform_id
    ) stock ON stock.platform_id = p.id
    LEFT JOIN (
        SELECT platform_id, COUNT(DISTINCT id) AS expiring_subscriptions
        FROM subscriptions
        WHERE status = 'active'
          AND expires_at >= ?
          AND expires_at <= ?
        GROUP BY platform_id
    ) expiring ON expiring.platform_id = p.id
    WHERE p.is_active = 1
      AND COALESCE(p.type, 'normal') <> 'correo'
      AND COALESCE(p.is_event_link, 0) = 0
    ORDER BY p.name ASC
`;

router.get("/admin/stock-planning", requireAuth, requireRole("admin"), async (req, res) => {
    const params = normalizeParams(req.query || {});
    if (params.error) return res.status(400).json({ message: params.error });

    try {
        const [rows] = await pool.query(STOCK_PLANNING_QUERY, [
            `${params.historyStartDate} 05:00:00`,
            `${params.today} 05:00:00`,
            params.targetDate,
            params.today,
            params.targetDate,
        ]);
        return res.json({
            today: params.today,
            targetDate: params.targetDate,
            daysAhead: params.daysAhead,
            historyDays: params.historyDays,
            historyStartDate: params.historyStartDate,
            rows: buildPlanningRows(rows, params),
        });
    } catch (error) {
        console.error("Error GET /admin/stock-planning:", error);
        return res.status(500).json({ message: "No se pudo calcular la planeación de stock." });
    }
});

module.exports = router;
module.exports.__testing = { buildPlanningRows, dayDistance, normalizeParams, shiftDate, STOCK_PLANNING_QUERY };
