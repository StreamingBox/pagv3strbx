const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { createNowPaymentsPayment, fetchNowPaymentsStatus, DEFAULT_PAY_CURRENCY, DEFAULT_PRICE_CURRENCY, WEBHOOK_URL } = require("../services/nowpayments.service");
const { verifyNowPaymentsIpn } = require("../utils/nowpayments");

const router = express.Router();

function mapDepositRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        provider: row.provider,
        providerPaymentId: row.provider_payment_id,
        providerInvoiceId: row.provider_invoice_id,
        orderId: row.order_id,
        paymentStatus: row.payment_status,
        creditedAt: row.credited_at,
        amount: Number(row.price_amount || 0),
        currency: row.price_currency || DEFAULT_PRICE_CURRENCY.toUpperCase(),
        payAmount: row.pay_amount != null ? Number(row.pay_amount) : null,
        payCurrency: row.pay_currency || DEFAULT_PAY_CURRENCY,
        payAddress: row.pay_address || "",
        payinExtraId: row.payin_extra_id || null,
        network: row.pay_currency || DEFAULT_PAY_CURRENCY,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

async function ensureWalletForUser(conn, userId) {
    const [rows] = await conn.query(
        "SELECT id, balance, currency FROM wallets WHERE user_id = ? LIMIT 1 FOR UPDATE",
        [userId]
    );

    if (rows.length) {
        return {
            id: rows[0].id,
            balance: Number(rows[0].balance || 0),
            currency: rows[0].currency || "COP",
        };
    }

    const [[userRow]] = await conn.query(
        "SELECT currency FROM users WHERE id = ? LIMIT 1",
        [userId]
    );
    const currency = String(userRow?.currency || "COP").toUpperCase();

    const [ins] = await conn.query(
        "INSERT INTO wallets (user_id, balance, currency) VALUES (?, 0.00, ?)",
        [userId, currency]
    );

    return { id: ins.insertId, balance: 0, currency };
}

