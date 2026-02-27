const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

/**
 * GET /admin/code-logs
 * Solo ADMIN
 */
router.get("/admin/code-logs", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const [rows] = await pool.query(`
      SELECT
        cd.id,
        cd.order_id,
        cd.platform_slug,
        cd.order_email,
        cd.delivered_code,
        cd.status,
        cd.message,
        cd.requester_ip,
        cd.user_agent,
        cd.created_at,
        u.email AS requested_by
      FROM code_deliveries cd
      LEFT JOIN users u ON u.id = cd.requested_by_user_id
      ORDER BY cd.created_at DESC
      LIMIT 500
    `);

        res.json({ ok: true, logs: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, message: "Error cargando logs" });
    }
});

module.exports = router;
