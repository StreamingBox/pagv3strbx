const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

/**
 * GET /user/notifications
 * Devuelve las notificaciones del usuario logueado en orden descendente.
 */
router.get("/user/notifications", requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.sub;
        if (!userId) {
            return res.status(401).json({ ok: false, message: "No autorizado" });
        }

        const [rows] = await pool.query(
            "SELECT id, message, is_read, created_at FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
            [userId]
        );

        res.json(rows);
    } catch (err) {
        console.error("Error GET /user/notifications:", err);
        res.status(500).json({ ok: false, message: "Error del servidor" });
    }
});

/**
 * PUT /user/notifications/:id/read
 * Marca una notificación como leída.
 */
router.put("/user/notifications/:id/read", requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.sub;
        const notificationId = req.params.id;

        if (!userId) {
            return res.status(401).json({ ok: false, message: "No autorizado" });
        }

        await pool.query(
            "UPDATE user_notifications SET is_read = TRUE WHERE id = ? AND user_id = ?",
            [notificationId, userId]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error("Error PUT /user/notifications/:id/read:", err);
        res.status(500).json({ ok: false, message: "Error del servidor" });
    }
});

module.exports = router;
