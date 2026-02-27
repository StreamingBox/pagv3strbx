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

module.exports = router;
