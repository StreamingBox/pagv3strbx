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

        // Current month reference
        const now = new Date();
        const targetYear = parseInt(year, 10) || now.getUTCFullYear();
        const targetMonth = parseInt(month, 10) || (now.getUTCMonth() + 1); // 1-12

        // Previous month
        let prevYear = targetYear;
        let prevMonth = targetMonth - 1;
        if (prevMonth === 0) { prevMonth = 12; prevYear--; }

        const userFilter = userId ? "AND u.id = ?" : "";
        const params = userId ? [userId] : [];

        // Current month daily totals (count of purchases)
        const curQuery = `
            SELECT
                DAY(o.created_at) as day,
                COUNT(o.id) as orders,
                SUM(o.total) as revenue
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE YEAR(o.created_at) = ${targetYear} AND MONTH(o.created_at) = ${targetMonth}
            ${userFilter}
            GROUP BY DAY(o.created_at)
            ORDER BY day ASC
        `;
        const [curRows] = await pool.query(curQuery, params);

        // Previous month daily totals
        const prevQuery = `
            SELECT
                DAY(o.created_at) as day,
                COUNT(o.id) as orders,
                SUM(o.total) as revenue
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE YEAR(o.created_at) = ${prevYear} AND MONTH(o.created_at) = ${prevMonth}
            ${userFilter}
            GROUP BY DAY(o.created_at)
            ORDER BY day ASC
        `;
        const [prevRows] = await pool.query(prevQuery, params);

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

        const now = new Date();
        const targetYear = parseInt(year, 10) || now.getUTCFullYear();
        const targetMonth = parseInt(month, 10) || (now.getUTCMonth() + 1);

        let prevYear = targetYear;
        let prevMonth = targetMonth - 1;
        if (prevMonth === 0) { prevMonth = 12; prevYear--; }

        const curQuery = `
            SELECT DAY(created_at) as day, COUNT(id) as orders, SUM(total) as revenue
            FROM orders
            WHERE user_id = ? AND YEAR(created_at) = ${targetYear} AND MONTH(created_at) = ${targetMonth}
            GROUP BY DAY(created_at)
            ORDER BY day ASC
        `;
        const [curRows] = await pool.query(curQuery, [userId]);

        const prevQuery = `
            SELECT DAY(created_at) as day, COUNT(id) as orders, SUM(total) as revenue
            FROM orders
            WHERE user_id = ? AND YEAR(created_at) = ${prevYear} AND MONTH(created_at) = ${prevMonth}
            GROUP BY DAY(created_at)
            ORDER BY day ASC
        `;
        const [prevRows] = await pool.query(prevQuery, [userId]);

        const curTotal = curRows.reduce((s, r) => s + Number(r.revenue || 0), 0);
        const prevTotal = prevRows.reduce((s, r) => s + Number(r.revenue || 0), 0);
        const curOrders = curRows.reduce((s, r) => s + Number(r.orders || 0), 0);
        const prevOrders = prevRows.reduce((s, r) => s + Number(r.orders || 0), 0);

        // Distribución por plataforma (mes actual)
        const curDistQuery = `
            SELECT p.name as name, SUM(oi.price) as value
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN platforms p ON p.id = oi.platform_id
            WHERE o.user_id = ? AND YEAR(o.created_at) = ${targetYear} AND MONTH(o.created_at) = ${targetMonth}
            GROUP BY p.id, p.name
            ORDER BY value DESC
        `;
        const [curDistRows] = await pool.query(curDistQuery, [userId]);

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
        const yearFilter = year ? `AND YEAR(created_at) = ${parseInt(year, 10)}` : "";

        const [rows] = await pool.query(`
            SELECT YEAR(created_at) as year, MONTH(created_at) as month, SUM(total) as total, COUNT(id) as orders
            FROM orders
            WHERE user_id = ? ${yearFilter}
            GROUP BY YEAR(created_at), MONTH(created_at)
            ORDER BY year DESC, month DESC
        `, [userId]);

        return res.json({ months: rows });
    } catch (err) {
        console.error("Error GET /analytics/available-months:", err);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

/**
 * Comparación multi-mes: GET /analytics/sales/multi?months=2026-01,2026-02,2026-03
 * Devuelve datos diarios para cada mes solicitado.
 */
router.get("/analytics/sales/multi", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { months } = req.query;
        if (!months) return res.status(400).json({ error: "Parámetro months requerido" });

        const monthList = months.split(",").slice(0, 6).map(m => {
            const [y, mo] = m.trim().split("-").map(Number);
            return { year: y, month: mo };
        }).filter(m => m.year && m.month);

        const results = await Promise.all(monthList.map(async ({ year, month }) => {
            const [daily] = await pool.query(`
                SELECT DAY(created_at) as day, COUNT(id) as orders, SUM(total) as revenue
                FROM orders
                WHERE user_id = ? AND YEAR(created_at) = ? AND MONTH(created_at) = ?
                GROUP BY DAY(created_at)
                ORDER BY day ASC
            `, [userId, year, month]);

            const total = daily.reduce((s, r) => s + Number(r.revenue || 0), 0);
            const orders = daily.reduce((s, r) => s + Number(r.orders || 0), 0);

            const [dist] = await pool.query(`
                SELECT p.name as name, SUM(oi.price) as value
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                JOIN platforms p ON p.id = oi.platform_id
                WHERE o.user_id = ? AND YEAR(o.created_at) = ? AND MONTH(o.created_at) = ?
                GROUP BY p.id, p.name
                ORDER BY value DESC
            `, [userId, year, month]);

            return { year, month, daily, total, orders, distribution: dist };
        }));

        return res.json({ months: results });
    } catch (err) {
        console.error("Error GET /analytics/sales/multi:", err);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

module.exports = router;
