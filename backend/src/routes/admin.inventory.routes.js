const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const {
    getInventory,
    exportInventoryCsv,
    patchInventory,
} = require("../services/inventory.service");

const router = express.Router();

router.get("/admin/inventory", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const data = await getInventory(req.query || {});
        return res.json(data);
    } catch (e) {
        return res.status(500).json({ message: "Error interno." });
    }
});

router.get("/admin/inventory/export", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { filename, csv } = await exportInventoryCsv(req.query || {});
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.send(csv);
    } catch (e) {
        return res.status(500).json({ message: "Error exportando CSV." });
    }
});

router.patch("/admin/inventory/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const out = await patchInventory(req.params.id, req.body || {});
        return res.json(out);
    } catch (e) {
        const status = e.status || 500;
        return res.status(status).json({ message: e.message || "Error interno." });
    }
});

module.exports = router;
