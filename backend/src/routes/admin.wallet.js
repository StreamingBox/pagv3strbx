const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { normalizeCurrency, sameCurrency } = require("../utils/currency");
const { resolveDeliveredAccountId } = require("../services/transactionDelivery.service");

const router = express.Router();

router.post("/admin/wallet/topup", requireAuth, requireRole("admin"), async (req, res) => {
    const { userId, amount, note } = req.body || {};
    if (!userId || amount === undefined) {
        return res.status(400).json({ message: "userId y amount son obligatorios." });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[userRow]] = await conn.query(
            "SELECT currency FROM users WHERE id = ? LIMIT 1",
            [userId]
        );
        if (!userRow) {
            await conn.rollback();
            return res.status(404).json({ message: "Usuario no encontrado." });
        }
        const targetCurrency = normalizeCurrency(userRow?.currency || "COP", "COP");

        const [wrows] = await conn.query(
            "SELECT id, balance, currency FROM wallets WHERE user_id = ? FOR UPDATE",
            [userId]
        );

        let walletId, balance, currency;
        if (!wrows.length) {
            const [ins] = await conn.query(
                "INSERT INTO wallets (user_id, balance, currency) VALUES (?, 0.00, ?)",
                [userId, targetCurrency]
            );
            walletId = ins.insertId;
            balance = 0;
            currency = targetCurrency;
        } else {
            walletId = wrows[0].id;
            balance = Number(wrows[0].balance);
            currency = normalizeCurrency(wrows[0].currency || targetCurrency, targetCurrency);
            if (!sameCurrency(currency, targetCurrency)) {
                await conn.rollback();
                return res.status(409).json({
                    message: `La wallet esta en ${currency} y el usuario en ${targetCurrency}. Corrige la moneda desde Usuarios antes de recargar.`,
                });
            }
        }

        const amt = Number(amount);
        if (!Number.isFinite(amt) || Math.abs(amt) > 10000000) {
            await conn.rollback();
            return res.status(400).json({ message: "Monto inválido o fuera de rango." });
        }
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
        if (conn) await conn.rollback();
        console.error("API Error at " + req.originalUrl + ":", err.message);
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
            await conn.rollback();
            return res.status(404).json({ message: "Wallet no encontrada." });
        }

        const walletId = wrows[0].id;
        const profitTotal = Number(wrows[0].profit_total);
        const amt = Number(amount);
        if (!Number.isFinite(amt) || Math.abs(amt) > 10000000) {
            await conn.rollback();
            return res.status(400).json({ message: "Monto inválido o fuera de rango." });
        }
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
        if (conn) await conn.rollback();
        console.error("API Error at " + req.originalUrl + ":", err.message);
        return res.status(500).json({ message: "Error interno." });
    } finally {
        conn.release();
    }
});

router.post("/admin/wallet/adjust-invested", requireAuth, requireRole("admin"), async (req, res) => {
    const { userId, amount, note } = req.body || {};
    if (!userId || amount === undefined) {
        return res.status(400).json({ message: "userId y amount son obligatorios." });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [wrows] = await conn.query(
            "SELECT id FROM wallets WHERE user_id = ? FOR UPDATE",
            [userId]
        );

        if (!wrows.length) {
            await conn.rollback();
            return res.status(404).json({ message: "Wallet no encontrada." });
        }

        const walletId = wrows[0].id;
        const amt = Number(amount);
        if (!Number.isFinite(amt) || Math.abs(amt) > 10000000) {
            await conn.rollback();
            return res.status(400).json({ message: "Monto inválido o fuera de rango." });
        }

        await conn.query(
            `INSERT INTO wallet_transactions
        (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
       VALUES (?, 'invest_adj', ?, 0, 'admin_invest_adj', NULL, ?)`,
            [walletId, amt, note || "Ajuste de inversión admin"]
        );

        await conn.commit();
        return res.json({ ok: true });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error("API Error at " + req.originalUrl + ":", err.message);
        return res.status(500).json({ message: "Error interno." });
    } finally {
        conn.release();
    }
});

