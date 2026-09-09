const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { getInventoryAudit } = require("../services/inventoryAudit.service");

const router = express.Router();

router.get("/admin/inventory-audit", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        let rules;
        try {
            rules = JSON.parse(String(req.query?.rules || ""));
        } catch {
            return res.status(400).json({ message: "Las referencias de perfiles no son validas." });
        }
        return res.json(await getInventoryAudit(rules));
    } catch (error) {
        const status = Number(error?.status || 500);
        return res.status(status).json({ message: status >= 500 ? "No se pudo ejecutar la auditoria." : error.message });
    }
});

module.exports = router;
