const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();

// Normaliza el slug a un nombre de archivo seguro (sin espacios ni caracteres especiales)
function slugifyFilename(str) {
    return String(str)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")  // quita tildes
        .replace(/[^a-z0-9]+/g, "-")      // reemplaza cualquier caracter no alfanumérico por guión
        .replace(/^-|-$/g, "");            // quita guiones al inicio/fin
}

const upload = multer({
    limits: { fileSize: 3 * 1024 * 1024 }, // 3MB limit
    fileFilter(req, file, cb) {
        if (!file.mimetype.startsWith("image/")) {
            return cb(new Error("Solo se permiten imágenes"));
        }
        cb(null, true);
    }
});

// POST /api/upload/platform-logo
router.post("/upload/platform-logo", requireAuth, requireRole("admin"), upload.single("logo"), async (req, res) => {
    try {
        const { slug } = req.body;
        if (!slug) return res.status(400).json({ error: "Falta slug de plataforma" });
        if (!req.file) return res.status(400).json({ error: "Falta archivo logo" });

        const frontEndBase = path.join(__dirname, "../../../frontend");
        const publicDir = path.join(frontEndBase, "public/platform-logos");
        const distDir = path.join(frontEndBase, "dist/platform-logos");

        // Crea los directorios si no existen
        if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
        if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

        // Normaliza el slug para evitar espacios y caracteres especiales en el nombre de archivo
        const safeSlug = slugifyFilename(slug);
        const targetName = `${safeSlug}.png`;
        const publicPath = path.join(publicDir, targetName);
        const distPath = path.join(distDir, targetName);

        // Guarda el buffer del archivo subido en public
        fs.writeFileSync(publicPath, req.file.buffer);

        // Y si existe dist, lo copiamos para no tener que hacer 'npm run build'
        if (fs.existsSync(path.join(frontEndBase, "dist"))) {
            fs.copyFileSync(publicPath, distPath);
        }

        res.json({ ok: true, file: `/platform-logos/${targetName}`, safeSlug });
    } catch (e) {
        console.error("Upload error:", e);
        res.status(500).json({ error: e.message || "Error al subir logo" });
    }
});

module.exports = router;

