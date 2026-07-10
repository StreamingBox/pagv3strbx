const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { normalizeCurrency } = require("../utils/currency");

const router = express.Router();
const ALLOWED_USER_STATUSES = new Set(["active", "inactive", "blocked", "pending", "rejected"]);

router.get("/admin/users", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const q = String(req.query.q || "").trim().toLowerCase();
        const role = String(req.query.role || "").trim().toLowerCase();
        const status = String(req.query.status || "").trim().toLowerCase();
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 1000);
        const offset = (pageNum - 1) * limitNum;
        const where = [];
        const params = [];

        if (q) {
            where.push("(LOWER(COALESCE(u.email, '')) LIKE ? OR LOWER(COALESCE(u.name, '')) LIKE ? OR CAST(u.id AS CHAR) LIKE ?)");
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }

        if (["admin", "user"].includes(role)) {
            where.push("u.role = ?");
            params.push(role);
        }

        if (ALLOWED_USER_STATUSES.has(status)) {
            where.push("u.status = ?");
            params.push(status);
        }

        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM users u ${whereSql}`, params);
        const total = countRows[0].total;

        const [rows] = await pool.query(
            `SELECT u.id, u.name, u.email, u.role, u.status, u.created_at, u.last_login_at,
               COALESCE(w.balance, 0) AS balance, 
               COALESCE(w.profit_total, 0) AS profit_total,
               COALESCE(w.currency, 'COP') AS currency,
               (SELECT COUNT(*)
                  FROM user_devices d
                 WHERE d.user_id = u.id) AS device_count,
               (SELECT d.last_seen_at
                  FROM user_devices d
                 WHERE d.user_id = u.id
                 ORDER BY d.last_seen_at DESC, d.id DESC
                 LIMIT 1) AS last_seen_at,
               (SELECT d.device_label
                  FROM user_devices d
                 WHERE d.user_id = u.id
                 ORDER BY d.last_seen_at DESC, d.id DESC
                 LIMIT 1) AS last_device_label,
               (SELECT d.device_type
                  FROM user_devices d
                 WHERE d.user_id = u.id
                 ORDER BY d.last_seen_at DESC, d.id DESC
                 LIMIT 1) AS last_device_type,
               (SELECT d.browser_name
                  FROM user_devices d
                 WHERE d.user_id = u.id
                 ORDER BY d.last_seen_at DESC, d.id DESC
                 LIMIT 1) AS last_browser_name,
               (SELECT d.os_name
                  FROM user_devices d
                 WHERE d.user_id = u.id
                 ORDER BY d.last_seen_at DESC, d.id DESC
                 LIMIT 1) AS last_os_name,
               (SELECT d.ip_address
                  FROM user_devices d
                 WHERE d.user_id = u.id
                 ORDER BY d.last_seen_at DESC, d.id DESC
                 LIMIT 1) AS last_ip_address,
               (
                 SELECT COALESCE(SUM(ABS(t.amount)), 0)
                 FROM wallet_transactions t
                 WHERE t.wallet_id = w.id
                   AND t.type = 'purchase'
                   AND t.amount < 0
               ) + (
                 SELECT COALESCE(SUM(t.amount), 0)
                 FROM wallet_transactions t
                 WHERE t.wallet_id = w.id
                   AND t.type = 'invest_adj'
               ) AS total_invested
        FROM users u
        LEFT JOIN wallets w ON w.user_id = u.id
        ${whereSql}
        ORDER BY u.id DESC
        LIMIT ? OFFSET ?`,
            [...params, limitNum, offset]
        );

        return res.json({
            items: rows,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.max(Math.ceil(total / limitNum), 1),
        });
    } catch (err) {
        console.error("API Error at " + req.originalUrl + ":", err.message);
        return res.status(500).json({ message: "Error interno." });
    }
});

router.get("/admin/users/stats", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT SUM(profit_total) as total_profit, currency FROM wallets GROUP BY currency"
        );
        return res.json(rows);
    } catch (err) {
        console.error("API Error at " + req.originalUrl + ":", err.message);
        return res.status(500).json({ message: "Error interno." });
    }
});

router.get("/admin/users/:id/activity", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const userId = Number(req.params.id);
        if (!Number.isFinite(userId) || userId <= 0) {
            return res.status(400).json({ message: "Usuario invalido." });
        }

        const [userRows] = await pool.query(
            "SELECT id, name, email, role, status, last_login_at FROM users WHERE id = ? LIMIT 1",
            [userId]
        );
        if (!userRows.length) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        const [devices] = await pool.query(
            `SELECT id, device_label, device_type, browser_name, os_name, ip_address, user_agent,
                    first_seen_at, last_seen_at, login_count, last_event
               FROM user_devices
              WHERE user_id = ?
              ORDER BY last_seen_at DESC, id DESC
              LIMIT 100`,
            [userId]
        );

        const [events] = await pool.query(
            `SELECT id, event_type, device_label, device_type, browser_name, os_name, ip_address, user_agent, created_at
               FROM user_login_events
              WHERE user_id = ?
              ORDER BY created_at DESC, id DESC
              LIMIT 50`,
            [userId]
        );

        const totalLogins = devices.reduce((sum, item) => sum + Number(item.login_count || 0), 0);

        return res.json({
            user: userRows[0],
            summary: {
                deviceCount: devices.length,
                totalLogins,
                lastSeenAt: devices[0]?.last_seen_at || userRows[0].last_login_at || null,
            },
            devices,
            events,
        });
    } catch (err) {
        console.error("GET /admin/users/:id/activity Error:", err.message);
        return res.status(500).json({ message: "Error interno." });
    }
});

router.post("/admin/users", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { name, email, password, role, currency } = req.body || {};
        const requestedCurrency = String(currency || "COP").trim().toUpperCase();
        const finalCurrency = normalizeCurrency(requestedCurrency, "COP");
        if (!["COP", "USD", "USDT", "MXN"].includes(requestedCurrency) || !["COP", "USD", "MXN"].includes(finalCurrency)) {
            return res.status(400).json({ message: "currency inválida. Usa COP, MXN o USDT." });
        }

        if (!name || !email || !password) {
            return res.status(400).json({ message: "name, email y password son obligatorios." });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const finalRole = role === "admin" ? "admin" : "user";

        const [exists] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [normalizedEmail]);
        if (exists.length) return res.status(409).json({ message: "Ese email ya existe." });

        const password_hash = await bcrypt.hash(String(password), 12);

        const [result] = await pool.query(
            `INSERT INTO users (name, email, password_hash, role, status, currency)
             VALUES (?, ?, ?, ?, 'active', ?)`,
            [name, normalizedEmail, password_hash, finalRole, finalCurrency]
        );
        await pool.query(
            "INSERT INTO wallets (user_id, balance, currency) VALUES (?, 0.00, ?)",
            [result.insertId, finalCurrency]
        );

        return res.status(201).json({
            user: { id: result.insertId, name, email: normalizedEmail, role: finalRole, status: "active" },
        });
    } catch (err) {
        console.error("API Error at " + req.originalUrl + ":", err.message);
        return res.status(500).json({ message: "Error interno." });
    }
});

router.patch("/admin/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const { id } = req.params;
        const { role, status, name, currency } = req.body || {};
        const normalizedStatus = status == null || String(status).trim() === ""
            ? null
            : String(status).trim().toLowerCase();

        if (normalizedStatus && !ALLOWED_USER_STATUSES.has(normalizedStatus)) {
            return res.status(400).json({ message: "Estado de usuario invalido." });
        }

        await conn.beginTransaction();

        if (currency !== undefined && currency !== null && String(currency).trim() !== "") {
            const requestedCurrency = String(currency).trim().toUpperCase();
            const finalCurrency = normalizeCurrency(requestedCurrency);
            if (!["COP", "USD", "USDT", "MXN"].includes(requestedCurrency) || !["COP", "USD", "MXN"].includes(finalCurrency)) {
                await conn.rollback();
                return res.status(400).json({ message: "currency inválida. Usa COP, MXN o USDT." });
            }

            const [[wallet]] = await conn.query(
                `SELECT w.id, w.balance, w.profit_total, w.total_invested,
                        (SELECT COUNT(*) FROM wallet_transactions wt WHERE wt.wallet_id = w.id) AS transaction_count
                   FROM wallets w
                  WHERE w.user_id = ?
                  LIMIT 1
                  FOR UPDATE`,
                [id]
            );
            const hasMoneyHistory = Number(wallet?.balance || 0) !== 0
                || Number(wallet?.profit_total || 0) !== 0
                || Number(wallet?.total_invested || 0) !== 0
                || Number(wallet?.transaction_count || 0) > 0;

            if (hasMoneyHistory) {
                await conn.rollback();
                return res.status(409).json({
                    message: "No se puede cambiar la moneda si el usuario tiene saldo. Déjalo en 0 antes de cambiar.",
                });
            }

            await conn.query("UPDATE users SET currency = ? WHERE id = ?", [finalCurrency, id]);
            await conn.query("UPDATE wallets SET currency = ? WHERE user_id = ?", [finalCurrency, id]);
        }

        await conn.query(
            `UPDATE users
       SET name = COALESCE(?, name),
           role = COALESCE(?, role),
           status = COALESCE(?, status)
       WHERE id = ?`,
            [name ?? null, role ?? null, normalizedStatus, id]
        );

        await conn.commit();
        return res.json({ ok: true });
    } catch (err) {
        try { await conn.rollback(); } catch { }
        console.error("PATCH /admin/users/:id Error:", err.message);
        return res.status(500).json({ message: "Error interno." });
    } finally {
        conn.release();
    }
});

router.patch("/admin/users/:id/password", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body || {};
        if (!password || String(password).length < 8) {
            return res.status(400).json({ message: "password es obligatorio (min 8)." });
        }

        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

router.get("/admin/stock-subscriptions", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT
                s.id,
                u.email AS user_email,
                u.name AS user_name,
                p.name AS platform_name,
                d.name AS duration_name,
                s.created_at,
                s.is_notified
             FROM stock_subscriptions s
             JOIN users u ON u.id = s.user_id
             JOIN platform_prices pp ON pp.id = s.platform_price_id
             JOIN platforms p ON p.id = pp.platform_id
             JOIN durations d ON d.id = pp.duration_id
             WHERE s.is_notified = FALSE
             ORDER BY s.created_at DESC`
        );
        return res.json(rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error al cargar notificaciones de stock." });
    }
});

router.delete("/admin/stock-subscriptions/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const subId = req.params.id;

        await pool.query("DELETE FROM stock_subscriptions WHERE id = ?", [subId]);
        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error al resolver la alerta." });
    }
});

module.exports = router;
