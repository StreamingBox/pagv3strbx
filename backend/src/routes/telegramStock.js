const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { getStockSummary } = require("../services/stockSummary.service");

const router = express.Router();

const stockApiRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: "Demasiadas consultas de stock. Intenta nuevamente en un minuto." },
});

function readStockApiToken(req) {
    const authorization = String(req.get("authorization") || "").trim();
    if (authorization.toLowerCase().startsWith("bearer ")) {
        return authorization.slice(7).trim();
    }
    return String(req.get("x-telegram-stock-token") || "").trim();
}

function timingSafeTokenEquals(actual, expected) {
    const a = Buffer.from(String(actual || ""));
    const b = Buffer.from(String(expected || ""));
    if (!a.length || !b.length || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function requireTelegramStockToken(req, res, next) {
    const expected = String(process.env.TELEGRAM_STOCK_API_TOKEN || "").trim();
    if (!expected) {
        return res.status(503).json({
            ok: false,
            message: "API de stock de Telegram no configurada: falta TELEGRAM_STOCK_API_TOKEN.",
        });
    }

    if (!timingSafeTokenEquals(readStockApiToken(req), expected)) {
        return res.status(401).json({ ok: false, message: "Token de la API de stock invalido." });
    }

    return next();
}

router.get(
    "/integrations/telegram/stock",
    stockApiRateLimit,
    requireTelegramStockToken,
    async (_req, res) => {
        try {
            const items = await getStockSummary();
            const totalAvailable = items.reduce((sum, item) => sum + item.available, 0);

            return res.json({
                ok: true,
                generatedAt: new Date().toISOString(),
                totalAvailable,
                items,
            });
        } catch (error) {
            console.error("[telegram-stock-api] stock error:", error);
            return res.status(500).json({
                ok: false,
                message: "No fue posible consultar el stock.",
            });
        }
    }
);

module.exports = router;
module.exports.__testing = {
    readStockApiToken,
    timingSafeTokenEquals,
    requireTelegramStockToken,
};
