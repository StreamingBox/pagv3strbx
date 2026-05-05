const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

/**
 * Returns daily sales comparison for current month vs previous month.
 * Admin endpoint: GET /admin/analytics/sales?userId=&year=&month=
 */
router.get("/admin/analytics/sales", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { userId, year, month } = req.query;

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
        const curParams = userId ? [targetYear, targetMonth, userId] : [targetYear, targetMonth];
        const prevParams = userId ? [prevYear, prevMonth, userId] : [prevYear, prevMonth];

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
            ${userFilter}
            GROUP BY DAY(DATE_SUB(o.created_at, INTERVAL 5 HOUR))
            ORDER BY day ASC
        `;

        // ✅ Paralelo: curRows y prevRows al mismo tiempo
        const [[curRows], [prevRows]] = await Promise.all([
            pool.query(curQuery, curParams),
            pool.query(prevQuery, prevParams),
        ]);

        // Summary totals
        const curTotal = curRows.reduce((s, r) => s + Number(r.revenue || 0), 0);
        const prevTotal = prevRows.reduce((s, r) => s + Number(r.revenue || 0), 0);
        const curOrders = curRows.reduce((s, r) => s + Number(r.orders || 0), 0);
        const prevOrders = prevRows.reduce((s, r) => s + Number(r.orders || 0), 0);

        return res.json({
            current: { year: targetYear, month: targetMonth, daily: curRows, total: curTotal, orders: curOrders },
            previous: { year: prevYear, month: prevMonth, daily: prevRows, total: prevTotal, orders: prevOrders },
        });
    } catch (err) {
        console.error("Error GET /admin/analytics/sales:", err);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

/**
 * Monthly sales leaderboard for admins.
 * GET /admin/analytics/sales-top?year=&month=
 */
router.get("/admin/analytics/sales-top", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { year, month } = req.query;
        const targetCurrency = String(req.query.currency || "COP").trim().toUpperCase();

        const now = new Date(Date.now() - 5 * 60 * 60 * 1000);
        const targetYear = parseInt(year, 10) || now.getUTCFullYear();
        const targetMonth = parseInt(month, 10) || (now.getUTCMonth() + 1);

        if (!Number.isFinite(targetYear) || !Number.isFinite(targetMonth) || targetMonth < 1 || targetMonth > 12) {
            return res.status(400).json({ error: "Parámetros year/month inválidos" });
        }

        if (!["COP", "MXN", "USD"].includes(targetCurrency)) {
            return res.status(400).json({ error: "ParÃ¡metro currency invÃ¡lido" });
        }

        const [salesRows] = await pool.query(`
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
              AND o.currency = ?
            GROUP BY u.id, u.name, u.email
            ORDER BY revenue DESC, orders_count DESC, user_name ASC
        `, [targetYear, targetMonth, targetCurrency]);

        const [platformRows] = await pool.query(`
            SELECT
                o.user_id,
                p.name AS platform_name,
                COUNT(oi.id) AS platform_sales_count,
                SUM(oi.price) AS platform_revenue,
                SUM(COALESCE(oi.cost_amount, pa.unit_cost, 0)) AS platform_cost
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN platforms p ON p.id = oi.platform_id
            LEFT JOIN subscriptions s ON s.id = oi.subscription_id
            LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
            WHERE YEAR(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
              AND MONTH(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
              AND o.currency = ?
            GROUP BY o.user_id, p.id, p.name
            ORDER BY o.user_id ASC, platform_sales_count DESC, platform_revenue DESC, p.name ASC
        `, [targetYear, targetMonth, targetCurrency]);

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
            monthRevenue: items.reduce((sum, item) => sum + item.monthRevenue, 0),
            ordersCount: items.reduce((sum, item) => sum + item.ordersCount, 0),
            costTotal: items.reduce((sum, item) => sum + item.costTotal, 0),
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
            GROUP BY DAY(DATE_SUB(created_at, INTERVAL 5 HOUR))
            ORDER BY day ASC
        `;

        const prevQuery = `
            SELECT DAY(DATE_SUB(created_at, INTERVAL 5 HOUR)) as day, COUNT(id) as orders, SUM(total) as revenue
            FROM orders
            WHERE user_id = ?
              AND YEAR(DATE_SUB(created_at, INTERVAL 5 HOUR)) = ?
              AND MONTH(DATE_SUB(created_at, INTERVAL 5 HOUR)) = ?
            GROUP BY DAY(DATE_SUB(created_at, INTERVAL 5 HOUR))
            ORDER BY day ASC
        `;

        // Distribución por plataforma (mes actual)
        const curDistQuery = `
            SELECT p.name as name, SUM(oi.price) as value
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN platforms p ON p.id = oi.platform_id
            WHERE o.user_id = ?
              AND YEAR(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
              AND MONTH(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
            GROUP BY p.id, p.name
            ORDER BY value DESC
        `;

        // ✅ Paralelo: las 3 queries al mismo tiempo
        const [[curRows], [prevRows], [curDistRows]] = await Promise.all([
            pool.query(curQuery, [userId, targetYear, targetMonth]),
            pool.query(prevQuery, [userId, prevYear, prevMonth]),
            pool.query(curDistQuery, [userId, targetYear, targetMonth]),
        ]);

        const curTotal = curRows.reduce((s, r) => s + Number(r.revenue || 0), 0);
        const prevTotal = prevRows.reduce((s, r) => s + Number(r.revenue || 0), 0);
        const curOrders = curRows.reduce((s, r) => s + Number(r.orders || 0), 0);
        const prevOrders = prevRows.reduce((s, r) => s + Number(r.orders || 0), 0);

        return res.json({
            current: { year: targetYear, month: targetMonth, daily: curRows, total: curTotal, orders: curOrders, distribution: curDistRows },
            previous: { year: prevYear, month: prevMonth, daily: prevRows, total: prevTotal, orders: prevOrders },
        });
    } catch (err) {
        console.error("Error GET /analytics/sales:", err);
        res.status(500).json({ error: "Error interno del servidor" });
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
        const { year } = req.query;
        const parsedYear = year ? parseInt(year, 10) : null;

        let userFilter = "AND user_id = ?";
        const params = [actingUser.id];

        if (isAdmin) {
            if (req.query.global === "true") {
                userFilter = "";
                params.length = 0;
            } else if (req.query.userIds) {
                const ids = req.query.userIds
                    .split(",")
                    .map(id => Number(id.trim()))
                    .filter(id => id > 0);

                if (ids.length > 0) {
                    userFilter = `AND user_id IN (${ids.map(() => "?").join(",")})`;
                    params.length = 0;
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
            WHERE 1=1 ${userFilter} ${yearFilter}
            GROUP BY YEAR(DATE_SUB(created_at, INTERVAL 5 HOUR)), MONTH(DATE_SUB(created_at, INTERVAL 5 HOUR))
            ORDER BY year DESC, month DESC
        `, params);

        return res.json({ months: rows });
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
            `;
            let distQ = `
                SELECT p.name as name, SUM(oi.price) as value
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                JOIN platforms p ON p.id = oi.platform_id
                WHERE YEAR(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ? AND MONTH(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
            `;

            let dailyParams = [year, month];
            let distParams = [year, month];

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

            const [daily] = await pool.query(dailyQ, dailyParams);
            const total = daily.reduce((s, r) => s + Number(r.revenue || 0), 0);
            const orders = daily.reduce((s, r) => s + Number(r.orders || 0), 0);

            const [dist] = await pool.query(distQ, distParams);
            const monthData = { year, month, daily, total, orders, distribution: dist };

            if (isAdmin) {
                let profitQ = `
                    SELECT
                        SUM(COALESCE(oi.cost_amount, pa.unit_cost, 0)) AS cost_total,
                        SUM(
                            COALESCE(
                                oi.profit_amount,
                                oi.price - COALESCE(oi.cost_amount, pa.unit_cost, 0)
                            )
                        ) AS net_profit
                    FROM order_items oi
                    JOIN orders o ON o.id = oi.order_id
                    LEFT JOIN subscriptions s ON s.id = oi.subscription_id
                    LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
                    WHERE YEAR(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
                      AND MONTH(DATE_SUB(o.created_at, INTERVAL 5 HOUR)) = ?
                `;
                const profitParams = [year, month];

                if (!isGlobalAdmin) {
                    const placeholders = targetUserIds.map(() => "?").join(",");
                    profitQ += ` AND o.user_id IN (${placeholders})`;
                    profitParams.push(...targetUserIds);
                }

                const [[profitRow]] = await pool.query(profitQ, profitParams);
                const costTotal = Number(profitRow?.cost_total || 0);
                const netProfit = Number(profitRow?.net_profit || 0);
                const marginPct = total > 0 ? Number(((netProfit / total) * 100).toFixed(2)) : 0;

                monthData.costTotal = costTotal;
                monthData.netProfit = netProfit;
                monthData.marginPct = marginPct;
            }

            return monthData;
        }));

        return res.json({ months: results });
    } catch (err) {
        console.error("Error GET /analytics/sales/multi:", err);
        res.status(500).json({ error: "Error interno del servidor" });
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

        const now = new Date(Date.now() - 5 * 60 * 60 * 1000);
        const targetYear = parseInt(req.query.year, 10) || now.getUTCFullYear();
        const targetMonth = parseInt(req.query.month, 10) || (now.getUTCMonth() + 1);

        if (!Number.isFinite(targetYear) || !Number.isFinite(targetMonth) ||
            targetMonth < 1 || targetMonth > 12) {
            return res.status(400).json({ error: "Parámetros year/month inválidos" });
        }

        // Build user filter
        let userFilter = "";
        let params = [targetYear, targetMonth];

        if (isAdmin && req.query.userIds) {
            const ids = req.query.userIds.split(",")
                .map(id => Number(id.trim())).filter(id => id > 0);
            if (ids.length > 0) {
                userFilter = `AND user_id IN (${ids.map(() => "?").join(",")})`;
                params.push(...ids);
            }
            // no userIds param → si es global=true (todos los usuarios), sin filtro extra
        } else if (isAdmin && req.query.global === 'true') {
            userFilter = "";
        } else {
            // Personal view for admin (global NO es true) o vista de usuario normal
            userFilter = "AND user_id = ?";
            params.push(actingUser.id);
        }

        // Daily totals for the month (Colombia time UTC-5)
        const [rows] = await pool.query(`
            SELECT
                DAY(DATE_SUB(created_at, INTERVAL 5 HOUR)) AS day,
                COUNT(id)    AS orders,
                SUM(total)   AS revenue
            FROM orders
            WHERE YEAR(DATE_SUB(created_at, INTERVAL 5 HOUR))  = ?
              AND MONTH(DATE_SUB(created_at, INTERVAL 5 HOUR)) = ?
              ${userFilter}
            GROUP BY DAY(DATE_SUB(created_at, INTERVAL 5 HOUR))
            ORDER BY day ASC
        `, params);

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

        return res.json({ year: targetYear, month: targetMonth, weeks, bestWeek, total: totalRevenue, orders: totalOrders });
    } catch (err) {
        console.error("Error GET /analytics/sales/weekly:", err);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

module.exports = router;
