const express = require("express");

const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const {
    createManualActivation,
    DEFAULT_SETTINGS,
    getPromotionStatus,
    getRechargeBonusSettings,
    saveRechargeBonusSettings,
} = require("../services/rechargeBonus.service");

const router = express.Router();

router.get("/wallet/recharge-promotion", requireAuth, async (_req, res) => {
    try {
        const settings = await getRechargeBonusSettings();
        return res.json({ ok: true, promotion: getPromotionStatus(new Date(), settings) });
    } catch (error) {
        console.error("Error GET /wallet/recharge-promotion:", error?.message || error);
        return res.status(500).json({ message: "No se pudo consultar la promoción de recargas." });
    }
});

router.get("/admin/recharge-promotion", requireAuth, requireRole("admin"), async (_req, res) => {
    try {
        const settings = await getRechargeBonusSettings();
        return res.json({
            ok: true,
            settings,
            status: getPromotionStatus(new Date(), settings),
        });
    } catch (error) {
        console.error("Error GET /admin/recharge-promotion:", error?.message || error);
        return res.status(500).json({ message: "No se pudo cargar la promoción de recargas." });
    }
});

router.put("/admin/recharge-promotion", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const action = String(body.manualAction || "").trim().toLowerCase();
        const hasSaturdaySetting = Object.hasOwn(body, "saturdayEnabled");
        if (!hasSaturdaySetting && !action) {
            return res.status(400).json({ message: "Indica qué ajuste de la promoción quieres cambiar." });
        }
        if (hasSaturdaySetting && typeof body.saturdayEnabled !== "boolean") {
            return res.status(400).json({ message: "La programación de sábados debe ser un valor booleano." });
        }
        if (action && !["activate_today", "deactivate"].includes(action)) {
            return res.status(400).json({ message: "Acción manual no válida." });
        }

        const current = await getRechargeBonusSettings();
        const next = { ...DEFAULT_SETTINGS, ...current };
        if (hasSaturdaySetting) next.saturdayEnabled = body.saturdayEnabled;
        if (action === "activate_today") Object.assign(next, createManualActivation(new Date()));
        if (action === "deactivate") {
            next.manualStartsAt = null;
            next.manualEndsAt = null;
        }

        const settings = await saveRechargeBonusSettings(next);
        return res.json({ ok: true, settings, status: getPromotionStatus(new Date(), settings) });
    } catch (error) {
        console.error("Error PUT /admin/recharge-promotion:", error?.message || error);
        return res.status(500).json({ message: "No se pudo guardar la promoción de recargas." });
    }
});

module.exports = router;
