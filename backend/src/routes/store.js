const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const pool = require("../db");

const { checkoutService } = require("../services/checkoutService");
const { getOrdersHistory, getRenewalsHistory } = require("../services/orderHistoryService");
const { renewSubscription } = require("../services/renewal.service");
const { notifyRenewalSale } = require("../services/telegramBot");

const router = express.Router();

// ✅ Checkout (carrito)
router.post("/checkout", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const combos = Array.isArray(req.body?.combos) ? req.body.combos : [];

        const recordProfit = !!req.body?.recordProfit;
        const profitAmount = Number(req.body?.profitAmount || 0);

        const data = await checkoutService({
            userId,
            items,
            combos,
            recordProfit,
            profitAmount,
        });

        return res.status(201).json(data);
    } catch (err) {
        const status = err?.status || 500;
        const payload = err?.payload || null;

        console.error(err);
        return res.status(status).json({
            message: err?.message || "Error interno en checkout.",
            ...(payload || {}),
        });
    }
});

// ✅ Historial de órdenes
router.get("/orders", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { from, to, platformId, q, page, limit } = req.query;

        const data = await getOrdersHistory({
            userId,
            from,
            to,
            platformId,
            q,
            page,
            limit,
        });

        return res.json(data);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error cargando historial." });
    }
});

router.get("/orders/renewals", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { q, platformId, availability, page, limit } = req.query;

        const data = await getRenewalsHistory({
            userId,
            q,
            platformId,
            availability,
            page,
            limit,
        });

        return res.json(data);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error cargando renovaciones." });
    }
});

// Lista plataformas
router.get("/platforms", requireAuth, async (req, res) => {
    const [rows] = await pool.query(
        "SELECT id, name, slug FROM platforms WHERE is_active = 1 ORDER BY name ASC"
    );
    res.json(rows);
});

// ✅ Vencimientos (User) - Solo las cuentas del usuario (<= 3 días o vencidas)
router.get("/orders/expiring", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.max(1, Number(req.query.limit) || 20);
        const offset = (page - 1) * limit;

        const { q, platform } = req.query;
        const effectiveExpiresSql = "COALESCE(acc.expires_at, s.expires_at)";
        const notResoldLaterSql = `
            NOT EXISTS (
                SELECT 1
                FROM order_items oi_later
                JOIN orders o_later ON o_later.id = oi_later.order_id
                JOIN subscriptions s_later ON s_later.id = oi_later.subscription_id
                JOIN platform_accounts acc_later ON acc_later.id = s_later.platform_account_id
                WHERE s_later.id <> s.id
                  AND s_later.status != 'cancelled'
                  AND (
                    (acc.identity_id IS NOT NULL AND acc_later.identity_id = acc.identity_id)
                    OR (
                      COALESCE(acc.email, '') <> ''
                      AND LOWER(COALESCE(acc_later.email, '')) = LOWER(COALESCE(acc.email, ''))
                      AND COALESCE(CAST(acc_later.profile_number AS CHAR), '') = COALESCE(CAST(acc.profile_number AS CHAR), '')
                      AND (
                        acc_later.platform_id = acc.platform_id
                        OR EXISTS (
                          SELECT 1
                          FROM platform_fallbacks pf
                          WHERE COALESCE(pf.is_active, 1) = 1
                            AND (
                              (pf.source_platform_id = acc.platform_id AND pf.fallback_platform_id = acc_later.platform_id)
                              OR (pf.source_platform_id = acc_later.platform_id AND pf.fallback_platform_id = acc.platform_id)
                            )
                        )
                      )
                    )
                  )
                  AND o_later.created_at > COALESCE((
                    SELECT MAX(o_current.created_at)
                    FROM order_items oi_current
                    JOIN orders o_current ON o_current.id = oi_current.order_id
                    WHERE oi_current.subscription_id = s.id
                  ), '1000-01-01')
            )
        `;

        let whereCols = [
            "s.user_id = ?",
            "s.status != 'cancelled'",
            notResoldLaterSql,
            `${effectiveExpiresSql} <= DATE_ADD(NOW(), INTERVAL 3 DAY)`,
            "IFNULL(s.is_attended, 0) = 0"
        ];
        let params = [userId];

        if (q) {
            whereCols.push("s.id = ?");
            const qStr = String(q).trim().replace(/^ORD-0*/i, "");
            const qNum = Number(qStr) || 0;
            params.push(qNum);
        }

        if (platform) {
            whereCols.push("p.slug = ?");
            params.push(platform);
        }

        const whereSql = "WHERE " + whereCols.join(" AND ");

        const [countRows] = await pool.query(
            `SELECT COUNT(*) as total
             FROM subscriptions s
             JOIN platforms p ON p.id = s.platform_id
             LEFT JOIN platform_accounts acc ON acc.id = s.platform_account_id
             ${whereSql}`,
            params
        );
        const total = countRows[0].total;
        const pages = Math.ceil(total / limit);

        const [rows] = await pool.query(
            `SELECT
               s.id,
               s.platform_id,
               s.platform_account_id,
               s.expires_at AS subscription_expires_at,
               ${effectiveExpiresSql} AS expires_at,
               ${effectiveExpiresSql} AS effective_expires_at,
               s.status,
               p.name AS platform_name,
               p.slug AS platform_slug,
               acc.email AS account_email,
               acc.profile_number,
               s.reminder_sent
             FROM subscriptions s
             JOIN platforms p ON p.id = s.platform_id
             LEFT JOIN platform_accounts acc ON acc.id = s.platform_account_id
             ${whereSql}
             ORDER BY ${effectiveExpiresSql} ASC
             LIMIT ?, ?`,
            [...params, offset, limit]
        );

        return res.json({
            page,
            limit,
            total,
            pages,
            items: rows,
        });

    } catch (err) {
        console.error("Error en GET /orders/expiring:", err);
        return res.status(500).json({ message: "Error cargando vencimientos." });
    }
});

