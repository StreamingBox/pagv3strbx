const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

router.post("/admin/wallet/topup", requireAuth, requireRole("admin"), async (req, res) => {
    const { userId, amount, note } = req.body || {};
    if (!userId || !amount || Number(amount) <= 0) {
        return res.status(400).json({ message: "userId y amount (>0) son obligatorios." });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // lock wallet row
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

        const newBalance = balance + Number(amount);

        await conn.query("UPDATE wallets SET balance = ? WHERE id = ?", [newBalance, walletId]);

        await conn.query(
            `INSERT INTO wallet_transactions
        (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
       VALUES (?, 'topup', ?, ?, 'admin_topup', NULL, ?)`,
            [walletId, Number(amount), newBalance, note || "Recarga admin"]
        );

        await conn.commit();

        return res.json({
            ok: true,
            userId,
            balance: newBalance,
            currency,
        });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    } finally {
        conn.release();
    }
});

module.exports = router;
