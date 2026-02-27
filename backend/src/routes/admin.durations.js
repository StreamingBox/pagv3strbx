const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

/**
 * GET /admin/durations
 * Lista duraciones
 */
router.get("/admin/durations", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, name, days, is_active, created_at, updated_at
       FROM durations
       ORDER BY days ASC, id ASC`
        );
        return res.json(rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

/**
 * POST /admin/durations
 * body: { name, days }
 */
router.post("/admin/durations", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { name, days } = req.body || {};
        if (!name || days === undefined) {
            return res.status(400).json({ message: "name y days son obligatorios." });
        }

        const daysInt = parseInt(days, 10);
        if (!Number.isFinite(daysInt) || daysInt <= 0) {
            return res.status(400).json({ message: "days debe ser un número > 0." });
        }

        const [r] = await pool.query(
            `INSERT INTO durations (name, days, is_active)
       VALUES (?, ?, 1)`,
            [String(name).trim(), daysInt]
        );

        return res.status(201).json({ id: r.insertId, name: String(name).trim(), days: daysInt, is_active: 1 });
    } catch (err) {
        console.error(err);
        // si hay UNIQUE (name) o UNIQUE(days)
        if (String(err?.code || "").includes("ER_DUP_ENTRY")) {
            return res.status(409).json({ message: "Ya existe una duración con ese valor." });
        }
        return res.status(500).json({ message: "Error interno." });
    }
});

/**
 * PATCH /admin/durations/:id
 * body: { name?, days?, is_active? }
 */
router.patch("/admin/durations/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, days, is_active } = req.body || {};

        let daysInt = null;
        if (days !== undefined) {
            daysInt = parseInt(days, 10);
            if (!Number.isFinite(daysInt) || daysInt <= 0) {
                return res.status(400).json({ message: "days debe ser un número > 0." });
            }
        }

        await pool.query(
            `UPDATE durations
       SET name = COALESCE(?, name),
           days = COALESCE(?, days),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
            [name ?? null, days !== undefined ? daysInt : null, is_active ?? null, id]
        );

        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

/**
 * DELETE /admin/durations/:id
 * Borrado lógico: is_active = 0
 */
router.delete("/admin/durations/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`UPDATE durations SET is_active = 0 WHERE id = ?`, [id]);
        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

module.exports = router;
