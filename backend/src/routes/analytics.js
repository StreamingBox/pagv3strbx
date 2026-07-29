const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { GEMINI_5TB_COST_COP } = require("../utils/profitCosts");

const router = express.Router();
const DEFAULT_NET_PROFIT_TRACKING_START_AT = "2026-06-12 13:36:47";
const configuredNetProfitStartAt = String(process.env.NET_PROFIT_TRACKING_START_AT || "").trim();
const NET_PROFIT_TRACKING_START_AT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(configuredNetProfitStartAt)
    ? configuredNetProfitStartAt
    : DEFAULT_NET_PROFIT_TRACKING_START_AT;

const SUPPORT_SUBTYPE_LABELS = {
    password_updated: "Clave actualizada",
    login_approved: "Inicio aprobado",
    payment_issue_fixed: "Pago o bloqueo corregido",
    usage_guidance_sent: "Instrucciones enviadas",
    account_unlocked: "Cuenta desbloqueada",
    account_replaced: "Cuenta reemplazada",
    profile_reassigned: "Perfil reasignado",
    stock_replacement: "Reemplazo con stock",
    user_error: "Error de uso del cliente",
    warranty_denied: "Garantia no aplica",
    duplicate_request: "Solicitud duplicada",
    no_response_needed: "Sin accion adicional",
    other_solution: "Otro cierre",
};

const ANALYTICS_CURRENCIES = new Set(["COP", "MXN", "USD"]);

async function resolveAnalyticsCurrency(req, { isAdmin = false } = {}) {
    const requested = String(req.query.currency || "").trim().toUpperCase();
    if (requested) {
        if (!ANALYTICS_CURRENCIES.has(requested)) {
            const error = new Error("Parametro currency invalido");
            error.status = 400;
            throw error;
        }
        return requested;
    }
    if (isAdmin) return "COP";
    const [[user]] = await pool.query("SELECT currency FROM users WHERE id = ? LIMIT 1", [req.user.id]);
    const userCurrency = String(user?.currency || "COP").trim().toUpperCase();
    return ANALYTICS_CURRENCIES.has(userCurrency) ? userCurrency : "COP";
}

function analyticsComparableCostSql({ orderAlias = "o", itemAlias = "oi", accountAlias = "pa", platformAlias = "p", currency = "COP" } = {}) {
    const recordedCost = `COALESCE(NULLIF(${itemAlias}.cost_amount, 0), NULLIF(${accountAlias}.unit_cost, 0))`;
    const costCurrency = `CASE
        WHEN NULLIF(${itemAlias}.cost_amount, 0) IS NOT NULL THEN COALESCE(${itemAlias}.cost_currency, 'COP')
        ELSE COALESCE(${accountAlias}.unit_cost_currency, 'COP')
    END`;
    return `(
        ${knownNoCostPlatformSql(platformAlias)}
        OR ${gemini5TbPlatformSql(platformAlias, orderAlias)}
        OR (${recordedCost} IS NOT NULL AND UPPER(${costCurrency}) = '${currency}')
    )`;
}

function supportSubtypeLabel(key) {
    return SUPPORT_SUBTYPE_LABELS[key] || key || "Sin subtipificar";
}

function normalizedPlatformSql(alias = "p") {
    return `LOWER(CONCAT_WS(' ', ${alias}.name, ${alias}.slug))`;
}

function knownNoCostPlatformSql(alias = "p") {
    const normalized = normalizedPlatformSql(alias);
    return `(${alias}.type = 'correo' AND ${normalized} LIKE '%notion%')`;
}

function gemini5TbPlatformSql(platformAlias = "p", orderAlias = "o") {
    const normalized = normalizedPlatformSql(platformAlias);
    return `(${platformAlias}.type = 'correo' AND UPPER(${orderAlias}.currency) = 'COP' AND ${normalized} LIKE '%gemini%' AND (${normalized} LIKE '%5 tb%' OR ${normalized} LIKE '%almacenamiento%'))`;
}

function analyticsCostSql({ orderAlias = "o", itemAlias = "oi", accountAlias = "pa", platformAlias = "p" } = {}) {
    const recordedCost = `COALESCE(NULLIF(${itemAlias}.cost_amount, 0), NULLIF(${accountAlias}.unit_cost, 0))`;
    return `CASE
        WHEN ${recordedCost} IS NOT NULL THEN ${recordedCost}
        WHEN ${gemini5TbPlatformSql(platformAlias, orderAlias)} THEN ${GEMINI_5TB_COST_COP}
        WHEN ${knownNoCostPlatformSql(platformAlias)} THEN 0
        ELSE 0
    END`;
}

function analyticsMissingCostSql({ orderAlias = "o", itemAlias = "oi", accountAlias = "pa", platformAlias = "p" } = {}) {
    const recordedCost = `COALESCE(NULLIF(${itemAlias}.cost_amount, 0), NULLIF(${accountAlias}.unit_cost, 0))`;
    return `(${recordedCost} IS NULL
        AND NOT ${gemini5TbPlatformSql(platformAlias, orderAlias)}
        AND NOT ${knownNoCostPlatformSql(platformAlias)})`;
}

function buildSalesAdjustmentUserFilter({ isGlobalAdmin, targetUserIds, column = "applies_to_user_id" } = {}) {
    if (isGlobalAdmin) {
        return { sql: "", params: [] };
    }
    const ids = Array.isArray(targetUserIds) ? targetUserIds.filter((id) => Number(id) > 0) : [];
    if (ids.length === 0) {
        return { sql: "AND 1 = 0", params: [] };
    }
    return {
        sql: `AND ${column} IN (${ids.map(() => "?").join(",")})`,
        params: ids,
    };
}

async function getMonthlySalesAdjustments({ year, month, currency, isGlobalAdmin, targetUserIds }) {
    const userFilter = buildSalesAdjustmentUserFilter({ isGlobalAdmin, targetUserIds });
    const [rows] = await pool.query(`
        SELECT DAY(adjustment_date) AS day, SUM(amount) AS amount
        FROM sales_adjustments
        WHERE YEAR(adjustment_date) = ?
          AND MONTH(adjustment_date) = ?
          AND UPPER(currency) = ?
          ${userFilter.sql}
        GROUP BY DAY(adjustment_date)
        ORDER BY day ASC
    `, [year, month, currency, ...userFilter.params]);
    return rows.map((row) => ({
        day: Number(row.day),
        amount: Number(row.amount || 0),
    }));
}

async function getMonthlyPlatformSalesAdjustments({ year, month, currency, isGlobalAdmin, targetUserIds }) {
    const userFilter = buildSalesAdjustmentUserFilter({ isGlobalAdmin, targetUserIds, column: "sa.applies_to_user_id" });
    const [rows] = await pool.query(`
        SELECT
            COALESCE(sa.platform_id, oi.platform_id) AS platform_id,
            COALESCE(MAX(p.name), 'Sin plataforma') AS name,
            SUM(sa.amount) AS amount
        FROM sales_adjustments sa
        LEFT JOIN order_items oi ON oi.id = sa.order_item_id
        LEFT JOIN platforms p ON p.id = COALESCE(sa.platform_id, oi.platform_id)
        WHERE YEAR(sa.adjustment_date) = ?
          AND MONTH(sa.adjustment_date) = ?
          AND UPPER(sa.currency) = ?
          AND COALESCE(sa.platform_id, oi.platform_id) IS NOT NULL
          ${userFilter.sql}
        GROUP BY COALESCE(sa.platform_id, oi.platform_id)
    `, [year, month, currency, ...userFilter.params]);
    return rows.map((row) => ({
        platformId: Number(row.platform_id),
        name: row.name || "Sin plataforma",
        amount: Number(row.amount || 0),
    }));
}

