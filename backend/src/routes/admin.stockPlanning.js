const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { bogotaDateSql, currentBogotaDateOnly } = require("../utils/date");

const router = express.Router();
const HISTORY_DAY_OPTIONS = new Set([30, 60, 90, 180, 270, 300]);
const MAX_FORECAST_DAYS = 365;
const FORECAST_WEIGHTS = { recent7: 0.15, recent30: 0.35, recent90: 0.3, selectedHistory: 0.2 };

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
    const recent30StartDate = shiftDate(today, -30);
    const recent90StartDate = shiftDate(today, -90);

    return {
        todayEndDate: shiftDate(today, 1),
        recent7StartDate,
        previous7StartDate,
        recent30StartDate,
        recent90StartDate,
        monthStartDate,
        previousMonthStartDate,
        previousMonthEndDate: shiftDate(previousMonthStartDate, previousMonthDays),
        monthToDateDays,
        previousMonthDays,
        trendStartDate: [historyStartDate, previous7StartDate, recent90StartDate, previousMonthStartDate].sort()[0],
    };
}

function remainingBogotaDayFraction(now) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    const secondsElapsed = (values.hour * 3600) + (values.minute * 60) + values.second;
    return Math.max(0, (86400 - secondsElapsed) / 86400);
}

function observedWindowDays(firstSaleDate, startDate, today, windowDays) {
    if (!firstSaleDate || !isDateOnly(firstSaleDate) || !startDate || !today) return windowDays;
    const effectiveStartDate = firstSaleDate > startDate ? firstSaleDate : startDate;
    return Math.max(1, Math.min(windowDays, dayDistance(effectiveStartDate, today)));
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

function forecastReplenishment(members, fallbacks, salesKey, periodDays, horizonDays, observedDaysKey = null) {
    if (!periodDays) return null;
    const projected = members.map((row) => ({
        ...row,
        estimatedDemand: Math.ceil((row[salesKey] / Math.max(1, Number(row[observedDaysKey] || periodDays))) * horizonDays),
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
        return { error: "El historial debe ser de 30, 60, 90, 180, 270 o 300 días." };
    }

    const targetDate = query.targetDate || shiftDate(today, 7);
    const historyDays = query.historyDays === undefined ? 300 : Number(query.historyDays);

    if (!isDateOnly(targetDate)) return { error: "La fecha objetivo debe tener formato YYYY-MM-DD." };
    const daysAhead = dayDistance(today, targetDate);
    if (daysAhead < 0 || daysAhead > MAX_FORECAST_DAYS) {
        return { error: "La fecha objetivo debe estar entre hoy y los próximos 365 días." };
    }
    if (!HISTORY_DAY_OPTIONS.has(historyDays)) {
        return { error: "El historial debe ser de 30, 60, 90, 180, 270 o 300 días." };
    }

    const historyStartDate = shiftDate(today, -historyDays);
    return {
        today,
        targetDate,
        daysAhead,
        horizonDays: daysAhead + remainingBogotaDayFraction(now),
        historyDays,
        historyStartDate,
        salesWindows: buildSalesWindows(today, historyStartDate),
    };
}

function buildPlanningRows(rows, { historyDays, horizonDays, today, historyStartDate, salesWindows = { monthToDateDays: 0, previousMonthDays: 0 } }, fallbacks = [], salesTrends = []) {
    const trendsByPlatformId = new Map(salesTrends.map((trend) => [Number(trend.platform_id), {
        firstSaleDate: String(trend.first_sale_date || "").slice(0, 10) || null,
        todaySales: Number(trend.today_sales || 0),
        recent7Sales: Number(trend.recent_7_sales || 0),
        previous7Sales: Number(trend.previous_7_sales || 0),
        recent30Sales: Number(trend.recent_30_sales || 0),
        recent90Sales: Number(trend.recent_90_sales || 0),
        monthToDateSales: Number(trend.month_to_date_sales || 0),
        previousMonthSales: Number(trend.previous_month_sales || 0),
    }]));
    const platformRows = rows.map((row) => {
        const historicalSales = Number(row.historical_sales || 0);
        const availableStock = Number(row.available_stock || 0);
        const salesTrend = trendsByPlatformId.get(Number(row.platform_id)) || {
            firstSaleDate: null,
            todaySales: 0,
            recent7Sales: 0,
            previous7Sales: 0,
            recent30Sales: 0,
            recent90Sales: 0,
            monthToDateSales: 0,
            previousMonthSales: 0,
        };
        const firstSaleDate = salesTrend.firstSaleDate;
        const salesTrendValues = { ...salesTrend };
        delete salesTrendValues.firstSaleDate;
        const observedDays = (startDate, days) => observedWindowDays(firstSaleDate, startDate, today, days);
        const historyDaysObserved = observedDays(historyStartDate, historyDays);
        const recent7SalesDays = observedDays(salesWindows.recent7StartDate, 7);
        const recent14SalesDays = observedDays(salesWindows.previous7StartDate, 14);
        const recent30SalesDays = observedDays(salesWindows.recent30StartDate, 30);
        const recent90SalesDays = observedDays(salesWindows.recent90StartDate, 90);
        const monthToDateSalesDays = salesWindows.monthToDateDays
            ? observedDays(salesWindows.monthStartDate, salesWindows.monthToDateDays)
            : 0;
        const averageDailySales = historicalSales / historyDaysObserved;
        const recent30DailySales = salesTrend.recent30Sales / recent30SalesDays;
        const recent90DailySales = salesTrend.recent90Sales / recent90SalesDays;
        const recent7DailySales = salesTrend.recent7Sales / recent7SalesDays;
        const forecastDailySales = (recent7DailySales * FORECAST_WEIGHTS.recent7)
            + (recent30DailySales * FORECAST_WEIGHTS.recent30)
            + (recent90DailySales * FORECAST_WEIGHTS.recent90)
            + (averageDailySales * FORECAST_WEIGHTS.selectedHistory);
        const estimatedDemand = Math.ceil(forecastDailySales * horizonDays);

        return {
            platformId: Number(row.platform_id),
            platformName: String(row.platform_name || ""),
            platformSlug: String(row.platform_slug || ""),
            historicalSales,
            averageDailySales: Number(averageDailySales.toFixed(2)),
            forecastDailySales: Number(forecastDailySales.toFixed(2)),
            recent7SalesDays,
            recent14Sales: salesTrend.recent7Sales + salesTrend.previous7Sales,
            recent14SalesDays,
            recent30SalesDays,
            recent90SalesDays,
            monthToDateSalesDays,
            expiringSubscriptions: Number(row.expiring_subscriptions || 0),
            estimatedDemand,
            availableStock,
            suggestedToReplenish: Math.max(estimatedDemand - availableStock, 0),
            ...salesTrendValues,
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
        const averageDailySales = members.reduce((sum, row) => sum + row.averageDailySales, 0);
        const forecastDailySales = members.reduce((sum, row) => sum + row.forecastDailySales, 0);
        const todaySales = members.reduce((sum, row) => sum + row.todaySales, 0);
        const recent7Sales = members.reduce((sum, row) => sum + row.recent7Sales, 0);
        const previous7Sales = members.reduce((sum, row) => sum + row.previous7Sales, 0);
        const monthToDateSales = members.reduce((sum, row) => sum + row.monthToDateSales, 0);
        const previousMonthSales = members.reduce((sum, row) => sum + row.previousMonthSales, 0);
        return {
            platformId: members.length === 1 ? members[0].platformId : members.map((row) => row.platformId).join("+"),
            platformName: members.map((row) => row.platformName).join(" + "),
            platformSlug: members.map((row) => row.platformSlug).join("+"),
            historicalSales,
            averageDailySales: Number(averageDailySales.toFixed(2)),
            forecastDailySales: Number(forecastDailySales.toFixed(2)),
            expiringSubscriptions: members.reduce((sum, row) => sum + row.expiringSubscriptions, 0),
            estimatedDemand,
            availableStock,
            suggestedToReplenish: Math.max(estimatedDemand - coveredDemand, 0),
            salesTrend: {
                todaySales,
                recent7Sales,
                previous7Sales,
                weeklyChangePercent: percentChange(recent7Sales, previous7Sales),
                monthToDateSales,
                previousMonthSales,
                monthlyChangePercent: salesWindows.monthToDateDays && salesWindows.previousMonthDays
                    ? percentChange(monthToDateSales, previousMonthSales)
                    : null,
                replenishment: {
                    recent7: forecastReplenishment(members, fallbacks, "recent7Sales", 7, horizonDays, "recent7SalesDays"),
                    recent14: forecastReplenishment(members, fallbacks, "recent14Sales", 14, horizonDays, "recent14SalesDays"),
                    recent30: forecastReplenishment(members, fallbacks, "recent30Sales", 30, horizonDays, "recent30SalesDays"),
                    recent90: forecastReplenishment(members, fallbacks, "recent90Sales", 90, horizonDays, "recent90SalesDays"),
                    monthToDate: forecastReplenishment(members, fallbacks, "monthToDateSales", salesWindows.monthToDateDays, horizonDays, "monthToDateSalesDays"),
                    selectedHistory: forecastReplenishment(members, fallbacks, "averageDailySales", 1, horizonDays),
                    weighted: Math.max(estimatedDemand - coveredDemand, 0),
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
           DATE_FORMAT(MIN(${bogotaDateSql("o.created_at")}), '%Y-%m-%d') AS first_sale_date,
           SUM(CASE WHEN o.created_at >= ? AND o.created_at < ? THEN 1 ELSE 0 END) AS today_sales,
           SUM(CASE WHEN o.created_at >= ? AND o.created_at < ? THEN 1 ELSE 0 END) AS recent_7_sales,
           SUM(CASE WHEN o.created_at >= ? AND o.created_at < ? THEN 1 ELSE 0 END) AS previous_7_sales,
           SUM(CASE WHEN o.created_at >= ? AND o.created_at < ? THEN 1 ELSE 0 END) AS recent_30_sales,
           SUM(CASE WHEN o.created_at >= ? AND o.created_at < ? THEN 1 ELSE 0 END) AS recent_90_sales,
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
                startAt(params.today), startAt(params.salesWindows.todayEndDate),
                startAt(params.salesWindows.recent7StartDate), startAt(params.today),
                startAt(params.salesWindows.previous7StartDate), startAt(params.salesWindows.recent7StartDate),
                startAt(params.salesWindows.recent30StartDate), startAt(params.today),
                startAt(params.salesWindows.recent90StartDate), startAt(params.today),
                startAt(params.salesWindows.monthStartDate), startAt(params.today),
                startAt(params.salesWindows.previousMonthStartDate), startAt(params.salesWindows.previousMonthEndDate),
                startAt(params.salesWindows.trendStartDate), startAt(params.salesWindows.todayEndDate),
            ]),
        ]);
        return res.json({
            today: params.today,
            targetDate: params.targetDate,
            daysAhead: params.daysAhead,
            historyDays: params.historyDays,
            historyStartDate: params.historyStartDate,
            forecastModel: { weights: FORECAST_WEIGHTS, historyDays: params.historyDays },
            salesPeriods: {
                recent7Days: 7,
                previous7Days: 7,
                recent30Days: 30,
                recent90Days: 90,
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
module.exports.__testing = { buildPlanningRows, buildSalesWindows, dayDistance, normalizeParams, remainingBogotaDayFraction, shiftDate, FORECAST_WEIGHTS, STOCK_PLANNING_QUERY, PLATFORM_FALLBACKS_QUERY, SALES_TREND_QUERY };
