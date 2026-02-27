// BACKEND: pagv2strbx/src/routes/payments.binance.js
const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { binancePayPost, verifyWebhookSignature } = require("../utils/binancePay");

const router = express.Router();

/**
 * POST /api/payments/binance/topup
 * Body: { amount: number }  (USD lógico, se envía como USDT)
 * Restricción: SOLO usuarios con users.currency='USD'
 */
router.post("/payments/binance/topup", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const amount = Number(req.body?.amount);

        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ message: "Monto inválido." });
        }
        if (amount < 1) {
            return res.status(400).json({ message: "Monto mínimo: 1 USD." });
        }

        const [uRows] = await pool.query(
            "SELECT id, currency FROM users WHERE id = ? LIMIT 1",
            [userId]
        );
        if (!uRows.length) return res.status(404).json({ message: "Usuario no encontrado." });

        const userCurrency = String(uRows[0].currency || "").toUpperCase();
        if (userCurrency !== "USD") {
            return res.status(403).json({
                message: "Binance Pay solo está habilitado para usuarios con moneda USD.",
            });
        }

        const merchantTradeNo = `TOPUP_${userId}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

        // 1) Guardar intent en DB
        const [ins] = await pool.query(
            `INSERT INTO payment_intents
       (user_id, provider, merchant_trade_no, amount, currency, status)
       VALUES (?, 'binance_pay', ?, ?, 'USDT', 'pending')`,
            [userId, merchantTradeNo, amount]
        );
        const intentId = ins.insertId;

        // 2) Crear orden en Binance Pay
        const payload = {
            env: { terminalType: "WEB" },
            merchantTradeNo,
            orderAmount: amount,
            currency: "USDT",
            goods: {
                goodsType: "01",
                goodsCategory: "D000",
                referenceGoodsId: `wallet_topup_${intentId}`,
                goodsName: "Streaming Box - Wallet Topup",
                goodsDetail: `Recarga de saldo (Intent ${intentId})`,
            },
        };

        const r = await binancePayPost("/binancepay/openapi/v2/order", payload);

        // Guardar respuesta
        await pool.query(
            `UPDATE payment_intents
       SET raw_create_response = ?, prepay_id = ?, status = ?
       WHERE id = ? LIMIT 1`,
            [
                JSON.stringify(r.data ?? {}),
                r?.data?.data?.prepayId || null,
                r.ok ? "pending" : "failed",
                intentId,
            ]
        );

        if (!r.ok || r.data?.status !== "SUCCESS") {
            return res.status(502).json({
                message: "No se pudo crear la orden en Binance Pay.",
                details: r.data,
            });
        }

        const data = r.data.data || {};
        return res.json({
            ok: true,
            intentId,
            merchantTradeNo,
            amount,
            currency: "USDT",
            prepayId: data.prepayId,
            qrcodeLink: data.qrcodeLink,
            checkoutUrl: data.checkoutUrl,
            deeplink: data.deeplink,
            universalUrl: data.universalUrl,
            expireTime: data.expireTime,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

/**
 * GET /api/payments/binance/:id
 * Devuelve estado para polling frontend
 */
router.get("/payments/binance/:id", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const id = Number(req.params.id);

        if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "ID inválido." });

        const [rows] = await pool.query(
            `SELECT id, user_id, provider, merchant_trade_no, amount, currency, status, credited, created_at, paid_at
       FROM payment_intents
       WHERE id = ? AND provider='binance_pay'
       LIMIT 1`,
            [id]
        );
        if (!rows.length) return res.status(404).json({ message: "Pago no encontrado." });
        if (Number(rows[0].user_id) !== Number(userId)) {
            return res.status(403).json({ message: "No autorizado." });
        }

        return res.json({ ok: true, payment: rows[0] });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    }
});

/**
 * POST /api/payments/binance/webhook
 * Binance -> tu servidor. Sin auth, SOLO firma.
 *
 * Binance suele enviar body con:
 * {
 *   "bizStatus":"PAY_SUCCESS",
 *   "data":"{...json string...}"
 * }
 */
router.post("/payments/binance/webhook", async (req, res) => {
    try {
        const sig = verifyWebhookSignature(req);
        if (!sig.ok) {
            return res.status(401).json({ returnCode: "FAIL", returnMessage: sig.reason || "Signature invalid" });
        }

        const body = req.body || {};
        const bizStatus = String(body.bizStatus || "");
        const dataStr = body.data;

        let dataObj = null;
        if (typeof dataStr === "string") {
            try {
                dataObj = JSON.parse(dataStr);
            } catch {
                dataObj = null;
            }
        } else if (typeof dataStr === "object" && dataStr) {
            dataObj = dataStr;
        }

        const merchantTradeNo = String(dataObj?.merchantTradeNo || "");
        if (!merchantTradeNo) {
            return res.status(400).json({ returnCode: "FAIL", returnMessage: "Missing merchantTradeNo" });
        }

        // Guardar webhook raw
        await pool.query(
            `UPDATE payment_intents SET raw_webhook_last = ? WHERE provider='binance_pay' AND merchant_trade_no = ? LIMIT 1`,
            [JSON.stringify(body), merchantTradeNo]
        );

        // Solo nos interesa PAY_SUCCESS
        if (bizStatus !== "PAY_SUCCESS") {
            // Acknowledge igual para que Binance no reintente por estados que no acreditan
            return res.json({ returnCode: "SUCCESS", returnMessage: null });
        }

        // Acreditación transaccional + idempotencia
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            const [pRows] = await conn.query(
                `SELECT * FROM payment_intents
         WHERE provider='binance_pay' AND merchant_trade_no = ?
         LIMIT 1
         FOR UPDATE`,
                [merchantTradeNo]
            );

            if (!pRows.length) {
                await conn.rollback();
                return res.json({ returnCode: "SUCCESS", returnMessage: null });
            }

            const intent = pRows[0];
            if (Number(intent.credited) === 1 || String(intent.status) === "paid") {
                await conn.commit();
                return res.json({ returnCode: "SUCCESS", returnMessage: null });
            }

            const amount = Number(intent.amount);

            // Validar que usuario es USD (doble seguridad)
            const [uRows] = await conn.query(
                "SELECT id, currency FROM users WHERE id = ? LIMIT 1",
                [intent.user_id]
            );
            if (!uRows.length || String(uRows[0].currency || "").toUpperCase() !== "USD") {
                // no acreditamos si no cumple
                await conn.query(
                    "UPDATE payment_intents SET status='failed' WHERE id = ? LIMIT 1",
                    [intent.id]
                );
                await conn.commit();
                return res.json({ returnCode: "SUCCESS", returnMessage: null });
            }

            // Wallet (crear si no existe)
            const [wRows] = await conn.query(
                "SELECT id, balance FROM wallets WHERE user_id = ? LIMIT 1 FOR UPDATE",
                [intent.user_id]
            );

            let walletId;
            let balanceBefore = 0;

            if (!wRows.length) {
                const [insW] = await conn.query(
                    "INSERT INTO wallets (user_id, balance, profit_total, currency) VALUES (?, 0, 0, 'USD')",
                    [intent.user_id]
                );
                walletId = insW.insertId;
                balanceBefore = 0;
            } else {
                walletId = wRows[0].id;
                balanceBefore = Number(wRows[0].balance || 0);
            }

            const balanceAfter = balanceBefore + amount;

            await conn.query("UPDATE wallets SET balance = ? WHERE id = ? LIMIT 1", [balanceAfter, walletId]);

            await conn.query(
                `INSERT INTO wallet_transactions
         (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
         VALUES (?, 'topup_binance', ?, ?, 'payment_intent', ?, ?)`,
                [walletId, amount, balanceAfter, intent.id, `Recarga BinancePay ${merchantTradeNo}`]
            );

            await conn.query(
                `UPDATE payment_intents
         SET status='paid', credited=1, paid_at=NOW()
         WHERE id = ? LIMIT 1`,
                [intent.id]
            );

            await conn.commit();
            return res.json({ returnCode: "SUCCESS", returnMessage: null });
        } catch (e) {
            try { await conn.rollback(); } catch {}
            console.error("Webhook error:", e);
            // Binance reintenta si no respondes SUCCESS, pero aquí mejor respondemos SUCCESS
            // y corregimos manualmente si hiciera falta (evita retries infinitos).
            return res.json({ returnCode: "SUCCESS", returnMessage: null });
        } finally {
            conn.release();
        }
    } catch (err) {
        console.error(err);
        return res.json({ returnCode: "SUCCESS", returnMessage: null });
    }
});

module.exports = router;