async function getMonthlySalesAdjustmentImpact({ year, month, currency, isGlobalAdmin, targetUserIds }) {
    const userFilter = buildSalesAdjustmentUserFilter({ isGlobalAdmin, targetUserIds, column: "sa.applies_to_user_id" });
    const comparableCostSql = analyticsComparableCostSql({
        orderAlias: "o",
        itemAlias: "oi",
        accountAlias: "pa",
        platformAlias: "p",
        currency,
    });
    const sourceItemIsTrackedSql = `(
        sa.order_item_id IS NOT NULL
        AND o.id IS NOT NULL
        AND DATE_SUB(o.created_at, INTERVAL 5 HOUR) >= ?
        AND ${comparableCostSql}
    )`;
    const sourceItemIsUntrackedSql = `(
        sa.order_item_id IS NOT NULL
        AND o.id IS NOT NULL
        AND DATE_SUB(o.created_at, INTERVAL 5 HOUR) >= ?
        AND NOT ${comparableCostSql}
    )`;
    const genericAdjustmentSql = "(sa.order_item_id IS NULL OR o.id IS NULL)";
    const matchingReversalCostSql = `(
        sa.cost_reversal_amount IS NOT NULL
        AND UPPER(COALESCE(NULLIF(sa.cost_reversal_currency, ''), sa.currency)) = ?
    )`;

    const [rows] = await pool.query(`
        SELECT
            COALESCE(SUM(sa.amount), 0) AS revenue_adjustment,
            COALESCE(SUM(CASE
                WHEN ${genericAdjustmentSql} THEN sa.amount
                WHEN ${sourceItemIsTrackedSql} THEN sa.amount
                ELSE 0
            END), 0) AS tracked_revenue_adjustment,
            COALESCE(SUM(CASE
                WHEN ${genericAdjustmentSql} THEN sa.amount
                WHEN ${sourceItemIsTrackedSql} THEN sa.amount + CASE WHEN ${matchingReversalCostSql} THEN sa.cost_reversal_amount ELSE 0 END
                ELSE 0
            END), 0) AS net_profit_adjustment,
            COALESCE(SUM(CASE
                WHEN ${sourceItemIsTrackedSql} AND ${matchingReversalCostSql} THEN sa.cost_reversal_amount
                ELSE 0
            END), 0) AS cost_reversal_total,
            COALESCE(SUM(CASE WHEN ${sourceItemIsTrackedSql} THEN sa.item_count_delta ELSE 0 END), 0) AS tracked_sales_count_delta,
            COALESCE(SUM(CASE WHEN ${sourceItemIsUntrackedSql} THEN sa.item_count_delta ELSE 0 END), 0) AS missing_cost_count_delta
        FROM sales_adjustments sa
        LEFT JOIN order_items oi ON oi.id = sa.order_item_id
        LEFT JOIN orders o ON o.id = COALESCE(sa.order_id, oi.order_id)
        LEFT JOIN platforms p ON p.id = COALESCE(sa.platform_id, oi.platform_id)
        LEFT JOIN subscriptions s ON s.id = oi.subscription_id
        LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
        WHERE YEAR(sa.adjustment_date) = ?
          AND MONTH(sa.adjustment_date) = ?
          AND UPPER(sa.currency) = ?
          ${userFilter.sql}
    `, [
        NET_PROFIT_TRACKING_START_AT,
        NET_PROFIT_TRACKING_START_AT,
        currency,
        NET_PROFIT_TRACKING_START_AT,
        currency,
        NET_PROFIT_TRACKING_START_AT,
        NET_PROFIT_TRACKING_START_AT,
        year,
        month,
        currency,
        ...userFilter.params,
    ]);

    const row = rows[0] || {};
    return {
        revenueAdjustment: Number(row.revenue_adjustment || 0),
        trackedRevenueAdjustment: Number(row.tracked_revenue_adjustment || 0),
        netProfitAdjustment: Number(row.net_profit_adjustment || 0),
        costReversalTotal: Number(row.cost_reversal_total || 0),
        trackedSalesCountDelta: Number(row.tracked_sales_count_delta || 0),
        missingCostCountDelta: Number(row.missing_cost_count_delta || 0),
    };
}

async function getPlatformSalesAdjustmentImpacts({ monthList, currency, isGlobalAdmin, targetUserIds }) {
    const userFilter = buildSalesAdjustmentUserFilter({ isGlobalAdmin, targetUserIds, column: "sa.applies_to_user_id" });
    const monthFilter = monthList
        .map(() => "(YEAR(sa.adjustment_date) = ? AND MONTH(sa.adjustment_date) = ?)")
        .join(" OR ");
    const monthParams = monthList.flatMap(({ year, month }) => [year, month]);
    const comparableCostSql = analyticsComparableCostSql({
        orderAlias: "o",
        itemAlias: "oi",
        accountAlias: "pa",
        platformAlias: "p",
        currency,
    });

    const [rows] = await pool.query(`
        SELECT
            sa.platform_id,
            sa.order_item_id,
            sa.amount,
            sa.cost_reversal_amount,
            sa.cost_reversal_currency,
            sa.item_count_delta,
            COALESCE(p.id, sa.platform_id, oi.platform_id) AS resolved_platform_id,
            COALESCE(p.name, 'Ajustes generales') AS platform_name,
            CASE
                WHEN sa.order_item_id IS NOT NULL
                 AND o.id IS NOT NULL
                 AND DATE_SUB(o.created_at, INTERVAL 5 HOUR) >= ?
                THEN 1 ELSE 0
            END AS source_item_in_tracking,
            CASE
                WHEN sa.order_item_id IS NOT NULL
                 AND o.id IS NOT NULL
                 AND DATE_SUB(o.created_at, INTERVAL 5 HOUR) >= ?
                 AND ${comparableCostSql}
                THEN 1 ELSE 0
            END AS source_item_tracked
        FROM sales_adjustments sa
        LEFT JOIN order_items oi ON oi.id = sa.order_item_id
        LEFT JOIN orders o ON o.id = COALESCE(sa.order_id, oi.order_id)
        LEFT JOIN platforms p ON p.id = COALESCE(sa.platform_id, oi.platform_id)
        LEFT JOIN subscriptions s ON s.id = oi.subscription_id
        LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
        WHERE (${monthFilter})
          AND UPPER(sa.currency) = ?
          ${userFilter.sql}
    `, [
        ...monthParams,
        NET_PROFIT_TRACKING_START_AT,
        NET_PROFIT_TRACKING_START_AT,
        currency,
        ...userFilter.params,
    ]);

    const impacts = new Map();
    for (const row of rows) {
        const hasLinkedItem = Number(row.order_item_id || 0) > 0;
        const isInTrackedPeriod = Number(row.source_item_in_tracking || 0) === 1;
        if (hasLinkedItem && !isInTrackedPeriod) continue;

        const platformId = Number(row.resolved_platform_id || 0) || null;
        const key = platformId || "general";
        const current = impacts.get(key) || {
            platformId,
            platformName: row.platform_name || "Ajustes generales",
            salesCountDelta: 0,
            revenueTotalAdjustment: 0,
            trackedSalesCountDelta: 0,
            trackedRevenueAdjustment: 0,
            costReversalTotal: 0,
            netProfitAdjustment: 0,
            untrackedSalesCountDelta: 0,
            untrackedRevenueAdjustment: 0,
        };

        const amount = Number(row.amount || 0);
        const itemCountDelta = Number(row.item_count_delta || 0);
        const isTracked = !hasLinkedItem || Number(row.source_item_tracked || 0) === 1;
        const costCurrency = String(row.cost_reversal_currency || currency).toUpperCase();
        const costReversal = isTracked && hasLinkedItem && costCurrency === currency
            ? Math.max(0, Number(row.cost_reversal_amount || 0))
            : 0;

        current.revenueTotalAdjustment += amount;
        if (hasLinkedItem) current.salesCountDelta += itemCountDelta;

        if (isTracked) {
            current.trackedRevenueAdjustment += amount;
            current.costReversalTotal += costReversal;
            current.netProfitAdjustment += amount + costReversal;
            if (hasLinkedItem) current.trackedSalesCountDelta += itemCountDelta;
        } else {
            current.untrackedRevenueAdjustment += amount;
            current.untrackedSalesCountDelta += itemCountDelta;
        }
        impacts.set(key, current);
    }

    return Array.from(impacts.values());
}

