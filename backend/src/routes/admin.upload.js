const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

function slugifyFilename(str) {
    return String(str)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function hasAllowedImageSignature(file) {
    const buf = file?.buffer;
    if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
    const mime = String(file.mimetype || "").toLowerCase();
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

const upload = multer({
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter(_req, file, cb) {
        const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
        if (!allowed.has(String(file.mimetype || "").toLowerCase())) {
            return cb(new Error("Solo se permiten imagenes PNG, JPG o WEBP."));
        }
        cb(null, true);
    },
});

router.post("/upload/platform-logo", requireAuth, requireRole("admin"), upload.single("logo"), async (req, res) => {
    try {
        const { slug } = req.body;
        if (!slug) return res.status(400).json({ error: "Falta slug de plataforma" });
        if (!req.file) return res.status(400).json({ error: "Falta archivo logo" });
        if (!hasAllowedImageSignature(req.file)) {
            return res.status(400).json({ error: "El archivo no coincide con un PNG, JPG o WEBP valido." });
        }

        const frontEndBase = path.join(__dirname, "../../../frontend");
        const publicDir = path.join(frontEndBase, "public/platform-logos");
        const distDir = path.join(frontEndBase, "dist/platform-logos");

        if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
        if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

        const safeSlug = slugifyFilename(slug);
        if (!safeSlug) return res.status(400).json({ error: "Slug de plataforma invalido" });

        const targetName = `${safeSlug}.png`;
        const publicPath = path.join(publicDir, targetName);
        const distPath = path.join(distDir, targetName);

        fs.writeFileSync(publicPath, req.file.buffer);

        if (fs.existsSync(path.join(frontEndBase, "dist"))) {
            fs.copyFileSync(publicPath, distPath);
        }

        return res.json({ ok: true, file: `/platform-logos/${targetName}`, safeSlug });
    } catch (e) {
        console.error("Upload error:", e);
        return res.status(500).json({ error: "Error al subir logo" });
    }
});

module.exports = router;
