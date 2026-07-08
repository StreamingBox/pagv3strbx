const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { mapMasterAccount, normalizeMasterEmail } = require("../services/masterAccounts.service");

const router = express.Router();

router.get("/admin/master-accounts", requireAuth, requireRole("admin"), async (req, res) => {
    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "all").trim().toLowerCase();
    const params = [];
    const conditions = [];

    if (["active", "inactive"].includes(status)) {
        conditions.push("ma.status = ?");
        params.push(status);
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
              LIMIT 300`,
            params
        );
        return res.json({ items: rows.map(mapMasterAccount) });
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
