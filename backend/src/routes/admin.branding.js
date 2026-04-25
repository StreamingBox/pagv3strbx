const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

function hasAllowedImageSignature(mime, buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
    if (mime === "image/png") {
        return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    }
    if (mime === "image/jpeg") {
        return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    }
    if (mime === "image/webp") {
        return buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
    }
    return false;
}

router.post("/admin/branding/logo", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const { dataUrl } = req.body || {};
        if (!dataUrl || typeof dataUrl !== "string") {
            return res.status(400).json({ message: "Falta dataUrl." });
        }

        const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
        if (!match) return res.status(400).json({ message: "Formato invalido (dataUrl)." });

        const mime = match[1];
        const b64 = match[2];

        const allowed = ["image/png", "image/jpeg", "image/webp"];
        if (!allowed.includes(mime)) {
            return res.status(400).json({ message: "Formato no permitido. Usa PNG/JPG/WEBP." });
        }

        const buf = Buffer.from(b64, "base64");
        if (!hasAllowedImageSignature(mime, buf)) {
            return res.status(400).json({ message: "El archivo no coincide con un PNG, JPG o WEBP valido." });
        }

        if (buf.length > 3_000_000) {
            return res.status(400).json({ message: "Logo muy pesado. Max 3MB." });
        }

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
        return res.status(500).json({ message: "Error guardando logo." });
    }
});

module.exports = router;
