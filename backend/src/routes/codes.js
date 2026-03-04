const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { createCodeLogger } = require("../services/codeDeliveryLogger");
const { requestCodeForOrder } = require("../services/codesService");

const router = express.Router();

/**
 * POST /codes/:platformSlug/request
 * Body: { orderNumber, action }
 */
router.post("/:platformSlug/request", requireAuth, async (req, res) => {
    const { platformSlug } = req.params;
    const { orderNumber, action } = req.body || {};

    // logger depende de orderNumber; si falta, igual crea el logger con NaN (y loguea error)
    const { saveLog, isAdmin, requestedByUserId } = createCodeLogger({
        req,
        orderNumber,
        platformSlug: String(platformSlug || "").trim().toLowerCase(),
    });

    try {
        if (!orderNumber || !String(orderNumber).trim()) {
            await saveLog({ status: "error", message: "Falta orderNumber" });
            return res.status(400).json({ ok: false, message: "Falta orderNumber" });
        }

        const result = await requestCodeForOrder({
            orderNumber,
            platformSlug,
            user: req.user,
            action, // "code" | "approve"
        });

        // 👉 log según resultado (mantiene tu misma info)
        if (!result?.meta?.sub) {
            await saveLog({ status: "not_found", message: "Pedido no encontrado" });
            return res.status(result.http || 404).json(result.body);
        }

        const sub = result.meta.sub;
        const buyerEmail = String(sub.userEmail || "").toLowerCase();
        const soldAccountEmail = String(sub.accountEmail || "").toLowerCase();
        const fingerprint = result.meta.fingerprint || null;

        // log “base” común
        const baseLog = {
            order_email: soldAccountEmail || buyerEmail || "",
            platform_account_id: sub.platformAccountId || null,
            credential_fingerprint: fingerprint,
        };

        if (result.http !== 200) {
            // estados especiales si vienen
            await saveLog({
                ...baseLog,
                status: result.body?.status || "error",
                message: result.body?.message || "Error",
            });
            return res.status(result.http).json(result.body);
        }

        await saveLog({
            ...baseLog,
            delivered_code: result.body.code,
            status: "delivered",
            message: "OK",
        });

        return res.json(result.body);
    } catch (err) {
        await saveLog({ status: "error", message: err.message || "Error interno" });
        console.error(err);
        const detail = process.env.NODE_ENV !== "production" ? err.message : undefined;
        return res.status(500).json({ ok: false, message: "Error interno", ...(detail ? { detail } : {}) });
    }
});

module.exports = router;
