const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { createCodeLogger } = require("../services/codeDeliveryLogger");
const { requestCodeForOrder } = require("../services/codesService");
const { finishCodeRequestReservation } = require("../services/codeRequestReservation.service");

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

    let result = null;
    try {
        if (!orderNumber || !String(orderNumber).trim()) {
            await saveLog({ status: "error", message: "Falta orderNumber" });
            return res.status(400).json({ ok: false, message: "Falta orderNumber" });
        }

        result = await requestCodeForOrder({
            orderNumber,
            platformSlug,
            user: req.user,
            action, // "code" | "approve"
        });

        // 👉 log según resultado (mantiene tu misma info)
        if (!result?.meta?.sub) {
            await saveLog({ status: "subscription_missing", message: "Suscripción no encontrada" });
            return res.status(result.http || 404).json(result.body);
        }

        const sub = result.meta.sub;
        const buyerEmail = String(sub.userEmail || "").toLowerCase();
        const soldAccountEmail = String(sub.accountEmail || "").toLowerCase();
        const fingerprint = result.meta.fingerprint || null;

        // log “base” común
        const baseLog = {
            platform_slug: String(result.body?.platform || platformSlug || "").trim().toLowerCase(),
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
            await finishCodeRequestReservation(result.meta?.reservation, "failed");
            return res.status(result.http).json(result.body);
        }

        const normalizedAction = ["temporary", "approve"].includes(String(action || "").toLowerCase())
            ? String(action).toLowerCase()
            : "code";

        const deliveredMessage = normalizedAction === "approve"
            ? "OK:approve-confirmed"
            : `OK:${normalizedAction}`;

        await saveLog({
            ...baseLog,
            delivered_code: result.body.code,
            status: "delivered",
            message: deliveredMessage,
        });
        await finishCodeRequestReservation(result.meta?.reservation, "completed");

        return res.json(result.body);
    } catch (err) {
        await saveLog({ status: "error", message: err.message || "Error interno" });
        await finishCodeRequestReservation(result?.meta?.reservation, "failed");
        console.error(err);
        const detail = process.env.NODE_ENV !== "production" ? err.message : undefined;
        return res.status(500).json({ ok: false, message: "Error interno", ...(detail ? { detail } : {}) });
    }
});

if (process.env.NODE_ENV !== "production") {
    router.get("/test-v3", (req, res) => {
        res.json({ ok: true, message: "Router de códigos V3 montado correctamente" });
    });
}

module.exports = router;
