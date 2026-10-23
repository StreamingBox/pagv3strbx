const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { buildPendingExpirationCountQuery } = require("../services/expirationQuery.service");

const router = express.Router();

router.get("/admin/sidebar-counts", requireAuth, requireRole("admin"), async (_req, res) => {
    try {
        const results = await Promise.all([
            pool.query(`SELECT COUNT(*) AS count
                        FROM stock_subscriptions s
                        JOIN users u ON u.id = s.user_id
                        JOIN platform_prices pp ON pp.id = s.platform_price_id
                        JOIN platforms p ON p.id = pp.platform_id
                        JOIN durations d ON d.id = pp.duration_id
                        WHERE s.is_notified = FALSE`),
            pool.query(buildPendingExpirationCountQuery()),
            pool.query(`SELECT COUNT(*) AS count
                        FROM manual_topup_requests m
                        JOIN users u ON u.id = m.user_id
                        WHERE m.status = 'submitted'`),
            pool.query("SELECT COUNT(*) AS count FROM support_tickets WHERE status IN ('open', 'in_progress')"),
        ]);
        const countFromResult = (result) => Number(result?.[0]?.[0]?.count || 0);

        return res.json({
            stock: countFromResult(results[0]),
            expirations: countFromResult(results[1]),
            topups: countFromResult(results[2]),
            support: countFromResult(results[3]),
        });
    } catch (error) {
        console.error("GET /admin/sidebar-counts:", error);
        return res.status(500).json({ message: "No se pudieron cargar los contadores del menú." });
    }
});

module.exports = router;
