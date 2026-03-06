const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

router.get("/admin/users", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 1000);
        const offset = (pageNum - 1) * limitNum;

        // COUNT
        const [countRows] = await pool.query("SELECT COUNT(*) as total FROM users");
        const total = countRows[0].total;

        // DATA
        const [rows] = await pool.query(
            `SELECT u.id, u.name, u.email, u.role, u.status, u.created_at,
               COALESCE(w.balance, 0) AS balance, 
               COALESCE(w.profit_total, 0) AS profit_total,
               COALESCE(w.currency, 'COP') AS currency,
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
        ORDER BY u.id DESC
        LIMIT ? OFFSET ?`,
            [limitNum, offset]
        );


        return res.json({
            items: rows,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
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

// ✅ Admin crea usuario
router.post("/admin/users", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { name, email, password, role, currency } = req.body || {};
        const finalCurrency = (currency || "COP").toString().toUpperCase();
        if (!["COP", "USD", "MXN"].includes(finalCurrency)) {
            return res.status(400).json({ message: "currency inválida. Usa COP, USD o MXN." });
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

// ✅ Admin actualiza role/status/name
// ✅ Admin actualiza role/status/name/currency (con regla segura)
router.patch("/admin/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const { id } = req.params;
        const { role, status, name, currency } = req.body || {};

        await conn.beginTransaction();

        // Si viene currency, validamos y sincronizamos users + wallets.
        if (currency !== undefined && currency !== null && String(currency).trim() !== "") {
            const finalCurrency = String(currency).trim().toUpperCase();
            if (!["COP", "USD", "MXN"].includes(finalCurrency)) {
                await conn.rollback();
                return res.status(400).json({ message: "currency inválida. Usa COP, USD o MXN." });
            }

            // Regla recomendada: solo dejar cambiar moneda si el balance está en 0
            const [wrows] = await conn.query(
                "SELECT balance FROM wallets WHERE user_id = ? LIMIT 1",
                [id]
            );
            const balance = Number(wrows?.[0]?.balance ?? 0);

            if (balance !== 0) {
                await conn.rollback();
                return res.status(409).json({
                    message: "No se puede cambiar la moneda si el usuario tiene saldo. Déjalo en 0 antes de cambiar.",
                });
            }

            await conn.query("UPDATE users SET currency = ? WHERE id = ?", [finalCurrency, id]);
            await conn.query("UPDATE wallets SET currency = ? WHERE user_id = ?", [finalCurrency, id]);
        }

        // Actualizaciones normales
        await conn.query(
            `UPDATE users
       SET name = COALESCE(?, name),
           role = COALESCE(?, role),
           status = COALESCE(?, status)
       WHERE id = ?`,
            [name ?? null, role ?? null, status ?? null, id]
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


// ✅ Admin cambia contraseña
router.patch("/admin/users/:id/password", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body || {};
        if (!password || String(password).length < 8) {
            return res.status(400).json({ message: "password es obligatorio (min 8)." });
        }

        const password_hash = await bcrypt.hash(String(password), 12);
        await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [password_hash, id]);

        return res.json({ ok: true });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

module.exports = router;
