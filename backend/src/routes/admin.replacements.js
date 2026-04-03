const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { formatDateOnlyBogota } = require("../utils/date");

const router = express.Router();

router.get("/admin/replacements", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 200);
        const offset = (page - 1) * limit;
        const q = String(req.query.q || "").trim();

        const where = [];
        const params = [];

        if (q) {
            const like = `%${q}%`;
            where.push(`(
                CAST(arl.subscription_id AS CHAR) LIKE ? OR
                CAST(arl.order_id AS CHAR) LIKE ? OR
                COALESCE(arl.order_code, '') LIKE ? OR
                COALESCE(arl.old_account_email, '') LIKE ? OR
                COALESCE(arl.new_account_email, '') LIKE ? OR
                COALESCE(admin.email, '') LIKE ? OR
                COALESCE(u.email, '') LIKE ?
            )`);
            params.push(like, like, like, like, like, like, like);
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        const [[countRow]] = await pool.query(
            `SELECT COUNT(*) AS total
               FROM account_replacement_logs arl
               LEFT JOIN users admin ON admin.id = arl.admin_user_id
               LEFT JOIN users u ON u.id = arl.user_id
               ${whereSql}`,
            params
        );

        const [rows] = await pool.query(
            `SELECT
                arl.*,
                admin.email AS admin_email,
                admin.name AS admin_name,
                u.email AS user_email,
                u.name AS user_name,
                p.name AS platform_name
            FROM account_replacement_logs arl
            LEFT JOIN users admin ON admin.id = arl.admin_user_id
            LEFT JOIN users u ON u.id = arl.user_id
            LEFT JOIN platforms p ON p.id = arl.platform_id
            ${whereSql}
            ORDER BY arl.id DESC
            LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return res.json({
            items: rows.map((row) => ({
                ...row,
                previousExpiresLabel: row.previous_expires_at ? formatDateOnlyBogota(row.previous_expires_at) : null,
            })),
            page,
            limit,
            total: Number(countRow?.total || 0),
            totalPages: Math.max(Math.ceil(Number(countRow?.total || 0) / limit), 1),
        });
    } catch (error) {
        console.error("admin replacements list error:", error);
        return res.status(500).json({ message: "Error interno." });
    }
});

module.exports = router;
