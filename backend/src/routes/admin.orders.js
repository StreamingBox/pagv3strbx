const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

// ✅ Historial de compras (subscriptions) con PAGINACIÓN + FILTROS
router.get("/admin/orders", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const {
            userId,
            status,
            platformId,
            currency,
            q,
            dateFrom,
            dateTo,
        } = req.query;

        // pagination
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);
        const offset = (page - 1) * limit;

        const where = [];
        const params = [];

        if (userId) {
            where.push("s.user_id = ?");
            params.push(Number(userId));
        }
        if (status) {
            where.push("s.status = ?");
            params.push(String(status));
        }
        if (platformId) {
            where.push("s.platform_id = ?");
            params.push(Number(platformId));
        }
        if (currency) {
            where.push("s.currency = ?");
            params.push(String(currency));
        }

        // búsqueda general
        if (q) {
            const qq = `%${String(q).trim()}%`;
            where.push("(u.email LIKE ? OR u.name LIKE ? OR p.name LIKE ?)");
            params.push(qq, qq, qq);
        }

        // rango de fechas (por created_at)
        if (dateFrom) {
            where.push("DATE(s.created_at) >= DATE(?)");
            params.push(String(dateFrom));
        }
        if (dateTo) {
            where.push("DATE(s.created_at) <= DATE(?)");
            params.push(String(dateTo));
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        // total
        const [countRows] = await pool.query(
            `
      SELECT COUNT(*) AS total
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      JOIN platforms p ON p.id = s.platform_id
      JOIN durations d ON d.id = s.duration_id
      LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
      ${whereSql}
      `,
            params
        );

        const total = Number(countRows?.[0]?.total || 0);
        const pages = Math.max(Math.ceil(total / limit), 1);

        // items (MariaDB: LIMIT offset, limit => LIMIT ?, ?)
        const [rows] = await pool.query(
            `
      SELECT
        s.id AS orderId,
        s.status,
        s.price,
        s.currency,
        s.expires_at,
        s.created_at,
        u.id AS userId,
        u.email AS userEmail,
        u.name AS userName,
        p.id AS platformId,
        p.name AS platformName,
        d.id AS durationId,
        d.name AS durationName,
        d.days,
        pa.id AS accountId,
        pa.email AS accountEmail,
        pa.profile_number AS accountProfile,
        pa.pin AS accountPin
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      JOIN platforms p ON p.id = s.platform_id
      JOIN durations d ON d.id = s.duration_id
      LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
      ${whereSql}
      ORDER BY s.id DESC
      LIMIT ?, ?
      `,
            [...params, offset, limit]
        );

        return res.json({
            page,
            limit,
            total,
            pages,
            items: rows,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

// ✅ Detalle de una compra (igual que antes)
router.get("/admin/orders/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await pool.query(
            `SELECT
        s.*,
        u.email AS user_email,
        u.name AS user_name,
        p.name AS platform_name,
        d.name AS duration_name,
        d.days,
        pa.email AS account_email,
        pa.password AS account_password,
        pa.pin AS account_pin,
        pa.profile_number AS account_profile
      FROM subscriptions s
      JOIN users u ON u.id = s.user_id
      JOIN platforms p ON p.id = s.platform_id
      JOIN durations d ON d.id = s.duration_id
      LEFT JOIN platform_accounts pa ON pa.id = s.platform_account_id
      WHERE s.id = ?
      LIMIT 1`,
            [id]
        );

        if (!rows.length) return res.status(404).json({ message: "Orden no encontrada." });
        return res.json(rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

module.exports = router;
