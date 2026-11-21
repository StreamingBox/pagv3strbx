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

function buildSalesWindows(today, historyStartDate) {
    const monthStartDate = `${today.slice(0, 7)}-01`;
    const [year, month] = today.split("-").map(Number);
    const previousMonthStartDate = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
    const monthToDateDays = dayDistance(monthStartDate, today);
    const previousMonthDays = Math.min(monthToDateDays, dayDistance(previousMonthStartDate, monthStartDate));
    const recent7StartDate = shiftDate(today, -7);
    const previous7StartDate = shiftDate(today, -14);

    return {
        recent7StartDate,
        previous7StartDate,
        monthStartDate,
        previousMonthStartDate,
        previousMonthEndDate: shiftDate(previousMonthStartDate, previousMonthDays),
        monthToDateDays,
        previousMonthDays,
        trendStartDate: [historyStartDate, previous7StartDate, previousMonthStartDate].sort()[0],
    };
}

function isDateOnly(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function countCoveredDemand(members, fallbacks) {
    const count = members.length;
    const sink = count * 2 + 1;
    const residual = Array.from({ length: sink + 1 }, () => Array(sink + 1).fill(0));
    const indexById = new Map(members.map((row, index) => [row.platformId, index]));
    const totalDemand = members.reduce((sum, row) => sum + row.estimatedDemand, 0);

    members.forEach((row, index) => {
        residual[0][index + 1] = row.availableStock;
        residual[count + index + 1][sink] = row.estimatedDemand;
        residual[index + 1][count + index + 1] = totalDemand;
    });
    for (const fallback of fallbacks) {
        const sourceIndex = indexById.get(Number(fallback.source_platform_id));
        const stockIndex = indexById.get(Number(fallback.fallback_platform_id));
        if (sourceIndex === undefined || stockIndex === undefined) continue;
        residual[stockIndex + 1][count + sourceIndex + 1] = totalDemand;
    }

    let coveredDemand = 0;
    while (true) {
        const parent = Array(sink + 1).fill(-1);
        parent[0] = 0;
        const queue = [0];
        for (let head = 0; head < queue.length && parent[sink] === -1; head += 1) {
            const from = queue[head];
            for (let to = 0; to <= sink; to += 1) {
                if (parent[to] === -1 && residual[from][to] > 0) {
                    parent[to] = from;
                    queue.push(to);
                }
            }
        }
        if (parent[sink] === -1) break;

        let amount = Number.MAX_SAFE_INTEGER;
        for (let node = sink; node !== 0; node = parent[node]) {
            amount = Math.min(amount, residual[parent[node]][node]);
        }
        for (let node = sink; node !== 0; node = parent[node]) {
            residual[parent[node]][node] -= amount;
            residual[node][parent[node]] += amount;
        }
        coveredDemand += amount;
    }
    return coveredDemand;
}

function forecastReplenishment(members, fallbacks, salesKey, periodDays, horizonDays) {
    if (!periodDays) return null;
    const projected = members.map((row) => ({
        ...row,
        estimatedDemand: Math.ceil((row[salesKey] / periodDays) * horizonDays),
    }));
    const demand = projected.reduce((sum, row) => sum + row.estimatedDemand, 0);
    return Math.max(demand - countCoveredDemand(projected, fallbacks), 0);
}

function percentChange(current, previous) {
    if (!previous) return current ? null : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
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

    const historyStartDate = shiftDate(today, -historyDays);
    return {
        today,
        targetDate,
        daysAhead,
        horizonDays: daysAhead + 1,
        historyDays,
        historyStartDate,
        salesWindows: buildSalesWindows(today, historyStartDate),
    };
}

function buildPlanningRows(rows, { historyDays, horizonDays, salesWindows = { monthToDateDays: 0, previousMonthDays: 0 } }, fallbacks = [], salesTrends = []) {
    const trendsByPlatformId = new Map(salesTrends.map((trend) => [Number(trend.platform_id), {
        recent7Sales: Number(trend.recent_7_sales || 0),
        previous7Sales: Number(trend.previous_7_sales || 0),
        monthToDateSales: Number(trend.month_to_date_sales || 0),
        previousMonthSales: Number(trend.previous_month_sales || 0),
    }]));
    const platformRows = rows.map((row) => {
        const historicalSales = Number(row.historical_sales || 0);
        const averageDailySales = historicalSales / historyDays;
        const estimatedDemand = Math.ceil(averageDailySales * horizonDays);
        const availableStock = Number(row.available_stock || 0);
        const salesTrend = trendsByPlatformId.get(Number(row.platform_id)) || {
            recent7Sales: 0,
            previous7Sales: 0,
            monthToDateSales: 0,
            previousMonthSales: 0,
        };

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
            ...salesTrend,
        };
    });

    const parentById = new Map(platformRows.map((row) => [row.platformId, row.platformId]));
    const find = (id) => {
        const parent = parentById.get(id);
        if (parent === undefined) return undefined;
        if (parent !== id) parentById.set(id, find(parent));
        return parentById.get(id);
    };
    for (const fallback of fallbacks) {
        const sourceId = Number(fallback.source_platform_id);
        const fallbackId = Number(fallback.fallback_platform_id);
        const sourceRoot = find(sourceId);
        const fallbackRoot = find(fallbackId);
        if (sourceRoot !== undefined && fallbackRoot !== undefined && sourceRoot !== fallbackRoot) {
            parentById.set(fallbackRoot, sourceRoot);
        }
    }

    const groups = new Map();
    for (const row of platformRows) {
        const root = find(row.platformId);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(row);
    }

    return [...groups.values()].map((members) => {
        const historicalSales = members.reduce((sum, row) => sum + row.historicalSales, 0);
        const estimatedDemand = members.reduce((sum, row) => sum + row.estimatedDemand, 0);
        const availableStock = members.reduce((sum, row) => sum + row.availableStock, 0);
        const coveredDemand = countCoveredDemand(members, fallbacks);
        const recent7Sales = members.reduce((sum, row) => sum + row.recent7Sales, 0);
        const previous7Sales = members.reduce((sum, row) => sum + row.previous7Sales, 0);
        const monthToDateSales = members.reduce((sum, row) => sum + row.monthToDateSales, 0);
        const previousMonthSales = members.reduce((sum, row) => sum + row.previousMonthSales, 0);
        const scenarioMembers = members.map((row) => ({ ...row, recent14Sales: row.recent7Sales + row.previous7Sales }));
        return {
            platformId: members.length === 1 ? members[0].platformId : members.map((row) => row.platformId).join("+"),
            platformName: members.map((row) => row.platformName).join(" + "),
            platformSlug: members.map((row) => row.platformSlug).join("+"),
            historicalSales,
            averageDailySales: Number((historicalSales / historyDays).toFixed(2)),
            expiringSubscriptions: members.reduce((sum, row) => sum + row.expiringSubscriptions, 0),
            estimatedDemand,
            availableStock,
            suggestedToReplenish: Math.max(estimatedDemand - coveredDemand, 0),
            salesTrend: {
                recent7Sales,
                previous7Sales,
                weeklyChangePercent: percentChange(recent7Sales, previous7Sales),
                monthToDateSales,
                previousMonthSales,
                monthlyChangePercent: salesWindows.monthToDateDays && salesWindows.previousMonthDays
                    ? percentChange(monthToDateSales, previousMonthSales)
                    : null,
                replenishment: {
                    recent7: forecastReplenishment(members, fallbacks, "recent7Sales", 7, horizonDays),
                    recent14: forecastReplenishment(scenarioMembers, fallbacks, "recent14Sales", 14, horizonDays),
                    monthToDate: forecastReplenishment(members, fallbacks, "monthToDateSales", salesWindows.monthToDateDays, horizonDays),
                    selectedHistory: Math.max(estimatedDemand - coveredDemand, 0),
                },
            },
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

const PLATFORM_FALLBACKS_QUERY = `
    SELECT source_platform_id, fallback_platform_id
    FROM platform_fallbacks
    WHERE is_active = 1
`;

const SALES_TREND_QUERY = `
    SELECT p.id AS platform_id,
           SUM(CASE WHEN o.created_at >= ? AND o.created_at < ? THEN 1 ELSE 0 END) AS recent_7_sales,
           SUM(CASE WHEN o.created_at >= ? AND o.created_at < ? THEN 1 ELSE 0 END) AS previous_7_sales,
           SUM(CASE WHEN o.created_at >= ? AND o.created_at < ? THEN 1 ELSE 0 END) AS month_to_date_sales,
           SUM(CASE WHEN o.created_at >= ? AND o.created_at < ? THEN 1 ELSE 0 END) AS previous_month_sales
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN subscription_renewal_logs srl ON srl.renewal_order_id = o.id
    JOIN platforms p ON p.id = COALESCE(oi.delivered_platform_id, oi.platform_id)
    WHERE o.created_at >= ?
      AND o.created_at < ?
      AND srl.id IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM sales_adjustments sa
          WHERE sa.order_item_id = oi.id AND sa.item_count_delta < 0
      )
      AND p.is_active = 1
      AND COALESCE(p.type, 'normal') <> 'correo'
      AND COALESCE(p.is_event_link, 0) = 0
    GROUP BY p.id
`;

router.get("/admin/stock-planning", requireAuth, requireRole("admin"), async (req, res) => {
    const params = normalizeParams(req.query || {});
    if (params.error) return res.status(400).json({ message: params.error });

    try {
        const startAt = (date) => `${date} 05:00:00`;
        const [[rows], [fallbacks], [salesTrends]] = await Promise.all([
            pool.query(STOCK_PLANNING_QUERY, [
                startAt(params.historyStartDate),
                startAt(params.today),
                params.targetDate,
                params.today,
                params.targetDate,
            ]),
            pool.query(PLATFORM_FALLBACKS_QUERY),
            pool.query(SALES_TREND_QUERY, [
                startAt(params.salesWindows.recent7StartDate), startAt(params.today),
                startAt(params.salesWindows.previous7StartDate), startAt(params.salesWindows.recent7StartDate),
                startAt(params.salesWindows.monthStartDate), startAt(params.today),
                startAt(params.salesWindows.previousMonthStartDate), startAt(params.salesWindows.previousMonthEndDate),
                startAt(params.salesWindows.trendStartDate), startAt(params.today),
            ]),
        ]);
        return res.json({
            today: params.today,
            targetDate: params.targetDate,
            daysAhead: params.daysAhead,
            historyDays: params.historyDays,
            historyStartDate: params.historyStartDate,
            salesPeriods: {
                recent7Days: 7,
                previous7Days: 7,
                monthToDateDays: params.salesWindows.monthToDateDays,
                previousMonthDays: params.salesWindows.previousMonthDays,
            },
            rows: buildPlanningRows(rows, params, fallbacks, salesTrends),
        });
    } catch (error) {
        console.error("Error GET /admin/stock-planning:", error);
        return res.status(500).json({ message: "No se pudo calcular la planeación de stock." });
    }
});

module.exports = router;
module.exports.__testing = { buildPlanningRows, buildSalesWindows, dayDistance, normalizeParams, shiftDate, STOCK_PLANNING_QUERY, PLATFORM_FALLBACKS_QUERY, SALES_TREND_QUERY };
