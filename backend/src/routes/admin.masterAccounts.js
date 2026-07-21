const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { mapMasterAccount, normalizeMasterEmail } = require("../services/masterAccounts.service");

const router = express.Router();

router.get("/admin/master-accounts", requireAuth, requireRole("admin"), async (req, res) => {
    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "all").trim().toLowerCase();
    const platformId = Number(req.query.platformId || req.query.platform_id || 0);
    const limitRaw = Number(req.query.limit || 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 10;
    const params = [];
    const conditions = [];

    if (["active", "inactive"].includes(status)) {
        conditions.push("ma.status = ?");
        params.push(status);
    }
    if (Number.isInteger(platformId) && platformId > 0) {
        conditions.push("ma.platform_id = ?");
        params.push(platformId);
    }
    if (q) {
        conditions.push("(ma.account_email LIKE ? OR p.name LIKE ? OR ma.notes LIKE ?)");
        const like = `%${q}%`;
        params.push(like, like, like);
    }

    try {
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const [rows] = await pool.query(
            `SELECT ma.*, p.name AS platform_name
               FROM master_accounts ma
               JOIN platforms p ON p.id = ma.platform_id
              ${where}
              ORDER BY ma.status = 'inactive' DESC, ma.updated_at DESC, ma.id DESC
              LIMIT ?`,
            [...params, limit]
        );
        const [[summary]] = await pool.query(
            `SELECT
                COUNT(*) AS total,
                SUM(status = 'inactive') AS inactive,
                SUM(status = 'active') AS active
               FROM master_accounts`
        );
        const [[matching]] = await pool.query(
            `SELECT COUNT(*) AS total FROM master_accounts ma JOIN platforms p ON p.id = ma.platform_id ${where}`,
            params
        );
        const [topPlatforms] = await pool.query(
            `SELECT p.id, p.name, COUNT(*) AS total
               FROM master_accounts ma
               JOIN platforms p ON p.id = ma.platform_id
              WHERE ma.status = 'inactive'
              GROUP BY p.id, p.name
              ORDER BY total DESC, p.name ASC
              LIMIT 10`
        );
        return res.json({
            items: rows.map(mapMasterAccount),
            limit,
            matching: Number(matching?.total || 0),
            summary: {
                total: Number(summary?.total || 0),
                inactive: Number(summary?.inactive || 0),
                active: Number(summary?.active || 0),
                topPlatforms,
            },
        });
    } catch (error) {
        console.error("[master-accounts] list error:", error);
        return res.status(500).json({ message: "No se pudieron cargar las cuentas maestras." });
    }
});

router.post("/admin/master-accounts", requireAuth, requireRole("admin"), async (req, res) => {
    const platformId = Number(req.body?.platformId || req.body?.platform_id);
    const accountEmail = normalizeMasterEmail(req.body?.accountEmail || req.body?.account_email);
    const status = String(req.body?.status || "inactive").trim().toLowerCase();
    const notes = String(req.body?.notes || "").trim().slice(0, 2000) || null;

    if (!Number.isInteger(platformId) || platformId <= 0) {
        return res.status(400).json({ message: "Selecciona una plataforma valida." });
    }
    if (!accountEmail || !accountEmail.includes("@")) {
        return res.status(400).json({ message: "Ingresa el correo de la cuenta maestra." });
    }
    if (!["active", "inactive"].includes(status)) {
        return res.status(400).json({ message: "Estado invalido." });
    }

    try {
        const [platformRows] = await pool.query("SELECT id FROM platforms WHERE id = ? LIMIT 1", [platformId]);
        if (!platformRows.length) {
            return res.status(404).json({ message: "La plataforma no existe." });
        }

        await pool.query(
            `INSERT INTO master_accounts (platform_id, account_email, status, notes, created_by_user_id)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                notes = VALUES(notes),
                updated_at = CURRENT_TIMESTAMP`,
            [platformId, accountEmail, status, notes, req.user.id || null]
        );
        return res.status(201).json({ ok: true });
    } catch (error) {
        console.error("[master-accounts] create error:", error);
        return res.status(500).json({ message: "No se pudo guardar la cuenta maestra." });
    }
});

router.patch("/admin/master-accounts/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    const status = req.body?.status === undefined ? null : String(req.body.status).trim().toLowerCase();
    const notes = req.body?.notes === undefined ? undefined : String(req.body.notes || "").trim().slice(0, 2000);

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Cuenta maestra invalida." });
    }
    if (status !== null && !["active", "inactive"].includes(status)) {
        return res.status(400).json({ message: "Estado invalido." });
    }

    try {
        await pool.query(
            `UPDATE master_accounts
                SET status = COALESCE(?, status),
                    notes = CASE WHEN ? THEN ? ELSE notes END
              WHERE id = ?`,
            [status, notes !== undefined ? 1 : 0, notes || null, id]
        );
        return res.json({ ok: true });
    } catch (error) {
        console.error("[master-accounts] update error:", error);
        return res.status(500).json({ message: "No se pudo actualizar la cuenta maestra." });
    }
});

router.delete("/admin/master-accounts/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Cuenta maestra invalida." });
    }
    try {
        await pool.query("DELETE FROM master_accounts WHERE id = ?", [id]);
        return res.json({ ok: true });
    } catch (error) {
        console.error("[master-accounts] delete error:", error);
        return res.status(500).json({ message: "No se pudo eliminar la cuenta maestra." });
    }
});

module.exports = router;
