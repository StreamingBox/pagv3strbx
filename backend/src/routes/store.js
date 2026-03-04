const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const pool = require("../db");

const { checkoutService } = require("../services/checkoutService");
const { getOrdersHistory } = require("../services/orderHistoryService");

const router = express.Router();

// ✅ Checkout (carrito)
router.post("/checkout", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const includeWhatsapp = !!req.body?.includeWhatsapp;
        const items = Array.isArray(req.body?.items) ? req.body.items : [];

        const recordProfit = !!req.body?.recordProfit;
        const profitAmount = Number(req.body?.profitAmount || 0);

        const data = await checkoutService({
            userId,
            includeWhatsapp,
            items,
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

        let whereCols = [
            "s.user_id = ?",
            "s.status != 'cancelled'",
            "s.expires_at <= DATE_ADD(NOW(), INTERVAL 3 DAY)",
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
               s.expires_at,
               s.status,
               p.name AS platform_name,
               p.slug AS platform_slug,
               acc.email AS account_email,
               acc.profile_number
             FROM subscriptions s
             JOIN platforms p ON p.id = s.platform_id
             LEFT JOIN platform_accounts acc ON acc.id = s.platform_account_id
             ${whereSql}
             ORDER BY s.expires_at ASC
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

module.exports = router;
