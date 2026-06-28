const crypto = require("crypto");
const express = require("express");
const {
    DEFAULT_NOTIFACE_USER_EMAIL,
    catalogForNotiface,
    sellFromNotiface,
} = require("../services/notifaceSales.service");

const router = express.Router();

function readBearerToken(req) {
    const auth = String(req.get("authorization") || "").trim();
    if (auth.toLowerCase().startsWith("bearer ")) {
        return auth.slice(7).trim();
    }
    return String(req.get("x-notiface-token") || "").trim();
}

function timingSafeTokenEquals(actual, expected) {
    const a = Buffer.from(String(actual || ""));
    const b = Buffer.from(String(expected || ""));
    if (!a.length || !b.length || a.length !== b.length) {
        return false;
    }
    return crypto.timingSafeEqual(a, b);
}

function requireNotifaceToken(req, res, next) {
    const expected = String(process.env.NOTIFACE_INTEGRATION_TOKEN || "").trim();
    if (!expected) {
        return res.status(503).json({
            ok: false,
            message: "Integracion NotiFace no configurada: falta NOTIFACE_INTEGRATION_TOKEN.",
        });
    }

    if (!timingSafeTokenEquals(readBearerToken(req), expected)) {
        return res.status(401).json({ ok: false, message: "Token NotiFace invalido." });
    }

    return next();
}

router.get("/integrations/notiface/health", requireNotifaceToken, async (_req, res) => {
    return res.json({
        ok: true,
        salesUserEmail: process.env.NOTIFACE_SALES_USER_EMAIL || DEFAULT_NOTIFACE_USER_EMAIL,
    });
});

router.get("/integrations/notiface/catalog", requireNotifaceToken, async (req, res) => {
    try {
        const rows = await catalogForNotiface(req.query?.q || "");
        return res.json({ ok: true, items: rows });
    } catch (err) {
        console.error("[notiface] catalog error:", err);
        return res.status(err?.status || 500).json({
            ok: false,
            message: err?.message || "Error consultando catalogo NotiFace.",
        });
    }
});

router.post("/integrations/notiface/sell", requireNotifaceToken, async (req, res) => {
    try {
        const body = req.body || {};
        const data = await sellFromNotiface({
            platformAlias: body.platformAlias || body.platform || body.product,
            platformPriceId: body.platformPriceId,
            durationDays: body.durationDays,
            conversationCode: body.conversationCode,
            face: body.face,
            buyerName: body.buyerName,
            listingName: body.listingName,
            currency: body.currency,
        });

        return res.status(201).json(data);
    } catch (err) {
        console.error("[notiface] sell error:", err);
        return res.status(err?.status || 500).json({
            ok: false,
            message: err?.message || "Error procesando venta NotiFace.",
            ...(err?.payload || {}),
        });
    }
});

module.exports = router;