function mergeSalesAdjustmentsIntoDaily(dailyRows, adjustmentRows) {
    const byDay = new Map();
    for (const row of dailyRows || []) {
        const day = Number(row.day);
        byDay.set(day, {
            ...row,
            day,
            orders: Number(row.orders || 0),
            revenue: Number(row.revenue || 0),
            adjustment: Number(row.adjustment || 0),
        });
    }
    for (const adjustment of adjustmentRows || []) {
        const day = Number(adjustment.day);
        const amount = Number(adjustment.amount || 0);
        const current = byDay.get(day) || { day, orders: 0, revenue: 0, adjustment: 0 };
        current.revenue = Number(current.revenue || 0) + amount;
        current.adjustment = Number(current.adjustment || 0) + amount;
        byDay.set(day, current);
    }
    return Array.from(byDay.values()).sort((a, b) => Number(a.day) - Number(b.day));
}

function mergeSalesAdjustmentsIntoDistribution(distributionRows, adjustmentRows) {
    const byPlatform = new Map();
    for (const row of distributionRows || []) {
        const platformId = Number(row.platform_id ?? row.platformId ?? row.id);
        if (!platformId) continue;
        byPlatform.set(platformId, {
            ...row,
            platform_id: platformId,
            value: Number(row.value || 0),
        });
    }

    for (const adjustment of adjustmentRows || []) {
        const platformId = Number(adjustment.platformId || adjustment.platform_id);
        if (!platformId) continue;
        const current = byPlatform.get(platformId) || {
            platform_id: platformId,
            name: adjustment.name || "Sin plataforma",
            value: 0,
        };
        current.value = Number(current.value || 0) + Number(adjustment.amount || 0);
        byPlatform.set(platformId, current);
    }

    return Array.from(byPlatform.values())
        .filter((row) => Math.abs(Number(row.value || 0)) > 0.004)
        .sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
}

/**
 * Returns daily sales comparison for current month vs previous month.
 * Admin endpoint: GET /admin/analytics/sales?userId=&year=&month=
 */
router.get("/admin/analytics/sales", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { userId, year, month } = req.query;
        const targetCurrency = await resolveAnalyticsCurrency(req, { isAdmin: true });

        // Current month reference — use Colombia time (UTC-5)
        const now = new Date(Date.now() - 5 * 60 * 60 * 1000);
        const targetYear = parseInt(year, 10) || now.getUTCFullYear();
        const targetMonth = parseInt(month, 10) || (now.getUTCMonth() + 1); // 1-12

        if (!Number.isFinite(targetYear) || !Number.isFinite(targetMonth) ||
            targetMonth < 1 || targetMonth > 12) {
            return res.status(400).json({ error: "Parámetros year/month inválidos" });
        }

        // Previous month
        let prevYear = targetYear;
        let prevMonth = targetMonth - 1;
        if (prevMonth === 0) { prevMonth = 12; prevYear--; }

        const userFilter = userId ? "AND u.id = ?" : "";
        // Parámetros en orden: year, month, [userId]
        const curParams = userId ? [targetYear, targetMonth, targetCurrency, userId] : [targetYear, targetMonth, targetCurrency];
        const prevParams = userId ? [prevYear, prevMonth, targetCurrency, userId] : [prevYear, prevMonth, targetCurrency];

        // Current month daily totals — grouped in Colombia time (UTC-5)
        const curQuery = `
            SELECT
                DAY(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) as day,
                COUNT(o.id) as orders,
                SUM(o.total) as revenue
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE YEAR(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
              AND MONTH(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
              AND UPPER(o.currency) = ?
            ${userFilter}
            GROUP BY DAY(DATE_SUB(o.created_at, INTERVAL 5 HOUR))
            ORDER BY day ASC
        `;
        // Previous month daily totals — grouped in Colombia time (UTC-5)
        const prevQuery = `
            SELECT
                DAY(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) as day,
                COUNT(o.id) as orders,
                SUM(o.total) as revenue
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE YEAR(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
              AND MONTH(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
              AND UPPER(o.currency) = ?
            ${userFilter}
            GROUP BY DAY(DATE_SUB(o.created_at, INTERVAL 5 HOUR))
            ORDER BY day ASC
        `;

        // ✅ Paralelo: curRows y prevRows al mismo tiempo
        const adjustmentScope = {
            isGlobalAdmin: !userId,
            targetUserIds: userId ? [Number(userId)] : [],
        };

        const [[rawCurRows], [rawPrevRows], curAdjustments, prevAdjustments] = await Promise.all([
            pool.query(curQuery, curParams),
            pool.query(prevQuery, prevParams),
            getMonthlySalesAdjustments({ year: targetYear, month: targetMonth, currency: targetCurrency, ...adjustmentScope }),
            getMonthlySalesAdjustments({ year: prevYear, month: prevMonth, currency: targetCurrency, ...adjustmentScope }),
        ]);
        const curRows = mergeSalesAdjustmentsIntoDaily(rawCurRows, curAdjustments);
        const prevRows = mergeSalesAdjustmentsIntoDaily(rawPrevRows, prevAdjustments);

        // Summary totals
        const curTotal = curRows.reduce((s, r) => s + Number(r.revenue || 0), 0);
        const prevTotal = prevRows.reduce((s, r) => s + Number(r.revenue || 0), 0);
        const curOrders = curRows.reduce((s, r) => s + Number(r.orders || 0), 0);
        const prevOrders = prevRows.reduce((s, r) => s + Number(r.orders || 0), 0);

        return res.json({
            currency: targetCurrency,
            current: {
                year: targetYear,
                month: targetMonth,
                daily: curRows,
                total: curTotal,
                orders: curOrders,
                adjustmentsTotal: curAdjustments.reduce((sum, row) => sum + Number(row.amount || 0), 0),
            },
            previous: {
                year: prevYear,
                month: prevMonth,
                daily: prevRows,
                total: prevTotal,
                orders: prevOrders,
                adjustmentsTotal: prevAdjustments.reduce((sum, row) => sum + Number(row.amount || 0), 0),
            },
        });
    } catch (err) {
        console.error("Error GET /admin/analytics/sales:", err);
        res.status(err?.status || 500).json({ error: err?.status ? err.message : "Error interno del servidor" });
    }
});

/**
 * Monthly sales leaderboard for admins.
 * GET /admin/analytics/sales-top?year=&month=
 */
