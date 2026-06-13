const express = require("express");
const multer = require("multer");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { savePlatformLogo } = require("../utils/platformLogoStorage");

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter(_req, file, cb) {
        const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
        if (!allowed.has(String(file.mimetype || "").toLowerCase())) {
            return cb(new Error("Solo se permiten imagenes PNG, JPG o WEBP."));
        }
        cb(null, true);
    },
});

function handleLogoUpload(req, res, next) {
    upload.single("logo")(req, res, (err) => {
        if (!err) return next();
        const message = err.code === "LIMIT_FILE_SIZE"
            ? "Logo muy pesado. Maximo 3MB."
            : (err.message || "No se pudo leer el logo.");
        return res.status(400).json({ error: message });
    });
}

router.post("/upload/platform-logo", requireAuth, requireRole("admin"), handleLogoUpload, async (req, res) => {
    try {
        const { slug } = req.body;
        if (!slug) return res.status(400).json({ error: "Falta slug de plataforma" });
        if (!req.file) return res.status(400).json({ error: "Falta archivo logo" });

        const result = savePlatformLogo({ slug, file: req.file });
        return res.json({ ok: true, file: result.file, safeSlug: result.safeSlug });
    } catch (e) {
        console.error("Upload error:", e);
        return res.status(e.status || 500).json({ error: e.message || "Error al subir logo" });
    }
});

module.exports = router;