// Obtener todas las transacciones globales (con filtro de usuario, tipo, búsqueda y fechas)
router.get("/admin/wallet/transactions", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { page = 1, limit = 10, type, userId, q, dateFrom, dateTo } = req.query;
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 200);
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

        // Búsqueda general: email, nota, o ID de referencia
        if (q) {
            const qLike = `%${String(q).trim()}%`;
            whereClauses.push("(u.email LIKE ? OR t.note LIKE ? OR CAST(t.reference_id AS CHAR) LIKE ?)");
            queryParams.push(qLike, qLike, qLike);
        }

        // Filtro de fechas — Colombia (UTC-5): inicio del día desde / fin del día hasta
        if (dateFrom) {
            // dateFrom = "YYYY-MM-DD" en hora Colombia → convertir a UTC sumando 5h
            whereClauses.push("t.created_at >= DATE_ADD(?, INTERVAL 5 HOUR)");
            queryParams.push(`${dateFrom} 00:00:00`);
        }
        if (dateTo) {
            // dateTo = "YYYY-MM-DD" en hora Colombia → fin del día 23:59:59 + 5h offset
            whereClauses.push("t.created_at <= DATE_ADD(?, INTERVAL 5 HOUR)");
            queryParams.push(`${dateTo} 23:59:59`);
        }

        const whereStr = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

        const countQuery = `
            SELECT COUNT(*) as total 
            FROM wallet_transactions t
            JOIN wallets w ON t.wallet_id = w.id
            JOIN users u ON w.user_id = u.id
            ${whereStr}
        `;
        const [countRows] = await pool.query(countQuery, queryParams);
        const total = countRows[0].total;

        // JOIN correcto: transacciones de tipo 'order' apuntan a orders.id
        const dataQuery = `
            SELECT 
                t.*,
                w.user_id, 
                u.email AS user_email,
                (
                    SELECT p.name 
                    FROM order_items oi
                    JOIN platforms p ON p.id = oi.platform_id
                    WHERE oi.order_id = t.reference_id
                      AND t.reference_type = 'order'
                    LIMIT 1
                ) AS product_name,
                (
                    SELECT d.name 
                    FROM order_items oi
                    JOIN platform_prices pp ON pp.id = oi.platform_price_id
                    JOIN durations d ON d.id = pp.duration_id
                    WHERE oi.order_id = t.reference_id
                      AND t.reference_type = 'order'
                    LIMIT 1
                ) AS duration_name,
                (
                    SELECT COUNT(*) 
                    FROM order_items oi2
                    WHERE oi2.order_id = t.reference_id
                      AND t.reference_type = 'order'
                ) AS item_count
            FROM wallet_transactions t
            JOIN wallets w ON t.wallet_id = w.id
            JOIN users u ON w.user_id = u.id
            ${whereStr}
            ORDER BY t.created_at DESC, t.id DESC
            LIMIT ? OFFSET ?
        `;
        const [rows] = await pool.query(dataQuery, [...queryParams, limitNum, offset]);

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

