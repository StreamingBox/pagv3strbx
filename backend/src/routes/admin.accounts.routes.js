const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const {
    createAccountOne,
    bulkInsertAccounts,
    duplicateSummaryMessage,
} = require("../services/accounts.service");

const router = express.Router();

router.post("/admin/accounts", requireAuth, requireRole("admin"), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const out = await createAccountOne(conn, req.body || {});
        await conn.commit();

        // Registrar log
        const adminEmail = req.user?.email || null;
        const adminId    = req.user?.id    || null;
        pool.query(
            `INSERT INTO account_upload_logs
             (type, admin_id, admin_email, platform_id, platform_name, total_rows, inserted, skipped, errors, notes)
             VALUES ('manual', ?, ?, ?, ?, 1, 1, 0, 0, ?)`,
            [adminId, adminEmail, out.platformId || null, out.platformName || null, `Cuenta: ${req.body?.email || ''}`]
        ).catch(() => {});

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

        // Registrar log
        const adminEmail = req.user?.email || null;
        const adminId    = req.user?.id    || null;
        const filename   = req.body?.filename || null;
        const totalRows  = (req.body?.rows || []).length;
        const duplicateCount = out.skippedDuplicateAssigned || 0;
        const missingPlatformRows = out.missingPlatformRows || 0;
        const notes = [
            out.missingPlatforms?.length
                ? `Plataformas no encontradas: ${out.missingPlatforms.join(", ")}`
                : "",
            duplicateCount
                ? `Duplicadas asignadas vigentes: ${duplicateSummaryMessage(out.duplicateAssigned, 8)}`
                : "",
        ].filter(Boolean).join(" | ") || null;
        pool.query(
            `INSERT INTO account_upload_logs
             (type, admin_id, admin_email, platform_id, platform_name, total_rows, inserted, skipped, errors, source_filename, notes)
             VALUES ('bulk', ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
            [
                adminId, adminEmail,
                totalRows,
                out.inserted || 0,
                Math.max(0, totalRows - (out.inserted || 0) - missingPlatformRows),
                missingPlatformRows,
                filename,
                notes
            ]
        ).catch(() => {});

        if (out.inserted === 0) {
            if (duplicateCount > 0) {
                return res.status(409).json({
                    message: `No se inserto ninguna fila porque ${duplicateCount} pantalla(s) ya estan asignadas y vigentes. ${duplicateSummaryMessage(out.duplicateAssigned)}`,
                    duplicateAssigned: out.duplicateAssigned,
                    warning_missing_platforms: out.missingPlatforms,
                });
            }
            return res.status(400).json({
                message: "No se insertó ninguna fila. Revisa platformName o envía platformId.",
                missingPlatforms: out.missingPlatforms,
            });
        }

        return res.json({
            ok: true,
            inserted: out.inserted,
            warning_missing_platforms: out.missingPlatforms,
            skipped_duplicate_assigned: duplicateCount,
            duplicateAssigned: out.duplicateAssigned,
        });
    } catch (e) {
        await conn.rollback();
        const status = e.status || 500;
        return res.status(status).json({ message: e.message || "Error interno." });
    } finally {
        conn.release();
    }
});

/**
 * GET /admin/accounts/upload-logs
 * Historial de cargas de cuentas con paginación y filtros
 */
router.get("/admin/accounts/upload-logs", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page  || "1"));
        const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || "20")));
        const offset = (page - 1) * limit;
        const type   = req.query.type   || "";
        const search = req.query.search || "";

        const conditions = [];
        const params     = [];

        if (type === "manual" || type === "bulk") {
            conditions.push("type = ?");
            params.push(type);
        }
        if (search.trim()) {
            conditions.push("(admin_email LIKE ? OR platform_name LIKE ?)");
            params.push(`%${search.trim()}%`, `%${search.trim()}%`);
        }

        const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM account_upload_logs ${where}`,
            params
        );

        const [rows] = await pool.query(
            `SELECT * FROM account_upload_logs ${where}
             ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return res.json({
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            items: rows,
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: "Error al obtener logs." });
    }
});

/**
 * DELETE /admin/accounts/upload-logs
 * Limpia logs más antiguos de N días (por defecto 30)
 */
router.delete("/admin/accounts/upload-logs", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const days = Math.max(1, parseInt(req.query.days || "30"));
        const [result] = await pool.query(
            `DELETE FROM account_upload_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [days]
        );
        return res.json({ ok: true, deleted: result.affectedRows });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: "Error al limpiar logs." });
    }
});

module.exports = router;

