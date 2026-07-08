const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const {
    getCodeResetSnapshot,
    resetCodeCounter,
} = require("../services/codeResetService");

const router = express.Router();

router.get("/admin/code-resets/:orderNumber", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const result = await getCodeResetSnapshot(req.params.orderNumber);
        if (!result.ok) {
            return res.status(result.http || 400).json({ ok: false, message: result.message });
        }
        return res.json(result);
    } catch (err) {
        console.error("[admin.codeResets] lookup failed", err);
        return res.status(500).json({ ok: false, message: "Error consultando el pedido." });
    }
});

router.post("/admin/code-resets", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const result = await resetCodeCounter({
            orderNumber: req.body?.orderNumber,
            note: req.body?.note,
            adminUserId: req.user?.id,
            requesterIp: req.ip,
            userAgent: req.headers["user-agent"] || null,
        });
        if (!result.ok) {
            return res.status(result.http || 400).json({ ok: false, message: result.message });
        }
        return res.json(result);
    } catch (err) {
        console.error("[admin.codeResets] reset failed", err);
        return res.status(500).json({ ok: false, message: "Error reiniciando el contador." });
    }
});

module.exports = router;
