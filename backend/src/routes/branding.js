const express = require("express");
const pool = require("../db");
const router = express.Router();

// GET /branding/logo (público)
router.get("/branding/logo", async (_req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT mime_type, data FROM branding_assets WHERE asset_key='logo' LIMIT 1"
        );

        if (!rows.length) return res.status(404).send("No logo");

        res.setHeader("Content-Type", rows[0].mime_type);
        res.setHeader("Cache-Control", "no-store"); // para que no se quede pegado
        return res.send(rows[0].data);
    } catch (e) {
        return res.status(500).send("Error");
    }
});

module.exports = router;