router.get("/admin/analytics/sales-top", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { year, month } = req.query;
        const targetCurrency = await resolveAnalyticsCurrency(req, { isAdmin: true });

        const now = new Date(Date.now() - 5 * 60 * 60 * 1000);
        const targetYear = parseInt(year, 10) || now.getUTCFullYear();
        const targetMonth = parseInt(month, 10) || (now.getUTCMonth() + 1);

        if (!Number.isFinite(targetYear) || !Number.isFinite(targetMonth) || targetMonth < 1 || targetMonth > 12) {
            return res.status(400).json({ error: "Parámetros year/month inválidos" });
        }

        if (!["COP", "MXN", "USD"].includes(targetCurrency)) {
            return res.status(400).json({ error: "ParÃ¡metro currency invÃ¡lido" });
        }

        const adjustmentWhere = `
            YEAR(sa.adjustment_date) = ?
              AND MONTH(sa.adjustment_date) = ?
              AND UPPER(sa.currency) = ?
        `;
        const [[rawSalesRows], [rawPlatformRows], [sellerAdjustmentRows], [platformAdjustmentRows], [summaryAdjustmentRows]] = await Promise.all([
            pool.query(`
                SELECT
                    u.id AS user_id,
                    COALESCE(NULLIF(TRIM(u.name), ''), u.email) AS user_name,
                    u.email,
                    COUNT(o.id) AS orders_count,
                    SUM(o.total) AS revenue
                FROM orders o
                JOIN users u ON u.id = o.user_id
                WHERE YEAR(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
                  AND MONTH(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
                  AND UPPER(o.currency) = ?
                GROUP BY u.id, u.name, u.email
                HAVING SUM(o.total) > 0
            `, [targetYear, targetMonth, targetCurrency]),
            pool.query(`
                SELECT
                    o.user_id,
                    p.id AS platform_id,
                    p.name AS platform_name,
                    COUNT(oi.id) AS platform_sales_count,
                    SUM(oi.price) AS platform_revenue,
                    SUM(${analyticsCostSql()}) AS platform_cost
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                JOIN platforms p ON p.id = oi.platform_id
                LEFT JOIN subscriptions s ON s.id = oi.subscription_id
                LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
                WHERE YEAR(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
                  AND MONTH(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
                  AND UPPER(o.currency) = ?
                  AND oi.price > 0
                GROUP BY o.user_id, p.id, p.name
            `, [targetYear, targetMonth, targetCurrency]),
            pool.query(`
                SELECT
                    sa.applies_to_user_id AS user_id,
                    COALESCE(NULLIF(TRIM(u.name), ''), u.email) AS user_name,
                    u.email,
                    SUM(sa.amount) AS revenue_adjustment
                FROM sales_adjustments sa
                JOIN users u ON u.id = sa.applies_to_user_id
                WHERE ${adjustmentWhere}
                  AND sa.applies_to_user_id IS NOT NULL
                GROUP BY sa.applies_to_user_id, u.name, u.email
            `, [targetYear, targetMonth, targetCurrency]),
            pool.query(`
                SELECT
                    sa.applies_to_user_id AS user_id,
                    sa.platform_id,
                    COALESCE(p.name, '-') AS platform_name,
                    SUM(sa.amount) AS revenue_adjustment,
                    SUM(sa.item_count_delta) AS sales_count_adjustment,
                    SUM(
                        CASE
                            WHEN UPPER(COALESCE(NULLIF(sa.cost_reversal_currency, ''), sa.currency)) = ?
                                THEN COALESCE(sa.cost_reversal_amount, 0)
                            ELSE 0
                        END
                    ) AS cost_reversal
                FROM sales_adjustments sa
                LEFT JOIN platforms p ON p.id = sa.platform_id
                WHERE ${adjustmentWhere}
                  AND sa.applies_to_user_id IS NOT NULL
                  AND sa.platform_id IS NOT NULL
                GROUP BY sa.applies_to_user_id, sa.platform_id, p.name
            `, [targetCurrency, targetYear, targetMonth, targetCurrency]),
            pool.query(`
                SELECT COALESCE(SUM(sa.amount), 0) AS revenue_adjustment
                FROM sales_adjustments sa
                WHERE ${adjustmentWhere}
            `, [targetYear, targetMonth, targetCurrency]),
        ]);

        const sellersById = new Map();
        for (const row of rawSalesRows) {
            sellersById.set(Number(row.user_id), {
                ...row,
                revenue: Number(row.revenue || 0),
                orders_count: Number(row.orders_count || 0),
            });
        }
        for (const row of sellerAdjustmentRows) {
            const userId = Number(row.user_id);
            const seller = sellersById.get(userId) || {
                user_id: userId,
                user_name: row.user_name || row.email,
                email: row.email,
                orders_count: 0,
                revenue: 0,
            };
            seller.revenue += Number(row.revenue_adjustment || 0);
            sellersById.set(userId, seller);
        }
        const salesRows = Array.from(sellersById.values())
            .filter((row) => Math.abs(Number(row.revenue || 0)) > 0.004)
            .sort((a, b) => (
                Number(b.revenue || 0) - Number(a.revenue || 0)
                || Number(b.orders_count || 0) - Number(a.orders_count || 0)
                || String(a.user_name || '').localeCompare(String(b.user_name || ''))
            ));

        const platformsByUserAndId = new Map();
        for (const row of rawPlatformRows) {
            const key = `${Number(row.user_id)}:${Number(row.platform_id)}`;
            platformsByUserAndId.set(key, {
                ...row,
                platform_sales_count: Number(row.platform_sales_count || 0),
                platform_revenue: Number(row.platform_revenue || 0),
                platform_cost: Number(row.platform_cost || 0),
            });
        }
        for (const row of platformAdjustmentRows) {
            const userId = Number(row.user_id);
            const platformId = Number(row.platform_id);
            const key = `${userId}:${platformId}`;
            const platform = platformsByUserAndId.get(key) || {
                user_id: userId,
                platform_id: platformId,
                platform_name: row.platform_name || '-',
                platform_sales_count: 0,
                platform_revenue: 0,
                platform_cost: 0,
            };
            platform.platform_sales_count = Math.max(0, Number(platform.platform_sales_count || 0) + Number(row.sales_count_adjustment || 0));
            platform.platform_revenue = Number(platform.platform_revenue || 0) + Number(row.revenue_adjustment || 0);
            platform.platform_cost = Math.max(0, Number(platform.platform_cost || 0) - Number(row.cost_reversal || 0));
            platformsByUserAndId.set(key, platform);
        }
        const platformRows = Array.from(platformsByUserAndId.values())
            .filter((row) => Math.abs(Number(row.platform_revenue || 0)) > 0.004 || Number(row.platform_sales_count || 0) > 0);
        const totalAdjustments = Number(summaryAdjustmentRows[0]?.revenue_adjustment || 0);
        const sellerAdjustments = sellerAdjustmentRows.reduce(
            (sum, row) => sum + Number(row.revenue_adjustment || 0),
            0,
        );

        const platformStatsByUser = new Map();
        let globalTopPlatform = { name: "—", salesCount: 0, revenue: 0 };

        for (const row of platformRows) {
            const userId = Number(row.user_id);
            if (!platformStatsByUser.has(userId)) {
                platformStatsByUser.set(userId, {
                    costTotal: 0,
                    itemsCount: 0,
                    topPlatform: { name: "—", salesCount: 0, revenue: 0 },
                });
            }

            const entry = platformStatsByUser.get(userId);
            const salesCount = Number(row.platform_sales_count || 0);
            const platformRevenue = Number(row.platform_revenue || 0);
            const platformCost = Number(row.platform_cost || 0);

            entry.costTotal += platformCost;
            entry.itemsCount += salesCount;

            if (
                salesCount > entry.topPlatform.salesCount ||
                (salesCount === entry.topPlatform.salesCount && platformRevenue > entry.topPlatform.revenue)
            ) {
                entry.topPlatform = {
                    name: row.platform_name || "—",
                    salesCount,
                    revenue: platformRevenue,
                };
            }

            if (
                salesCount > globalTopPlatform.salesCount ||
                (salesCount === globalTopPlatform.salesCount && platformRevenue > globalTopPlatform.revenue)
            ) {
                globalTopPlatform = {
                    name: row.platform_name || "—",
                    salesCount,
                    revenue: platformRevenue,
                };
            }
        }

        const items = salesRows.map((row, index) => {
            const userId = Number(row.user_id);
            const stats = platformStatsByUser.get(userId) || {
                costTotal: 0,
                itemsCount: 0,
                topPlatform: { name: "—", salesCount: 0, revenue: 0 },
            };

            return {
                rank: index + 1,
                userId,
                userName: row.user_name || row.email,
                email: row.email,
                currency: targetCurrency,
                monthRevenue: Number(row.revenue || 0),
                ordersCount: Number(row.orders_count || 0),
                itemsCount: Number(stats.itemsCount || 0),
                costTotal: Number(stats.costTotal || 0),
                topPlatform: stats.topPlatform,
            };
        });

        const summary = {
            currency: targetCurrency,
            monthRevenue: items.reduce((sum, item) => sum + item.monthRevenue, 0) + (totalAdjustments - sellerAdjustments),
            ordersCount: items.reduce((sum, item) => sum + item.ordersCount, 0),
            costTotal: items.reduce((sum, item) => sum + item.costTotal, 0),
            salesAdjustmentsTotal: totalAdjustments,
            unassignedAdjustmentsTotal: totalAdjustments - sellerAdjustments,
            topPlatform: globalTopPlatform,
            topSeller: items[0] || null,
        };

        return res.json({
            month: { year: targetYear, month: targetMonth, currency: targetCurrency },
            summary,
            items,
        });
    } catch (err) {
        console.error("Error GET /admin/analytics/sales-top:", err);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

/**
 * User-scoped sales analytics: GET /analytics/sales?year=&month=
 */
router.get("/analytics/sales", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { year, month } = req.query;
        const targetCurrency = await resolveAnalyticsCurrency(req, { isAdmin: req.user.role === "admin" });

        // Use Colombia time (UTC-5) as reference
        const now = new Date(Date.now() - 5 * 60 * 60 * 1000);
        const targetYear = parseInt(year, 10) || now.getUTCFullYear();
        const targetMonth = parseInt(month, 10) || (now.getUTCMonth() + 1);

        if (!Number.isFinite(targetYear) || !Number.isFinite(targetMonth) ||
            targetMonth < 1 || targetMonth > 12) {
            return res.status(400).json({ error: "Parámetros year/month inválidos" });
        }

        let prevYear = targetYear;
        let prevMonth = targetMonth - 1;
        if (prevMonth === 0) { prevMonth = 12; prevYear--; }

        const curQuery = `
            SELECT DAY(DATE_SUB(created_at, INTERVAL 5 HOUR)) as day, COUNT(id) as orders, SUM(total) as revenue
            FROM orders
            WHERE user_id = ?
              AND YEAR(DATE_SUB(created_at, INTERVAL 5 HOUR)) = ?
              AND MONTH(DATE_SUB(created_at, INTERVAL 5 HOUR)) = ?
              AND UPPER(currency) = ?
            GROUP BY DAY(DATE_SUB(created_at, INTERVAL 5 HOUR))
            ORDER BY day ASC
        `;

        const prevQuery = `
            SELECT DAY(DATE_SUB(created_at, INTERVAL 5 HOUR)) as day, COUNT(id) as orders, SUM(total) as revenue
            FROM orders
            WHERE user_id = ?
              AND YEAR(DATE_SUB(created_at, INTERVAL 5 HOUR)) = ?
              AND MONTH(DATE_SUB(created_at, INTERVAL 5 HOUR)) = ?
              AND UPPER(currency) = ?
            GROUP BY DAY(DATE_SUB(created_at, INTERVAL 5 HOUR))
            ORDER BY day ASC
        `;

        // Distribución por plataforma (mes actual)
        const curDistQuery = `
            SELECT p.id AS platform_id, p.name AS name, SUM(oi.price) AS value
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN platforms p ON p.id = oi.platform_id
            WHERE o.user_id = ?
              AND YEAR(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
              AND MONTH(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
              AND UPPER(o.currency) = ?
            GROUP BY p.id, p.name
            ORDER BY value DESC
        `;

        // ✅ Paralelo: las 3 queries al mismo tiempo
        const [[rawCurRows], [rawPrevRows], [curDistRows], curAdjustments, prevAdjustments, curPlatformAdjustments] = await Promise.all([
            pool.query(curQuery, [userId, targetYear, targetMonth, targetCurrency]),
            pool.query(prevQuery, [userId, prevYear, prevMonth, targetCurrency]),
            pool.query(curDistQuery, [userId, targetYear, targetMonth, targetCurrency]),
            getMonthlySalesAdjustments({
                year: targetYear,
                month: targetMonth,
                currency: targetCurrency,
                isGlobalAdmin: false,
                targetUserIds: [userId],
            }),
            getMonthlySalesAdjustments({
                year: prevYear,
                month: prevMonth,
                currency: targetCurrency,
                isGlobalAdmin: false,
                targetUserIds: [userId],
            }),
            getMonthlyPlatformSalesAdjustments({
                year: targetYear,
                month: targetMonth,
                currency: targetCurrency,
                isGlobalAdmin: false,
                targetUserIds: [userId],
            }),
        ]);
        const curRows = mergeSalesAdjustmentsIntoDaily(rawCurRows, curAdjustments);
        const prevRows = mergeSalesAdjustmentsIntoDaily(rawPrevRows, prevAdjustments);

        const curTotal = curRows.reduce((s, r) => s + Number(r.revenue || 0), 0);
        const prevTotal = prevRows.reduce((s, r) => s + Number(r.revenue || 0), 0);
        const curOrders = curRows.reduce((s, r) => s + Number(r.orders || 0), 0);
        const prevOrders = prevRows.reduce((s, r) => s + Number(r.orders || 0), 0);

        return res.json({
            currency: targetCurrency,
            current: {
                year: targetYear,
                month: targetMonth,
                daily: curRows,
                total: curTotal,
                orders: curOrders,
                distribution: mergeSalesAdjustmentsIntoDistribution(curDistRows, curPlatformAdjustments),
                adjustmentsTotal: curAdjustments.reduce((sum, row) => sum + Number(row.amount || 0), 0),
            },
            previous: {
                year: prevYear,
                month: prevMonth,
                daily: prevRows,
                total: prevTotal,
                orders: prevOrders,
                adjustmentsTotal: prevAdjustments.reduce((sum, row) => sum + Number(row.amount || 0), 0),
            },
        });
    } catch (err) {
        console.error("Error GET /analytics/sales:", err);
        res.status(err?.status || 500).json({ error: err?.status ? err.message : "Error interno del servidor" });
    }
});


