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
 * Meses disponibles del usuario: GET /analytics/available-months?year=
 * Devuelve lista de { year, month, total } donde el usuario tiene órdenes.
 */
router.get("/analytics/available-months", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { year } = req.query;
        const parsedYear = year ? parseInt(year, 10) : null;
        const yearFilter = parsedYear && Number.isFinite(parsedYear)
            ? "AND YEAR(DATE_SUB(created_at, INTERVAL 5 HOUR)) = ?"
            : "";
        const params = parsedYear && Number.isFinite(parsedYear)
            ? [userId, parsedYear]
            : [userId];

        const [rows] = await pool.query(`
            SELECT YEAR(DATE_SUB(created_at, INTERVAL 5 HOUR)) as year,
                   MONTH(DATE_SUB(created_at, INTERVAL 5 HOUR)) as month,
                   SUM(total) as total, COUNT(id) as orders
            FROM orders
            WHERE user_id = ? ${yearFilter}
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
            } else {
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

            return { year, month, daily, total, orders, distribution: dist };
        }));

        return res.json({ months: results });
    } catch (err) {
        console.error("Error GET /analytics/sales/multi:", err);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

module.exports = router;