router.post("/payments/nowpayments/create", requireAuth, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const userId = req.user.id;
        const amount = Number(req.body?.amount || 0);

        const [[userRow]] = await conn.query(
            "SELECT currency FROM users WHERE id = ? LIMIT 1",
            [userId]
        );
        const userCurrency = String(userRow?.currency || "").toUpperCase();

        if (userCurrency !== "USD") {
            return res.status(400).json({ message: "Las recargas por crypto solo están habilitadas para usuarios con moneda USD." });
        }

        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ message: "El monto debe ser mayor a 0." });
        }

        if (amount < 1) {
            return res.status(400).json({ message: "La recarga mínima es de 1 USDT." });
        }

        if (amount > 5000) {
            return res.status(400).json({ message: "La recarga máxima por operación es de 5.000 USDT." });
        }

        await conn.beginTransaction();

        const { request, response } = await createNowPaymentsPayment({
            userId,
            amount,
            priceCurrency: DEFAULT_PRICE_CURRENCY,
            payCurrency: DEFAULT_PAY_CURRENCY,
        });

        const [ins] = await conn.query(
            `INSERT INTO crypto_payment_requests
                (user_id, provider, provider_payment_id, provider_invoice_id, order_id,
                 payment_status, price_amount, price_currency, pay_amount, pay_currency,
                 pay_address, payin_extra_id, provider_payload_json)
             VALUES (?, 'nowpayments', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                response.payment_id || null,
                response.invoice_id || null,
                request.order_id,
                response.payment_status || "waiting",
                Number(response.price_amount ?? request.price_amount ?? amount),
                "USDT",
                response.pay_amount != null ? Number(response.pay_amount) : null,
                String(response.pay_currency || request.pay_currency || DEFAULT_PAY_CURRENCY).toLowerCase(),
                response.pay_address || null,
                response.payin_extra_id || null,
                JSON.stringify(response),
            ]
        );

        await conn.commit();

        return res.json({
            ok: true,
            deposit: mapDepositRow({
                id: ins.insertId,
                provider: "nowpayments",
                provider_payment_id: response.payment_id || null,
                provider_invoice_id: response.invoice_id || null,
                order_id: request.order_id,
                payment_status: response.payment_status || "waiting",
                credited_at: null,
                price_amount: Number(response.price_amount ?? request.price_amount ?? amount),
                price_currency: "USD",
                pay_amount: response.pay_amount != null ? Number(response.pay_amount) : null,
                pay_currency: String(response.pay_currency || request.pay_currency || DEFAULT_PAY_CURRENCY).toLowerCase(),
                pay_address: response.pay_address || "",
                payin_extra_id: response.payin_extra_id || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }),
            webhookUrl: WEBHOOK_URL,
        });
    } catch (err) {
        try { await conn.rollback(); } catch {}
        console.error("Error POST /payments/nowpayments/create:", err?.response?.data || err);
        return res.status(err?.status || err?.response?.status || 500).json({
            message: err?.response?.data?.message || err?.message || "No se pudo crear la recarga crypto.",
        });
    } finally {
        conn.release();
    }
});

router.get("/payments/nowpayments/latest", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.query(
            `SELECT *
             FROM crypto_payment_requests
             WHERE user_id = ? AND provider = 'nowpayments'
             ORDER BY id DESC
             LIMIT 1`,
            [userId]
        );
        return res.json({ ok: true, deposit: mapDepositRow(rows[0] || null) });
    } catch (err) {
        console.error("Error GET /payments/nowpayments/latest:", err);
        return res.status(500).json({ message: "No se pudo cargar la última recarga." });
    }
});

router.get("/payments/nowpayments/:id", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const depositId = Number(req.params.id);
        if (!Number.isFinite(depositId) || depositId <= 0) {
            return res.status(400).json({ message: "ID inválido." });
        }

        const [rows] = await pool.query(
            `SELECT *
             FROM crypto_payment_requests
             WHERE id = ? AND user_id = ?
             LIMIT 1`,
            [depositId, userId]
        );
        if (!rows.length) {
            return res.status(404).json({ message: "Recarga no encontrada." });
        }

        const row = rows[0];
        if (row.provider_payment_id && !row.credited_at && !["finished", "failed", "expired"].includes(String(row.payment_status || "").toLowerCase())) {
            try {
                const status = await fetchNowPaymentsStatus(row.provider_payment_id);
                await pool.query(
                    `UPDATE crypto_payment_requests
                     SET payment_status = ?, pay_amount = COALESCE(?, pay_amount),
                         pay_address = COALESCE(?, pay_address),
                         payin_extra_id = COALESCE(?, payin_extra_id),
                         provider_payload_json = ?
                     WHERE id = ?`,
                    [
                        status.payment_status || row.payment_status,
                        status.pay_amount != null ? Number(status.pay_amount) : null,
                        status.pay_address || null,
                        status.payin_extra_id || null,
                        JSON.stringify(status),
                        depositId,
                    ]
                );
                const [freshRows] = await pool.query("SELECT * FROM crypto_payment_requests WHERE id = ? LIMIT 1", [depositId]);
                return res.json({ ok: true, deposit: mapDepositRow(freshRows[0]) });
            } catch (err) {
                console.error("Error refreshing NOWPayments status:", err?.response?.data || err);
            }
        }

        return res.json({ ok: true, deposit: mapDepositRow(row) });
    } catch (err) {
        console.error("Error GET /payments/nowpayments/:id:", err);
        return res.status(500).json({ message: "No se pudo consultar la recarga." });
    }
});

router.post("/payments/nowpayments/webhook", async (req, res) => {
    try {
        const signature = req.headers["x-nowpayments-sig"];
        const payload = req.body || {};
        const secret = String(process.env.NOWPAYMENTS_IPN_SECRET || "").trim();

        if (!verifyNowPaymentsIpn({ payload, signature, secret })) {
            return res.status(401).json({ ok: false, message: "Firma inválida." });
        }

        const providerPaymentId = Number(payload.payment_id || 0) || null;
        const orderId = String(payload.order_id || "").trim() || null;
        const normalizedStatus = String(payload.payment_status || "").trim().toLowerCase();

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            let depositRow = null;
            if (providerPaymentId) {
                const [rows] = await conn.query(
                    "SELECT * FROM crypto_payment_requests WHERE provider = 'nowpayments' AND provider_payment_id = ? LIMIT 1 FOR UPDATE",
                    [providerPaymentId]
                );
                depositRow = rows[0] || null;
            }

            if (!depositRow && orderId) {
                const [rows] = await conn.query(
                    "SELECT * FROM crypto_payment_requests WHERE provider = 'nowpayments' AND order_id = ? LIMIT 1 FOR UPDATE",
                    [orderId]
                );
                depositRow = rows[0] || null;
            }

            if (!depositRow) {
                await conn.rollback();
                conn.release();
                return res.status(404).json({ ok: false, message: "Pago no reconocido." });
            }

            await conn.query(
                `UPDATE crypto_payment_requests
                 SET provider_payment_id = COALESCE(?, provider_payment_id),
                     provider_invoice_id = COALESCE(?, provider_invoice_id),
                     payment_status = ?,
                     price_amount = COALESCE(?, price_amount),
                     price_currency = COALESCE(?, price_currency),
                     pay_amount = COALESCE(?, pay_amount),
                     pay_currency = COALESCE(?, pay_currency),
                     pay_address = COALESCE(?, pay_address),
                     payin_extra_id = COALESCE(?, payin_extra_id),
                     provider_payload_json = ?
                 WHERE id = ?`,
                [
                    providerPaymentId,
                    payload.invoice_id || null,
                    normalizedStatus || depositRow.payment_status,
                    payload.price_amount != null ? Number(payload.price_amount) : null,
                    depositRow.price_currency || "USD",
                    payload.pay_amount != null ? Number(payload.pay_amount) : null,
                    payload.pay_currency ? String(payload.pay_currency).toLowerCase() : null,
                    payload.pay_address || null,
                    payload.payin_extra_id || null,
                    JSON.stringify(payload),
                    depositRow.id,
                ]
            );

            if (normalizedStatus === "finished" && !depositRow.credited_at) {
                const wallet = await ensureWalletForUser(conn, depositRow.user_id);
                if (String(wallet.currency || "").toUpperCase() !== "USD") {
                    const err = new Error("La wallet del usuario no está en USD.");
                    err.status = 400;
                    throw err;
                }
                const amount = Number(payload.price_amount ?? depositRow.price_amount ?? 0);
                const newBalance = wallet.balance + amount;

                await conn.query("UPDATE wallets SET balance = ? WHERE id = ?", [newBalance, wallet.id]);
                await conn.query(
                    `INSERT INTO wallet_transactions
                        (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
                     VALUES (?, 'topup', ?, ?, 'crypto_deposit', ?, ?)`,
                    [
                        wallet.id,
                        amount,
                        newBalance,
                        depositRow.id,
                        `Recarga crypto NOWPayments ${providerPaymentId || orderId || ""}`.trim(),
                    ]
                );
                await conn.query(
                    `UPDATE crypto_payment_requests
                     SET credited_at = UTC_TIMESTAMP(),
                         wallet_id = ?,
                         balance_before = ?,
                         balance_after = ?
                     WHERE id = ?`,
                    [wallet.id, wallet.balance, newBalance, depositRow.id]
                );
            }

            await conn.commit();
            conn.release();
            return res.json({ ok: true });
        } catch (err) {
            try { await conn.rollback(); } catch {}
            conn.release();
            throw err;
        }
    } catch (err) {
        console.error("Error POST /payments/nowpayments/webhook:", err);
        return res.status(500).json({ ok: false, message: "Error procesando webhook." });
    }
});

module.exports = router;