router.get("/admin/wallet/transactions/:transactionId/delivered-accounts", requireAuth, requireRole("admin"), async (req, res) => {
    const transactionId = Number(req.params.transactionId);
    if (!Number.isInteger(transactionId) || transactionId <= 0) {
        return res.status(400).json({ message: "ID de transacción inválido." });
    }

    try {
        const [transactionRows] = await pool.query(
            `SELECT t.type, t.reference_type, t.reference_id, o.created_at AS order_created_at
               FROM wallet_transactions t
               LEFT JOIN orders o ON t.reference_type = 'order' AND o.id = t.reference_id
              WHERE t.id = ?
              LIMIT 1`,
            [transactionId]
        );
        const transaction = transactionRows[0];
        if (!transaction) return res.status(404).json({ message: "Transacción no encontrada." });
        if (transaction.type !== "purchase" || transaction.reference_type !== "order"
            || !transaction.reference_id || !transaction.order_created_at) {
            return res.json({ items: [] });
        }

        const orderId = Number(transaction.reference_id);
        const [items] = await pool.query(
            `SELECT oi.id AS item_id, s.id AS subscription_id, s.platform_account_id AS current_account_id,
                    s.event_link_url, s.event_link_title, s.expires_at,
                    p.name AS platform_name, d.name AS duration_name
               FROM order_items oi
               JOIN subscriptions s ON s.id = oi.subscription_id
               JOIN platforms p ON p.id = oi.platform_id
               LEFT JOIN durations d ON d.id = s.duration_id
              WHERE oi.order_id = ?
              ORDER BY oi.id`,
            [orderId]
        );
        if (!items.length) return res.json({ items: [] });

        const subscriptionIds = [...new Set(items.map((item) => Number(item.subscription_id)))];
        const placeholders = subscriptionIds.map(() => "?").join(",");
        const [historyRows] = await pool.query(
            `SELECT 'replacement' AS source, subscription_id, order_id, NULL AS renewal_order_id,
                    old_account_id, new_account_id, created_at, id
               FROM account_replacement_logs
              WHERE subscription_id IN (${placeholders})
             UNION ALL
             SELECT 'renewal' AS source, subscription_id, NULL AS order_id, renewal_order_id,
                    previous_account_id AS old_account_id, new_account_id, created_at, id
               FROM subscription_renewal_logs
              WHERE subscription_id IN (${placeholders})`,
            [...subscriptionIds, ...subscriptionIds]
        );
        const historyBySubscription = new Map();
        for (const event of historyRows) {
            const key = Number(event.subscription_id);
            const history = historyBySubscription.get(key) || [];
            history.push(event);
            historyBySubscription.set(key, history);
        }

        const resolvedItems = items.map((item) => {
            const deliveredAccountId = resolveDeliveredAccountId(
                item.current_account_id,
                transaction.order_created_at,
                historyBySubscription.get(Number(item.subscription_id)) || [],
                orderId,
            );
            return { ...item, delivered_account_id: deliveredAccountId };
        });
        const accountIds = [...new Set(resolvedItems.flatMap((item) => [item.delivered_account_id, item.current_account_id])
            .map(Number).filter((id) => Number.isInteger(id) && id > 0))];
        const accountById = new Map();

        if (accountIds.length) {
            const accountPlaceholders = accountIds.map(() => "?").join(",");
            const [accountRows] = await pool.query(
                `SELECT pa.id, pa.platform_id, p.name AS platform_name, pa.email, pa.password,
                        pa.access_url, pa.pin, pa.two_factor_secret, pa.profile_number
                   FROM platform_accounts pa
                   LEFT JOIN platforms p ON p.id = pa.platform_id
                  WHERE pa.id IN (${accountPlaceholders})`,
                accountIds
            );
            for (const account of accountRows) accountById.set(Number(account.id), account);
        }

        return res.json({
            items: resolvedItems.map((item) => ({
                itemId: item.item_id,
                subscriptionId: item.subscription_id,
                platformName: item.platform_name,
                durationName: item.duration_name,
                expiresAt: item.expires_at,
                eventLinkTitle: item.event_link_title,
                eventLinkUrl: item.event_link_url,
                deliveredAccount: accountById.get(Number(item.delivered_account_id)) || null,
                currentAccount: Number(item.current_account_id) !== Number(item.delivered_account_id)
                    ? accountById.get(Number(item.current_account_id)) || null
                    : null,
            })),
        });
    } catch (error) {
        console.error("Error GET /admin/wallet/transactions/:transactionId/delivered-accounts:", error);
        return res.status(500).json({ message: "No se pudieron cargar los datos entregados." });
    }
});

router.get("/admin/wallet/transactions/:userId", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const userId = req.params.userId;
        const { page = 1, limit = 10, type } = req.query;
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 200); // ✅ cota máxima
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
             LIMIT ? OFFSET ?`,
            [...queryParams, limitNum, offset] // ✅ parámetros en lugar de interpolación
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

// Resetear inversión total de un usuario (sin tocar el saldo)
router.delete("/admin/wallet/investment/:userId", requireAuth, requireRole("admin"), async (req, res) => {
    const { userId } = req.params;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [wrows] = await conn.query(
            "SELECT id FROM wallets WHERE user_id = ? LIMIT 1",
            [userId]
        );

        if (!wrows.length) {
            await conn.rollback();
            return res.status(404).json({ message: "Wallet no encontrada." });
        }

        const walletId = wrows[0].id;

        await conn.query("UPDATE wallets SET total_invested = 0 WHERE id = ?", [walletId]);

        await conn.query(
            `INSERT INTO wallet_transactions
            (wallet_id, type, amount, balance_after, reference_type, reference_id, note)
            VALUES (?, 'adjustment', 0, 0, 'admin_invest_reset', NULL, 'Reset inversión total')`,
            [walletId]
        );

        await conn.commit();
        return res.json({ ok: true, total_invested: 0 });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        return res.status(500).json({ message: "Error interno." });
    } finally {
        conn.release();
    }
});

module.exports = router;