/**
 * Meses disponibles: GET /analytics/available-months?year=&global=true&userIds=1,2
 * - Usuario normal: solo sus órdenes
 * - Admin global: todas las órdenes
 * - Admin filtrado: órdenes de los userIds solicitados
 */
router.get("/analytics/available-months", requireAuth, async (req, res) => {
    try {
        const actingUser = req.user;
        const isAdmin = actingUser.role === "admin";
        const targetCurrency = await resolveAnalyticsCurrency(req, { isAdmin });
        const { year } = req.query;
        const parsedYear = year ? parseInt(year, 10) : null;

        let userFilter = "AND user_id = ?";
        const params = [targetCurrency, actingUser.id];

        if (isAdmin) {
            if (req.query.global === "true") {
                userFilter = "";
                params.length = 1;
            } else if (req.query.userIds) {
                const ids = req.query.userIds
                    .split(",")
                    .map(id => Number(id.trim()))
                    .filter(id => id > 0);

                if (ids.length > 0) {
                    userFilter = `AND user_id IN (${ids.map(() => "?").join(",")})`;
                    params.length = 1;
                    params.push(...ids);
                }
            }
        }

        const yearFilter = parsedYear && Number.isFinite(parsedYear)
            ? "AND YEAR(DATE_SUB(created_at, INTERVAL 5 HOUR)) = ?"
            : "";
        if (parsedYear && Number.isFinite(parsedYear)) params.push(parsedYear);

        const [rows] = await pool.query(`
            SELECT YEAR(DATE_SUB(created_at, INTERVAL 5 HOUR)) as year,
                   MONTH(DATE_SUB(created_at, INTERVAL 5 HOUR)) as month,
                   SUM(total) as total, COUNT(id) as orders
            FROM orders
            WHERE UPPER(currency) = ? ${userFilter} ${yearFilter}
            GROUP BY YEAR(DATE_SUB(created_at, INTERVAL 5 HOUR)), MONTH(DATE_SUB(created_at, INTERVAL 5 HOUR))
            ORDER BY year DESC, month DESC
        `, params);

        return res.json({ currency: targetCurrency, months: rows });
    } catch (err) {
        console.error("Error GET /analytics/available-months:", err);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

/**
 * Comparación multi-mes: GET /analytics/sales/multi?months=2026-01...,2026-02&userIds=1,2,3
 * Devuelve datos diarios para cada mes solicitado.
 */
router.get("/analytics/sales/multi", requireAuth, async (req, res) => {
    try {
        const actingUser = req.user;
        const isAdmin = actingUser.role === 'admin';
        const targetCurrency = await resolveAnalyticsCurrency(req, { isAdmin });
        // Older clients keep their existing support data. The current client
        // explicitly opts out unless the Support tab is open.
        const includeSupport = String(req.query.includeSupport || "true").toLowerCase() !== "false";

        let targetUserIds = [actingUser.id];
        let isGlobalAdmin = false;

        if (isAdmin) {
            if (req.query.userIds) {
                targetUserIds = req.query.userIds.split(",").map(id => Number(id.trim())).filter(id => id > 0);
            } else if (req.query.global === 'true') {
                isGlobalAdmin = true; // No filter = ALL USERS
            }
        }

        const { months } = req.query;
        if (!months) return res.status(400).json({ error: "Parámetro months requerido" });

        const monthList = months.split(",").slice(0, 6).map(m => {
            const [y, mo] = m.trim().split("-").map(Number);
            return { year: y, month: mo };
        }).filter(m => m.year && m.month);

        const results = await Promise.all(monthList.map(async ({ year, month }) => {
            let dailyQ = `
                SELECT DAY(DATE_SUB(created_at, INTERVAL 5 HOUR)) as day, COUNT(id) as orders, SUM(total) as revenue
                FROM orders
                WHERE YEAR(DATE_SUB(created_at, INTERVAL 5 HOUR)) = ? AND MONTH(DATE_SUB(created_at, INTERVAL 5 HOUR)) = ?
                  AND UPPER(currency) = ?
            `;
            let distQ = `
                SELECT p.id AS platform_id, p.name AS name, SUM(oi.price) AS value
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                JOIN platforms p ON p.id = oi.platform_id
                WHERE YEAR(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ? AND MONTH(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
                  AND UPPER(o.currency) = ?
            `;

            let dailyParams = [year, month, targetCurrency];
            let distParams = [year, month, targetCurrency];

            // If it is NOT a global admin, we filter by targetUserIds
            if (!isGlobalAdmin) {
                const placeholders = targetUserIds.map(() => '?').join(',');
                dailyQ += ` AND user_id IN (${placeholders})`;
                distQ += ` AND o.user_id IN (${placeholders})`;
                dailyParams.push(...targetUserIds);
                distParams.push(...targetUserIds);
            }

            dailyQ += ` GROUP BY DAY(DATE_SUB(created_at, INTERVAL 5 HOUR)) ORDER BY day ASC`;
            distQ += ` GROUP BY p.id, p.name ORDER BY value DESC`;

            const [[dailyRows], [dist], adjustmentRows, platformAdjustmentRows] = await Promise.all([
                pool.query(dailyQ, dailyParams),
                pool.query(distQ, distParams),
                getMonthlySalesAdjustments({
                    year,
                    month,
                    currency: targetCurrency,
                    isGlobalAdmin,
                    targetUserIds,
                }),
                getMonthlyPlatformSalesAdjustments({
                    year,
                    month,
                    currency: targetCurrency,
                    isGlobalAdmin,
                    targetUserIds,
                }),
            ]);
            const daily = mergeSalesAdjustmentsIntoDaily(dailyRows, adjustmentRows);
            const total = daily.reduce((s, r) => s + Number(r.revenue || 0), 0);
            const orders = daily.reduce((s, r) => s + Number(r.orders || 0), 0);
            const adjustmentsTotal = adjustmentRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
            const monthData = {
                year,
                month,
                currency: targetCurrency,
                daily,
                total,
                orders,
                distribution: mergeSalesAdjustmentsIntoDistribution(dist, platformAdjustmentRows),
                adjustmentsTotal,
            };

            if (isAdmin) {
                const comparableCostSql = analyticsComparableCostSql({ currency: targetCurrency });
                let profitQ = `
                    SELECT
                        SUM(CASE WHEN ${comparableCostSql} THEN 1 ELSE 0 END) AS tracked_sales_count,
                        SUM(CASE WHEN ${comparableCostSql} THEN oi.price ELSE 0 END) AS tracked_revenue,
                        SUM(CASE WHEN ${comparableCostSql} THEN ${analyticsCostSql()} ELSE 0 END) AS cost_total,
                        SUM(CASE WHEN ${comparableCostSql} THEN oi.price - ${analyticsCostSql()} ELSE 0 END) AS net_profit,
                        SUM(
                            CASE
                                WHEN NOT ${comparableCostSql} THEN 1
                                ELSE 0
                            END
                        ) AS missing_cost_count
                    FROM order_items oi
                    JOIN orders o ON o.id = oi.order_id
                    JOIN platforms p ON p.id = oi.platform_id
                    LEFT JOIN subscriptions s ON s.id = oi.subscription_id
                    LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
                    WHERE YEAR(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
                      AND MONTH(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
                      AND UPPER(o.currency) = ?
                      AND DATE_SUB(o.created_at, INTERVAL 5 HOUR) >= ?
                `;
                const profitParams = [year, month, targetCurrency, NET_PROFIT_TRACKING_START_AT];

                if (!isGlobalAdmin) {
                    const placeholders = targetUserIds.map(() => "?").join(",");
                    profitQ += ` AND o.user_id IN (${placeholders})`;
                    profitParams.push(...targetUserIds);
                }

                const [[profitRows], adjustmentImpact] = await Promise.all([
                    pool.query(profitQ, profitParams),
                    getMonthlySalesAdjustmentImpact({
                        year,
                        month,
                        currency: targetCurrency,
                        isGlobalAdmin,
                        targetUserIds,
                    }),
                ]);
                const profitRow = profitRows[0] || {};
                const trackedSalesCount = Math.max(
                    0,
                    Number(profitRow?.tracked_sales_count || 0) + adjustmentImpact.trackedSalesCountDelta
                );
                const trackedRevenue = Number(profitRow?.tracked_revenue || 0) + adjustmentImpact.trackedRevenueAdjustment;
                const costTotal = Math.max(0, Number(profitRow?.cost_total || 0) - adjustmentImpact.costReversalTotal);
                const netProfit = Number(profitRow?.net_profit || 0) + adjustmentImpact.netProfitAdjustment;
                const missingCostCount = Math.max(
                    0,
                    Number(profitRow?.missing_cost_count || 0) + adjustmentImpact.missingCostCountDelta
                );
                const marginPct = trackedRevenue > 0 ? Number(((netProfit / trackedRevenue) * 100).toFixed(2)) : 0;

                monthData.netProfitTrackingStartAt = NET_PROFIT_TRACKING_START_AT;
                monthData.trackedSalesCount = trackedSalesCount;
                monthData.trackedRevenue = trackedRevenue;
                monthData.costTotal = costTotal;
                monthData.netProfit = netProfit;
                monthData.marginPct = marginPct;
                monthData.missingCostCount = missingCostCount;
                monthData.balanceComplete = missingCostCount === 0;
                monthData.salesAdjustments = adjustmentImpact;

                if (!includeSupport) return monthData;
                let supportFilter = "";
                const supportParams = [year, month];
                const supportSubtypeParams = [year, month];
                const supportDailyParams = [year, month];
                const supportPlatformParams = [year, month];
                if (!isGlobalAdmin) {
                    const placeholders = targetUserIds.map(() => "?").join(",");
                    supportFilter = ` AND st.user_id IN (${placeholders})`;
                    supportParams.push(...targetUserIds);
                    supportSubtypeParams.push(...targetUserIds);
                    supportDailyParams.push(...targetUserIds);
                    supportPlatformParams.push(...targetUserIds);
                }

                const supportSummaryQ = `
                    SELECT
                        COUNT(*) AS created_count,
                        SUM(CASE WHEN st.status = 'open' THEN 1 ELSE 0 END) AS open_count,
                        SUM(CASE WHEN st.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
                        SUM(CASE WHEN st.status = 'resolved' THEN 1 ELSE 0 END) AS resolved_count,
                        AVG(CASE
                            WHEN st.status = 'resolved' AND st.resolved_at IS NOT NULL
                            THEN TIMESTAMPDIFF(MINUTE, st.created_at, st.resolved_at)
                            ELSE NULL
                        END) AS avg_resolution_minutes
                    FROM support_tickets st
                    WHERE YEAR(DATE_SUB(st.created_at, INTERVAL 5 HOUR)) = ?
                      AND MONTH(DATE_SUB(st.created_at, INTERVAL 5 HOUR)) = ?
                      ${supportFilter}
                `;
                const supportSubtypeQ = `
                    SELECT
                        COALESCE(NULLIF(st.resolution_subtype, ''), NULLIF(st.resolution_type, ''), 'sin_subtipificar') AS subtype_key,
                        COUNT(*) AS count
                    FROM support_tickets st
                    WHERE st.status = 'resolved'
                      AND YEAR(DATE_SUB(st.created_at, INTERVAL 5 HOUR)) = ?
                      AND MONTH(DATE_SUB(st.created_at, INTERVAL 5 HOUR)) = ?
                      ${supportFilter}
                    GROUP BY subtype_key
                    ORDER BY count DESC, subtype_key ASC
                    LIMIT 8
                `;
                const supportDailyQ = `
                    SELECT
                        DAY(DATE_SUB(st.created_at, INTERVAL 5 HOUR)) AS day,
                        COUNT(*) AS created,
                        SUM(CASE WHEN st.status = 'resolved' THEN 1 ELSE 0 END) AS resolved
                    FROM support_tickets st
                    WHERE YEAR(DATE_SUB(st.created_at, INTERVAL 5 HOUR)) = ?
                      AND MONTH(DATE_SUB(st.created_at, INTERVAL 5 HOUR)) = ?
                      ${supportFilter}
                    GROUP BY DAY(DATE_SUB(st.created_at, INTERVAL 5 HOUR))
                    ORDER BY day ASC
                `;
                const supportPlatformsQ = `
                    SELECT p.name AS name, COUNT(*) AS value
                    FROM support_tickets st
                    JOIN platforms p ON p.id = st.platform_id
                    WHERE YEAR(DATE_SUB(st.created_at, INTERVAL 5 HOUR)) = ?
                      AND MONTH(DATE_SUB(st.created_at, INTERVAL 5 HOUR)) = ?
                      ${supportFilter}
                    GROUP BY p.id, p.name
                    ORDER BY value DESC, p.name ASC
                    LIMIT 5
                `;
                const [[[supportSummary]], [supportSubtypes], [supportDaily], [supportPlatforms]] = await Promise.all([
                    pool.query(supportSummaryQ, supportParams),
                    pool.query(supportSubtypeQ, supportSubtypeParams),
                    pool.query(supportDailyQ, supportDailyParams),
                    pool.query(supportPlatformsQ, supportPlatformParams),
                ]);
                const supportCreated = Number(supportSummary?.created_count || 0);
                const supportResolved = Number(supportSummary?.resolved_count || 0);
                const supportPending = Number(supportSummary?.open_count || 0) + Number(supportSummary?.in_progress_count || 0);
                const avgResolutionMinutes = Number(supportSummary?.avg_resolution_minutes || 0);
                monthData.supportStats = {
                    created: supportCreated,
                    open: Number(supportSummary?.open_count || 0),
                    inProgress: Number(supportSummary?.in_progress_count || 0),
                    resolved: supportResolved,
                    pending: supportPending,
                    avgResolutionHours: avgResolutionMinutes > 0 ? Number((avgResolutionMinutes / 60).toFixed(1)) : 0,
                    supportRatePct: orders > 0 ? Number(((supportCreated / orders) * 100).toFixed(2)) : 0,
                    daily: supportDaily.map((row) => ({
                        day: Number(row.day),
                        created: Number(row.created || 0),
                        resolved: Number(row.resolved || 0),
                    })),
                    subtypes: supportSubtypes.map((row) => ({
                        key: row.subtype_key,
                        name: supportSubtypeLabel(row.subtype_key),
                        value: Number(row.count || 0),
                    })),
                    platforms: supportPlatforms.map((row) => ({
                        name: row.name || "Sin plataforma",
                        value: Number(row.value || 0),
                    })),
                };
            }

            return monthData;
        }));

        return res.json({ currency: targetCurrency, months: results });
    } catch (err) {
        console.error("Error GET /analytics/sales/multi:", err);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

/**
 * Rentabilidad por plataforma para administracion.
 * GET /admin/analytics/platform-profit?months=2026-07,2026-06&currency=COP&global=true
 *
 * Los costos solo se comparan cuando estan registrados en la misma moneda de la
 * venta. Esto evita presentar como utilidad un ingreso cuyo costo aun no esta
 * cargado o pertenece a otra moneda.
 */
router.get("/admin/analytics/platform-profit", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const targetCurrency = await resolveAnalyticsCurrency(req, { isAdmin: true });
        const rawMonths = String(req.query.months || "").trim();
        if (!rawMonths) {
            return res.status(400).json({ error: "Parametro months requerido" });
        }

        const monthList = rawMonths
            .split(",")
            .slice(0, 6)
            .map((value) => {
                const [year, month] = value.trim().split("-").map(Number);
                return { year, month };
            })
            .filter(({ year, month }) => Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12);

        if (monthList.length === 0) {
            return res.status(400).json({ error: "No hay meses validos para analizar" });
        }

        let targetUserIds = [];
        let isGlobalAdmin = req.query.global === "true";
        if (!isGlobalAdmin && req.query.userIds) {
            targetUserIds = req.query.userIds
                .split(",")
                .map((id) => Number(id.trim()))
                .filter((id) => Number.isInteger(id) && id > 0);
        }

        // The admin dashboard defaults to the whole operation when no user was selected.
        if (!isGlobalAdmin && targetUserIds.length === 0) {
            isGlobalAdmin = true;
        }

        const monthFilter = monthList
            .map(() => "(YEAR(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ? AND MONTH(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?)")
            .join(" OR ");
        const monthParams = monthList.flatMap(({ year, month }) => [year, month]);
        const userFilter = isGlobalAdmin
            ? ""
            : `AND o.user_id IN (${targetUserIds.map(() => "?").join(",")})`;
        const comparableCostSql = analyticsComparableCostSql({ currency: targetCurrency });
        const costSql = analyticsCostSql();

        const [[rows], adjustmentImpacts] = await Promise.all([
            pool.query(`
            SELECT
                p.id AS platform_id,
                p.name AS platform_name,
                p.slug AS platform_slug,
                COUNT(oi.id) AS sales_count,
                SUM(oi.price) AS revenue_total,
                SUM(CASE WHEN ${comparableCostSql} THEN 1 ELSE 0 END) AS tracked_sales_count,
                SUM(CASE WHEN ${comparableCostSql} THEN oi.price ELSE 0 END) AS tracked_revenue,
                SUM(CASE WHEN ${comparableCostSql} THEN ${costSql} ELSE 0 END) AS cost_total,
                SUM(CASE WHEN ${comparableCostSql} THEN oi.price - ${costSql} ELSE 0 END) AS net_profit,
                SUM(CASE WHEN ${comparableCostSql} THEN 0 ELSE 1 END) AS untracked_sales_count,
                SUM(CASE WHEN ${comparableCostSql} THEN 0 ELSE oi.price END) AS untracked_revenue
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN platforms p ON p.id = oi.platform_id
            LEFT JOIN subscriptions s ON s.id = oi.subscription_id
            LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
            WHERE (${monthFilter})
              AND UPPER(o.currency) = ?
              AND DATE_SUB(o.created_at, INTERVAL 5 HOUR) >= ?
              ${userFilter}
            GROUP BY p.id, p.name, p.slug
            ORDER BY net_profit DESC, tracked_revenue DESC, revenue_total DESC, p.name ASC
        `, [
            ...monthParams,
            targetCurrency,
            NET_PROFIT_TRACKING_START_AT,
            ...(!isGlobalAdmin ? targetUserIds : []),
            ]),
            getPlatformSalesAdjustmentImpacts({
                monthList,
                currency: targetCurrency,
                isGlobalAdmin,
                targetUserIds,
            }),
        ]);

        const platformById = new Map(rows.map((row) => {
            const salesCount = Number(row.sales_count || 0);
            const revenueTotal = Number(row.revenue_total || 0);
            const trackedSalesCount = Number(row.tracked_sales_count || 0);
            const trackedRevenue = Number(row.tracked_revenue || 0);
            const costTotal = Number(row.cost_total || 0);
            const netProfit = Number(row.net_profit || 0);
            const untrackedSalesCount = Number(row.untracked_sales_count || 0);
            const untrackedRevenue = Number(row.untracked_revenue || 0);
            const platform = {
                platformId: Number(row.platform_id),
                platformName: row.platform_name || "Sin plataforma",
                platformSlug: row.platform_slug || "",
                salesCount,
                revenueTotal,
                trackedSalesCount,
                trackedRevenue,
                costTotal,
                netProfit,
                untrackedSalesCount,
                untrackedRevenue,
                marginPct: trackedRevenue > 0 ? Number(((netProfit / trackedRevenue) * 100).toFixed(2)) : 0,
            };
            return [platform.platformId, platform];
        }));

        for (const impact of adjustmentImpacts) {
            const key = impact.platformId || "general";
            const current = platformById.get(key) || {
                platformId: impact.platformId,
                platformName: impact.platformName,
                platformSlug: "",
                salesCount: 0,
                revenueTotal: 0,
                trackedSalesCount: 0,
                trackedRevenue: 0,
                costTotal: 0,
                netProfit: 0,
                untrackedSalesCount: 0,
                untrackedRevenue: 0,
            };
            current.salesCount = Math.max(0, current.salesCount + impact.salesCountDelta);
            current.revenueTotal += impact.revenueTotalAdjustment;
            current.trackedSalesCount = Math.max(0, current.trackedSalesCount + impact.trackedSalesCountDelta);
            current.trackedRevenue += impact.trackedRevenueAdjustment;
            current.costTotal = Math.max(0, current.costTotal - impact.costReversalTotal);
            current.netProfit += impact.netProfitAdjustment;
            current.untrackedSalesCount = Math.max(0, current.untrackedSalesCount + impact.untrackedSalesCountDelta);
            current.untrackedRevenue += impact.untrackedRevenueAdjustment;
            current.marginPct = current.trackedRevenue > 0
                ? Number(((current.netProfit / current.trackedRevenue) * 100).toFixed(2))
                : 0;
            platformById.set(key, current);
        }

        const platforms = Array.from(platformById.values())
            .filter((row) => Math.abs(Number(row.revenueTotal || 0)) > 0.004 || Number(row.salesCount || 0) > 0)
            .sort((a, b) => (
                Number(b.netProfit || 0) - Number(a.netProfit || 0)
                || Number(b.trackedRevenue || 0) - Number(a.trackedRevenue || 0)
                || Number(b.revenueTotal || 0) - Number(a.revenueTotal || 0)
                || String(a.platformName || "").localeCompare(String(b.platformName || ""))
            ));

        const totals = platforms.reduce((summary, row) => ({
            salesCount: summary.salesCount + row.salesCount,
            revenueTotal: summary.revenueTotal + row.revenueTotal,
            trackedSalesCount: summary.trackedSalesCount + row.trackedSalesCount,
            trackedRevenue: summary.trackedRevenue + row.trackedRevenue,
            costTotal: summary.costTotal + row.costTotal,
            netProfit: summary.netProfit + row.netProfit,
            untrackedSalesCount: summary.untrackedSalesCount + row.untrackedSalesCount,
            untrackedRevenue: summary.untrackedRevenue + row.untrackedRevenue,
        }), {
            salesCount: 0,
            revenueTotal: 0,
            trackedSalesCount: 0,
            trackedRevenue: 0,
            costTotal: 0,
            netProfit: 0,
            untrackedSalesCount: 0,
            untrackedRevenue: 0,
        });
        totals.marginPct = totals.trackedRevenue > 0
            ? Number(((totals.netProfit / totals.trackedRevenue) * 100).toFixed(2))
            : 0;

        return res.json({
            currency: targetCurrency,
            months: monthList,
            netProfitTrackingStartAt: NET_PROFIT_TRACKING_START_AT,
            includesSalesAdjustments: true,
            platforms,
            totals,
        });
    } catch (err) {
        console.error("Error GET /admin/analytics/platform-profit:", err);
        res.status(err?.status || 500).json({ error: err?.status ? err.message : "Error interno del servidor" });
    }
});

/**
 * Ventas semanales: GET /analytics/sales/weekly?year=&month=&userIds=
 * Agrupa las órdenes del mes en 4 semanas:
 *   Sem1: días 1-7 | Sem2: 8-14 | Sem3: 15-21 | Sem4: 22-fin
 */
router.get("/analytics/sales/weekly", requireAuth, async (req, res) => {
    try {
        const actingUser = req.user;
        const isAdmin = actingUser.role === "admin";
        const targetCurrency = await resolveAnalyticsCurrency(req, { isAdmin });

        const now = new Date(Date.now() - 5 * 60 * 60 * 1000);
        const targetYear = parseInt(req.query.year, 10) || now.getUTCFullYear();
        const targetMonth = parseInt(req.query.month, 10) || (now.getUTCMonth() + 1);

        if (!Number.isFinite(targetYear) || !Number.isFinite(targetMonth) ||
            targetMonth < 1 || targetMonth > 12) {
            return res.status(400).json({ error: "Parámetros year/month inválidos" });
        }

        // Build user filter
        let userFilter = "";
        let params = [targetYear, targetMonth, targetCurrency];
        let targetUserIds = [actingUser.id];
        let isGlobalAdmin = false;

        if (isAdmin && req.query.userIds) {
            const ids = req.query.userIds.split(",")
                .map(id => Number(id.trim())).filter(id => id > 0);
            if (ids.length > 0) {
                userFilter = `AND user_id IN (${ids.map(() => "?").join(",")})`;
                params.push(...ids);
                targetUserIds = ids;
            }
            // no userIds param → si es global=true (todos los usuarios), sin filtro extra
        } else if (isAdmin && req.query.global === 'true') {
            userFilter = "";
            isGlobalAdmin = true;
            targetUserIds = [];
        } else {
            // Personal view for admin (global NO es true) o vista de usuario normal
            userFilter = "AND user_id = ?";
            params.push(actingUser.id);
        }

        // Daily totals for the month (Colombia time UTC-5)
        const [[rawRows], adjustmentRows] = await Promise.all([
            pool.query(`
            SELECT
                DAY(DATE_SUB(created_at, INTERVAL 5 HOUR)) AS day,
                COUNT(id)    AS orders,
                SUM(total)   AS revenue
            FROM orders
            WHERE YEAR(DATE_SUB(created_at, INTERVAL 5 HOUR))  = ?
              AND MONTH(DATE_SUB(created_at, INTERVAL 5 HOUR)) = ?
              AND UPPER(currency) = ?
              ${userFilter}
            GROUP BY DAY(DATE_SUB(created_at, INTERVAL 5 HOUR))
            ORDER BY day ASC
        `, params),
            getMonthlySalesAdjustments({
                year: targetYear,
                month: targetMonth,
                currency: targetCurrency,
                isGlobalAdmin,
                targetUserIds,
            }),
        ]);
        const rows = mergeSalesAdjustmentsIntoDaily(rawRows, adjustmentRows);

        // Week buckets
        const WEEKS = [
            { week: 1, label: "Semana 1", startDay: 1, endDay: 7, revenue: 0, orders: 0, daily: [] },
            { week: 2, label: "Semana 2", startDay: 8, endDay: 14, revenue: 0, orders: 0, daily: [] },
            { week: 3, label: "Semana 3", startDay: 15, endDay: 21, revenue: 0, orders: 0, daily: [] },
            { week: 4, label: "Semana 4", startDay: 22, endDay: 31, revenue: 0, orders: 0, daily: [] },
        ];

        for (const row of rows) {
            const day = Number(row.day);
            const wk = WEEKS.find(w => day >= w.startDay && day <= w.endDay);
            if (wk) {
                wk.revenue += Number(row.revenue || 0);
                wk.orders += Number(row.orders || 0);
                wk.daily.push({ day, revenue: Number(row.revenue || 0), orders: Number(row.orders || 0) });
            }
        }

        // Add growth vs previous week
        const weeks = WEEKS.map((w, i) => {
            const prev = WEEKS[i - 1];
            const growth = prev && prev.revenue > 0
                ? Number(((w.revenue - prev.revenue) / prev.revenue * 100).toFixed(1))
                : null;
            return { ...w, growth };
        });

        const bestWeek = [...weeks].sort((a, b) => b.revenue - a.revenue)[0];
        const totalRevenue = weeks.reduce((s, w) => s + w.revenue, 0);
        const totalOrders = weeks.reduce((s, w) => s + w.orders, 0);

        return res.json({
            year: targetYear,
            month: targetMonth,
            currency: targetCurrency,
            weeks,
            bestWeek,
            total: totalRevenue,
            orders: totalOrders,
            adjustmentsTotal: adjustmentRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
        });
    } catch (err) {
        console.error("Error GET /analytics/sales/weekly:", err);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

module.exports = router;
