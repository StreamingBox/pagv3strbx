const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const { createAccountOne, bulkInsertAccounts } = require("../services/accounts.service");

const router = express.Router();

router.post("/admin/accounts", requireAuth, requireRole("admin"), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const out = await createAccountOne(conn, req.body || {});
        await conn.commit();
        return res.status(201).json({ ok: true, ...out });
    } catch (e) {
        await conn.rollback();
        const status = e.status || 500;
        return res.status(status).json({ message: e.message || "Error interno.", ...(e.payload || {}) });
    } finally {
        conn.release();
    }
});

router.post("/admin/accounts/bulk", requireAuth, requireRole("admin"), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const out = await bulkInsertAccounts(conn, req.body?.rows || []);
        await conn.commit();

        if (out.inserted === 0) {
            return res.status(400).json({
                message: "No se insertó ninguna fila. Revisa platformName o envía platformId.",
                missingPlatforms: out.missingPlatforms,
            });
        }

        return res.json({ ok: true, inserted: out.inserted, warning_missing_platforms: out.missingPlatforms });
    } catch (e) {
        await conn.rollback();
        const status = e.status || 500;
        return res.status(status).json({ message: e.message || "Error interno." });
    } finally {
        conn.release();
    }
});

module.exports = router;
