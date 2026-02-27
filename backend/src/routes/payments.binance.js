// BACKEND: src/routes/payments.binance.js

const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { binancePayPost, verifyWebhookSignature } = require("../utils/binancePay");

const router = express.Router();

/**
 * ==========================================
 * 1️⃣ CREAR ORDEN (TOPUP)
 * POST /api/payments/binance/topup
 * ==========================================
 */
router.post("/payments/binance/topup", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const amount = Number(req.body?.amount);

        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ message: "Monto inválido." });
        }

        // 🔒 Solo usuarios USD pueden usar Binance
        const [uRows] = await pool.query(
            "SELECT id, currency FROM users WHERE id = ? LIMIT 1",
            [userId]
        );

        if (!uRows.length) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        const currency = String(uRows[0].currency || "").toUpperCase();
        if (currency !== "USD") {
            return res.status(403).json({
                message: "Binance Pay solo está disponible para usuarios con moneda USD.",
            });
        }

        const merchantTradeNo = `TOPUP_${userId}_${Date.now()}`;

        // Guardamos payment intent
        const [insert] = await pool.query(
            `INSERT INTO payment_intents
      (user_id, provider, merchant_trade_no, amount, currency, status)
      VALUES (?, 'binance_pay', ?, ?, 'USDT', 'pending')`,
            [userId, merchantTradeNo, amount]
        );

        const intentId = insert.insertId;

        // Crear orden en Binance
        const payload = {
            env: { terminalType: "WEB" },
            merchantTradeNo,
            orderAmount: amount,
            currency: "USDT",
            goods: {
                goodsType: "01",
                goodsCategory: "D000",
                referenceGoodsId: `wallet_topup_${intentId}`,
                goodsName: "Streaming Box Wallet Topup",
                goodsDetail: `Recarga de saldo ID ${intentId}`,
            },
        };

        const r = await binancePayPost("/binancepay/openapi/v2/order", payload);

        await pool.query(
            `UPDATE payment_intents
       SET raw_create_response=?, prepay_id=?
       WHERE id=? LIMIT 1`,
            [
                JSON.stringify(r.data || {}),
                r?.data?.data?.prepayId || null,
                intentId,
            ]
        );

        if (!r.ok || r.data?.status !== "SUCCESS") {
            return res.status(502).json({
                message: "No se pudo crear la orden en Binance.",
                details: r.data,
            });
        }

        const data = r.data.data;

        return res.json({
            ok: true,
            intentId,
            merchantTradeNo,
            amount,
            qrcodeLink: data.qrcodeLink,
            checkoutUrl: data.checkoutUrl,
            universalUrl: data.universalUrl,
        });

    } catch (err) {
        console.error("BINANCE TOPUP ERROR:", err);
        return res.status(500).json({ message: "Error interno." });
    }
});


/**
 * ==========================================
 * 2️⃣ CONSULTAR ESTADO (POLLING)
 * GET /api/payments/binance/:id
 * ==========================================
 */
router.get("/payments/binance/:id", requireAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const userId = req.user.id;

        const [rows] = await pool.query(
            `SELECT id, user_id, amount, status, credited, created_at, paid_at
       FROM payment_intents
       WHERE id=? AND provider='binance_pay'
       LIMIT 1`,
            [id]
        );

        if (!rows.length) {
            return res.status(404).json({ message: "Pago no encontrado." });
        }

        if (rows[0].user_id !== userId) {
            return res.status(403).json({ message: "No autorizado." });
        }

        return res.json({ ok: true, payment: rows[0] });

    } catch (err) {
        console.error("BINANCE STATUS ERROR:", err);
        return res.status(500).json({ message: "Error interno." });
    }
});


/**
 * ==========================================
 * 3️⃣ WEBHOOK (CONFIRMACIÓN AUTOMÁTICA)
 * POST /api/payments/binance/webhook
 * ==========================================
 */
router.post("/payments/binance/webhook", async (req, res) => {
    try {
        const signatureCheck = verifyWebhookSignature(req);

        if (!signatureCheck.ok) {
            return res.status(401).json({
                returnCode: "FAIL",
                returnMessage: "Invalid signature",
            });
        }

        const body = req.body;
        const bizStatus = body?.bizStatus;

        if (bizStatus !== "PAY_SUCCESS") {
            return res.json({ returnCode: "SUCCESS" });
        }

        const data = typeof body.data === "string"
            ? JSON.parse(body.data)
            : body.data;

        const merchantTradeNo = data?.merchantTradeNo;

        if (!merchantTradeNo) {
            return res.json({ returnCode: "SUCCESS" });
        }

        const conn = await pool.getConnection();

        try {
            await conn.beginTransaction();

            const [rows] = await conn.query(
                `SELECT * FROM payment_intents
         WHERE merchant_trade_no=? AND provider='binance_pay'
         LIMIT 1
         FOR UPDATE`,
                [merchantTradeNo]
            );

            if (!rows.length) {
                await conn.rollback();
                return res.json({ returnCode: "SUCCESS" });
            }

            const intent = rows[0];

            if (intent.credited === 1) {
                await conn.commit();
                return res.json({ returnCode: "SUCCESS" });
            }

            const amount = Number(intent.amount);

            // Obtener wallet
            const [walletRows] = await conn.query(
                "SELECT id, balance FROM wallets WHERE user_id=? LIMIT 1 FOR UPDATE",
                [intent.user_id]
            );

            let walletId;
            let balanceBefore = 0;

            if (!walletRows.length) {
                const [insertWallet] = await conn.query(
                    "INSERT INTO wallets (user_id, balance, currency) VALUES (?, 0, 'USD')",
                    [intent.user_id]
                );
                walletId = insertWallet.insertId;
            } else {
                walletId = walletRows[0].id;
                balanceBefore = Number(walletRows[0].balance);
            }

            const newBalance = balanceBefore + amount;

            await conn.query(
                "UPDATE wallets SET balance=? WHERE id=?",
                [newBalance, walletId]
            );

            await conn.query(
                `INSERT INTO wallet_transactions
         (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
         VALUES (?, 'topup_binance', ?, ?, 'payment_intent', ?, ?)`,
                [
                    walletId,
                    amount,
                    newBalance,
                    intent.id,
                    `BinancePay ${merchantTradeNo}`,
                ]
            );

            await conn.query(
                `UPDATE payment_intents
         SET status='paid', credited=1, paid_at=NOW()
         WHERE id=?`,
                [intent.id]
            );

            await conn.commit();

            return res.json({ returnCode: "SUCCESS" });

        } catch (err) {
            await conn.rollback();
            console.error("WEBHOOK ERROR:", err);
            return res.json({ returnCode: "SUCCESS" });
        } finally {
            conn.release();
        }

    } catch (err) {
        console.error("BINANCE WEBHOOK ERROR:", err);
        return res.json({ returnCode: "SUCCESS" });
    }
});


/**
 * ==========================================
 * EXPORT ROUTER
 * ==========================================
 */
module.exports = router;
