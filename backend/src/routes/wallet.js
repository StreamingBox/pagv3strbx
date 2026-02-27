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

module.exports = router;
