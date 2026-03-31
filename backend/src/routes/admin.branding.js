const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

// POST /admin/branding/logo (admin)
// body: { dataUrl: "data:image/png;base64,...." }
router.post("/admin/branding/logo", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { dataUrl } = req.body || {};
        if (!dataUrl || typeof dataUrl !== "string") {
            return res.status(400).json({ message: "Falta dataUrl." });
        }

        const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
        if (!match) return res.status(400).json({ message: "Formato inválido (dataUrl)." });

        const mime = match[1];
        const b64 = match[2];

        // Permitir solo imágenes comunes
        const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
        if (!allowed.includes(mime)) {
            return res.status(400).json({ message: "Formato no permitido. Usa PNG/JPG/WEBP/SVG." });
        }

        const buf = Buffer.from(b64, "base64");

        // límite: 3 MB
        if (buf.length > 3_000_000) {
            return res.status(400).json({ message: "Logo muy pesado. Máx 3MB." });
        }

        // Crear tabla si no existe (auto-migración)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS branding_assets (
                asset_key VARCHAR(64) PRIMARY KEY,
                mime_type VARCHAR(64) NOT NULL,
                data MEDIUMBLOB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await pool.query(
            `INSERT INTO branding_assets (asset_key, mime_type, data)
       VALUES ('logo', ?, ?)
       ON DUPLICATE KEY UPDATE mime_type=VALUES(mime_type), data=VALUES(data)`,
            [mime, buf]
        );

        return res.json({ ok: true });
    } catch (e) {
        console.error("[admin.branding] Error guardando logo:", e);
        return res.status(500).json({ message: "Error guardando logo: " + (e?.message || "desconocido") });
    }
});


module.exports = router;