// ✅ Count pending expirations (User)
router.get("/orders/expiring-count", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await pool.query(
            `SELECT COUNT(*) as count
             FROM subscriptions s
             LEFT JOIN platform_accounts acc ON acc.id = s.platform_account_id
             WHERE s.user_id = ?
               AND s.status != 'cancelled'
               AND IFNULL(s.is_attended, 0) = 0
               AND COALESCE(acc.expires_at, s.expires_at) <= DATE_ADD(NOW(), INTERVAL 3 DAY)
               AND NOT EXISTS (
                   SELECT 1
                   FROM order_items oi_later
                   JOIN orders o_later ON o_later.id = oi_later.order_id
                   JOIN subscriptions s_later ON s_later.id = oi_later.subscription_id
                   JOIN platform_accounts acc_later ON acc_later.id = s_later.platform_account_id
                   WHERE s_later.id <> s.id
                     AND s_later.status != 'cancelled'
                     AND (
                       (acc.identity_id IS NOT NULL AND acc_later.identity_id = acc.identity_id)
                       OR (
                         COALESCE(acc.email, '') <> ''
                         AND LOWER(COALESCE(acc_later.email, '')) = LOWER(COALESCE(acc.email, ''))
                         AND COALESCE(CAST(acc_later.profile_number AS CHAR), '') = COALESCE(CAST(acc.profile_number AS CHAR), '')
                         AND (
                           acc_later.platform_id = acc.platform_id
                           OR EXISTS (
                             SELECT 1
                             FROM platform_fallbacks pf
                             WHERE COALESCE(pf.is_active, 1) = 1
                               AND (
                                 (pf.source_platform_id = acc.platform_id AND pf.fallback_platform_id = acc_later.platform_id)
                                 OR (pf.source_platform_id = acc_later.platform_id AND pf.fallback_platform_id = acc.platform_id)
                               )
                           )
                         )
                       )
                     )
                     AND o_later.created_at > COALESCE((
                       SELECT MAX(o_current.created_at)
                       FROM order_items oi_current
                       JOIN orders o_current ON o_current.id = oi_current.order_id
                       WHERE oi_current.subscription_id = s.id
                     ), '1000-01-01')
               )`,
            [userId]
        );
        return res.json({ count: rows[0].count });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error contando vencimientos." });
    }
});

router.post("/orders/:id/renew", requireAuth, async (req, res) => {
    const subscriptionId = Number(req.params.id);

    if (!Number.isFinite(subscriptionId) || subscriptionId <= 0) {
        return res.status(400).json({ message: "ID de suscripción inválido." });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const result = await renewSubscription({
            conn,
            subscriptionId,
            actorUserId: req.user.id,
            actorRole: req.user.role || "user",
            deductWallet: true,
            allowAccountChange: false,
        });

        await conn.commit();

        const [userRows] = await pool.query(
            "SELECT name, email FROM users WHERE id = ? LIMIT 1",
            [result.userId]
        );
        const buyer = userRows?.[0] || null;
        notifyRenewalSale({
            seller: buyer?.name || buyer?.email || `ID ${result.userId}`,
            platform: result.platformName,
            total: result.amountCharged,
            currency: result.currency,
            newBalance: result.newBalance,
            orderCode: result.renewalOrderCode,
        }).catch((e) => console.error("[TelegramBot] notifyRenewalSale error:", e?.message || e));

        return res.json({
            ok: true,
            message: `Se te descontó ${Number(result.deducted || 0).toLocaleString("es-CO")} ${result.currency || ""}`.trim(),
            ...result,
        });
    } catch (err) {
        await conn.rollback();
        console.error("Error en POST /orders/:id/renew:", err);
        return res.status(err?.status || 500).json({ message: err?.message || "Error interno al renovar." });
    } finally {
        conn.release();
    }
});

module.exports = router;
