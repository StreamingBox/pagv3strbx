const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

router.post("/admin/wallet/topup", requireAuth, requireRole("admin"), async (req, res) => {
    const { userId, amount, note } = req.body || {};
    if (!userId || amount === undefined) {
        return res.status(400).json({ message: "userId y amount son obligatorios." });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [wrows] = await conn.query(
            "SELECT id, balance, currency FROM wallets WHERE user_id = ? FOR UPDATE",
            [userId]
        );

        let walletId, balance, currency;
        if (!wrows.length) {
            const [ins] = await conn.query(
                "INSERT INTO wallets (user_id, balance, currency) VALUES (?, 0.00, 'COP')",
                [userId]
            );
            walletId = ins.insertId;
            balance = 0;
            currency = "COP";
        } else {
            walletId = wrows[0].id;
            balance = Number(wrows[0].balance);
            currency = wrows[0].currency || "COP";
        }

        const amt = Number(amount);
        const newBalance = balance + amt;

        await conn.query("UPDATE wallets SET balance = ? WHERE id = ?", [newBalance, walletId]);

        await conn.query(
            `INSERT INTO wallet_transactions
        (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
       VALUES (?, ?, ?, ?, 'admin_topup', NULL, ?)`,
            [walletId, amt >= 0 ? 'topup' : 'adjustment', amt, newBalance, note || (amt >= 0 ? "Recarga admin" : "Ajuste admin")]
        );

        await conn.commit();
        return res.json({ ok: true, balance: newBalance, currency });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    } finally {
        conn.release();
    }
});

router.post("/admin/wallet/adjust-profit", requireAuth, requireRole("admin"), async (req, res) => {
    const { userId, amount, note } = req.body || {};
    if (!userId || amount === undefined) {
        return res.status(400).json({ message: "userId y amount son obligatorios." });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [wrows] = await conn.query(
            "SELECT id, profit_total, currency FROM wallets WHERE user_id = ? FOR UPDATE",
            [userId]
        );

        if (!wrows.length) {
            return res.status(404).json({ message: "Wallet no encontrada." });
        }

        const walletId = wrows[0].id;
        const profitTotal = Number(wrows[0].profit_total);
        const amt = Number(amount);
        const newProfit = profitTotal + amt;

        await conn.query("UPDATE wallets SET profit_total = ? WHERE id = ?", [newProfit, walletId]);

        await conn.query(
            `INSERT INTO wallet_transactions
        (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
       VALUES (?, 'profit_adj', ?, ?, 'admin_profit_adj', NULL, ?)`,
            [walletId, amt, newProfit, note || "Ajuste de ganancia admin"]
        );

        await conn.commit();
        return res.json({ ok: true, profit_total: newProfit });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    } finally {
        conn.release();
    }
});

// Obtener todas las transacciones gobales (con filtro de usuario y tipo)
router.get("/admin/wallet/transactions", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { page = 1, limit = 10, type, userId } = req.query;
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
        const offset = (pageNum - 1) * limitNum;

        let whereClauses = [];
        let queryParams = [];

        if (type) {
            whereClauses.push("t.type = ?");
            queryParams.push(type);
        }

        if (userId) {
            whereClauses.push("w.user_id = ?");
            queryParams.push(userId);
        }

        const whereStr = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

        const countQuery = `
            SELECT COUNT(*) as total 
            FROM wallet_transactions t
            JOIN wallets w ON t.wallet_id = w.id
            ${whereStr}
        `;
        const [countRows] = await pool.query(countQuery, queryParams);
        const total = countRows[0].total;

        const dataQuery = `
            SELECT 
                t.*,
                w.user_id, 
                u.email as user_email
            FROM wallet_transactions t
            JOIN wallets w ON t.wallet_id = w.id
            JOIN users u ON w.user_id = u.id
            ${whereStr}
            ORDER BY t.created_at DESC, t.id DESC
            LIMIT ${limitNum} OFFSET ${offset}
        `;
        const [rows] = await pool.query(dataQuery, queryParams);

        return res.json({
            items: rows,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
        });
    } catch (error) {
        console.error("Error GET /admin/wallet/transactions:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

router.get("/admin/wallet/transactions/:userId", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const userId = req.params.userId;
        const { page = 1, limit = 10, type } = req.query;
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
        const offset = (pageNum - 1) * limitNum;

        const [wRows] = await pool.query("SELECT id FROM wallets WHERE user_id = ? LIMIT 1", [userId]);
        if (!wRows.length) {
            return res.json({ items: [], total: 0, page: pageNum, limit: limitNum, totalPages: 0 });
        }
        const walletId = wRows[0].id;

        let whereClause = "WHERE wallet_id = ?";
        let queryParams = [walletId];

        if (type) {
            whereClause += " AND type = ?";
            queryParams.push(type);
        }

        const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM wallet_transactions ${whereClause}`, queryParams);
        const total = countRows[0].total;

        const [rows] = await pool.query(
            `SELECT id, type, amount, balance_after, reference_type, reference_id, note, created_at
             FROM wallet_transactions 
             ${whereClause} 
             ORDER BY created_at DESC, id DESC
             LIMIT ${limitNum} OFFSET ${offset}`,
            queryParams
        );

        return res.json({
            items: rows,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

module.exports = router;
