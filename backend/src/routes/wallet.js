const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.get("/wallet", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;

        const [rows] = await pool.query(
            `
      SELECT
        COALESCE(w.balance, 0) AS balance,
        COALESCE(w.profit_total, 0) AS profit_total,
        u.currency AS currency
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.id
      WHERE u.id = ?
      LIMIT 1
      `,
            [userId]
        );

        if (!rows.length) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        // Si no existe wallet, opcionalmente la creas aquí (recomendado):
        // const [wRows] = await pool.query("SELECT id FROM wallets WHERE user_id = ? LIMIT 1", [userId]);
        // if (!wRows.length) await pool.query("INSERT INTO wallets (user_id, balance, profit_total, currency) VALUES (?,0,0,?)",[userId, rows[0].currency]);

        return res.json(rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

router.get("/wallet/transactions", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
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

        // Limites y offset no van en parámetros preparados por limitaciones de mysql2, pero están saneados
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
