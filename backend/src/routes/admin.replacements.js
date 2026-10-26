const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { formatDateOnlyBogota } = require("../utils/date");

const router = express.Router();

function parseFilterDate(value) {
    if (value == null || String(value).trim() === "") return null;
    const date = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) < 1000) return undefined;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : undefined;
}

function bogotaDateStartUtc(date, dayOffset = 0) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayOffset, 5))
        .toISOString().slice(0, 19).replace("T", " ");
}

router.get("/admin/replacements", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const requestedPage = Number.parseInt(req.query.page || "1", 10);
        const requestedLimit = Number.parseInt(req.query.limit || "20", 10);
        const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
        const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 20;
        const offset = (page - 1) * limit;
        const q = String(req.query.q || "").trim().slice(0, 120);
        const fromDate = parseFilterDate(req.query.fromDate);
        const toDate = parseFilterDate(req.query.toDate);
        const platformValue = String(req.query.platformId || "").trim();
        const platformId = platformValue ? Number(platformValue) : null;

        if (fromDate === undefined || toDate === undefined) {
            return res.status(400).json({ message: "Usa fechas válidas en formato AAAA-MM-DD." });
        }
        if (fromDate && toDate && fromDate > toDate) {
            return res.status(400).json({ message: "La fecha inicial no puede ser posterior a la final." });
        }
        if (platformValue && (!Number.isSafeInteger(platformId) || platformId < 1)) {
            return res.status(400).json({ message: "Selecciona una plataforma válida." });
        }

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
                COALESCE(u.name, '') LIKE ? OR
                COALESCE(u.email, '') LIKE ? OR
                COALESCE(admin.email, '') LIKE ? OR
                COALESCE(admin.name, '') LIKE ?
            )`);
            params.push(like, like, like, like, like, like, like, like, like);
        }
        if (fromDate) {
            where.push("arl.created_at >= ?");
            params.push(bogotaDateStartUtc(fromDate));
        }
        if (toDate) {
            where.push("arl.created_at < ?");
            params.push(bogotaDateStartUtc(toDate, 1));
        }
        if (platformId) {
            where.push("arl.platform_id = ?");
            params.push(platformId);
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        const [[countRow]] = await pool.query(
            `SELECT COUNT(*) AS total
               FROM account_replacement_logs arl
               LEFT JOIN users admin ON admin.id = arl.admin_user_id
               LEFT JOIN users u ON u.id = arl.user_id
               LEFT JOIN platforms p ON p.id = arl.platform_id
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

        const response = {
            items: rows.map((row) => ({
                ...row,
                previousExpiresLabel: row.previous_expires_at ? formatDateOnlyBogota(row.previous_expires_at) : null,
            })),
            page,
            limit,
            total: Number(countRow?.total || 0),
            totalPages: Math.max(Math.ceil(Number(countRow?.total || 0) / limit), 1),
        };

        if (page === 1) {
            const [platformRows] = await pool.query(
                `SELECT DISTINCT p.id, p.name
                   FROM account_replacement_logs arl
                   JOIN platforms p ON p.id = arl.platform_id
                  ORDER BY p.name`
            );
            response.platforms = platformRows.map((platform) => ({ id: platform.id, name: platform.name }));
        }

        return res.json(response);
    } catch (error) {
        console.error("admin replacements list error:", error);
        return res.status(500).json({ message: "Error interno." });
    }
});

module.exports = router;
