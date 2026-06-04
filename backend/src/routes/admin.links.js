const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { formatDateOnlyBogota, formatStoredDateOnly } = require("../utils/date");

const router = express.Router();

const ACTIVE_LINK_WHERE = `
    cl.revoked_at IS NULL
    AND s.id IS NOT NULL
    AND s.status = 'active'
    AND (
        (a.expires_at IS NOT NULL AND a.expires_at >= UTC_TIMESTAMP())
        OR (a.expires_at IS NULL AND s.expires_at >= DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)))
    )
`;

const EXPIRED_LINK_WHERE = `
    cl.revoked_at IS NULL
    AND (
        s.id IS NULL
        OR s.status <> 'active'
        OR (a.expires_at IS NOT NULL AND a.expires_at < UTC_TIMESTAMP())
        OR (a.expires_at IS NULL AND s.expires_at < DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)))
    )
`;

function cleanBaseUrl() {
    return String(process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function linkStatus(row) {
    if (row.revoked_at) return "revoked";
    if (!row.subscription_id) return "expired";
    if (row.subscription_status !== "active") return "expired";
    if (row.account_expires_at) {
        const expiresAt = row.account_expires_at instanceof Date ? row.account_expires_at : new Date(row.account_expires_at);
        if (Number.isNaN(expiresAt.getTime())) return "expired";
        return expiresAt.getTime() >= Date.now() ? "active" : "expired";
    }
    const expiresAt = formatStoredDateOnly(row.subscription_expires_at);
    if (expiresAt === "-") return "expired";
    return expiresAt >= formatDateOnlyBogota(new Date()) ? "active" : "expired";
}

function buildWhere({ status, q }) {
    const where = [];
    const params = [];

    if (status === "active") {
        where.push(`(${ACTIVE_LINK_WHERE})`);
    } else if (status === "revoked") {
        where.push("cl.revoked_at IS NOT NULL");
    } else if (status === "expired") {
        where.push(`(${EXPIRED_LINK_WHERE})`);
    }

    if (q) {
        where.push(`(
            cl.token LIKE ?
            OR CAST(cl.id AS CHAR) LIKE ?
            OR CAST(s.id AS CHAR) LIKE ?
            OR LOWER(COALESCE(ord.order_code, '')) LIKE ?
            OR LOWER(COALESCE(u.email, '')) LIKE ?
            OR LOWER(COALESCE(u.name, '')) LIKE ?
            OR LOWER(COALESCE(p.name, '')) LIKE ?
            OR LOWER(COALESCE(a.email, '')) LIKE ?
        )`);
        const like = `%${q}%`;
        const lowerLike = `%${q.toLowerCase()}%`;
        params.push(like, like, like, lowerLike, lowerLike, lowerLike, lowerLike, lowerLike);
    }

    return {
        whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
        params,
    };
}

const BASE_FROM = `
    FROM credential_links cl
    LEFT JOIN subscriptions s ON s.id = cl.subscription_id
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN platforms p ON p.id = s.platform_id
    LEFT JOIN platform_accounts a ON a.id = s.platform_account_id
    LEFT JOIN users creator ON creator.id = cl.created_by_user_id
    LEFT JOIN users revoker ON revoker.id = cl.revoked_by_user_id
    LEFT JOIN (
        SELECT
            oi.subscription_id,
            MIN(o.id) AS order_id,
            MIN(o.order_code) AS order_code
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        GROUP BY oi.subscription_id
    ) ord ON ord.subscription_id = s.id
`;

router.get("/admin/links", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page || "1", 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10) || 20, 1), 100);
        const offset = (page - 1) * limit;
        const status = String(req.query.status || "active").trim().toLowerCase();
        const q = String(req.query.q || "").trim();
        const safeStatus = ["active", "revoked", "expired", "all"].includes(status) ? status : "active";
        const { whereSql, params } = buildWhere({ status: safeStatus, q });

        const [countRows] = await pool.query(
            `SELECT COUNT(DISTINCT cl.id) AS total ${BASE_FROM} ${whereSql}`,
            params
        );
        const total = Number(countRows?.[0]?.total || 0);

        const [rows] = await pool.query(
            `SELECT
                cl.id,
                cl.subscription_id,
                cl.token,
                cl.created_at,
                cl.created_by_user_id,
                cl.revoked_at,
                cl.revoked_by_user_id,
                cl.show_whatsapp,
                s.status AS subscription_status,
                s.expires_at AS subscription_expires_at,
                s.price,
                s.currency,
                u.id AS user_id,
                u.name AS user_name,
                u.email AS user_email,
                p.name AS platform_name,
                p.type AS platform_type,
                a.email AS account_email,
                a.profile_number,
                a.expires_at AS account_expires_at,
                creator.email AS created_by_email,
                revoker.email AS revoked_by_email,
                ord.order_id,
                ord.order_code
             ${BASE_FROM}
             ${whereSql}
             ORDER BY cl.created_at DESC, cl.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        const baseUrl = cleanBaseUrl();
        const items = rows.map((row) => ({
            ...row,
            status: linkStatus(row),
            url: `${baseUrl}/s/${row.token}`,
        }));

        return res.json({
            ok: true,
            items,
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        });
    } catch (err) {
        console.error("[admin/links] list", err);
        return res.status(500).json({ ok: false, message: "No se pudieron cargar los links." });
    }
});

router.patch("/admin/links/:id/revoke", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, message: "ID invalido." });
        }

        const [result] = await pool.query(
            `UPDATE credential_links
                SET revoked_at = UTC_TIMESTAMP(), revoked_by_user_id = ?
              WHERE id = ? AND revoked_at IS NULL`,
            [req.user.id, id]
        );

        return res.json({ ok: true, changed: Number(result?.affectedRows || 0) });
    } catch (err) {
        console.error("[admin/links] revoke", err);
        return res.status(500).json({ ok: false, message: "No se pudo desactivar el link." });
    }
});

router.patch("/admin/links/:id/reactivate", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, message: "ID invalido." });
        }

        const [result] = await pool.query(
            `UPDATE credential_links
                SET revoked_at = NULL, revoked_by_user_id = NULL
              WHERE id = ?`,
            [id]
        );

        return res.json({ ok: true, changed: Number(result?.affectedRows || 0) });
    } catch (err) {
        console.error("[admin/links] reactivate", err);
        return res.status(500).json({ ok: false, message: "No se pudo reactivar el link." });
    }
});

router.delete("/admin/links/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, message: "ID invalido." });
        }

        const [result] = await pool.query("DELETE FROM credential_links WHERE id = ?", [id]);
        return res.json({ ok: true, deleted: Number(result?.affectedRows || 0) });
    } catch (err) {
        console.error("[admin/links] delete", err);
        return res.status(500).json({ ok: false, message: "No se pudo borrar el link." });
    }
});

module.exports = router;
