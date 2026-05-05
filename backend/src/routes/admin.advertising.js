const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const pool = require("../db");
const driveService = require("../services/googleDriveService");

function sanitizeFilename(name) {
    let ext = "";
    const dot = name.lastIndexOf(".");
    if (dot > 0) {
        ext = name.slice(dot);
        name = name.slice(0, dot);
    }
    name = name
        .replace(/[/\\]/g, "_")
        .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s._-]/g, "")
        .replace(/\s+/g, "_")
        .slice(0, 200);
    return name + ext;
}

const TMP_DIR = path.join(__dirname, "..", "..", ".tmp-uploads");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({
    dest: TMP_DIR,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error("Solo imagenes JPEG, PNG, WEBP y GIF."));
        }
        cb(null, true);
    },
});

function driveErrorMessage(err, fallback) {
    if (typeof driveService.formatDriveError === "function") {
        return driveService.formatDriveError(err);
    }
    return fallback;
}

router.use(requireAuth, requireRole("admin"));

router.get("/admin/advertising/folders", async (_req, res) => {
    try {
        const folders = await driveService.listFolders();
        const [rows] = await pool.query(
            "SELECT folder_id, COUNT(*) as count FROM advertising_images WHERE is_active = 1 GROUP BY folder_id"
        );
        const countMap = {};
        rows.forEach((row) => {
            countMap[row.folder_id] = row.count;
        });

        res.json({
            ok: true,
            data: folders.map((folder) => ({
                id: folder.id,
                name: folder.name,
                createdTime: folder.createdTime,
                imageCount: countMap[folder.id] || 0,
            })),
        });
    } catch (err) {
        console.error("[admin/advertising/folders]", err.message);
        res.status(500).json({ ok: false, message: driveErrorMessage(err, "Error listando carpetas.") });
    }
});

router.post("/admin/advertising/folders", async (req, res) => {
    try {
        const { name } = req.body || {};
        if (!name || !String(name).trim()) {
            return res.status(400).json({ ok: false, message: "Nombre de carpeta requerido." });
        }

        const folder = await driveService.createFolder(String(name).trim());
        res.json({
            ok: true,
            data: {
                id: folder.id,
                name: folder.name,
                createdTime: folder.createdTime,
            },
        });
    } catch (err) {
        console.error("[admin/advertising/folders POST]", err.message);
        res.status(500).json({ ok: false, message: driveErrorMessage(err, "Error creando carpeta.") });
    }
});

router.put("/admin/advertising/folders/:id", async (req, res) => {
    try {
        const { name } = req.body || {};
        if (!name || !String(name).trim()) {
            return res.status(400).json({ ok: false, message: "Nombre requerido." });
        }

        const folder = await driveService.renameFolder(req.params.id, String(name).trim());
        await pool.query("UPDATE advertising_images SET folder_name = ? WHERE folder_id = ?", [
            String(name).trim(),
            req.params.id,
        ]);
        res.json({ ok: true, data: folder });
    } catch (err) {
        console.error("[admin/advertising/folders PUT]", err.message);
        res.status(500).json({ ok: false, message: driveErrorMessage(err, "Error renombrando carpeta.") });
    }
});

router.delete("/admin/advertising/folders/:id", async (req, res) => {
    try {
        const folderId = req.params.id;
        await driveService.deleteFolder(folderId);
        await pool.query("DELETE FROM advertising_images WHERE folder_id = ?", [folderId]);
        res.json({ ok: true, message: "Carpeta eliminada." });
    } catch (err) {
        console.error("[admin/advertising/folders DELETE]", err.message);
        res.status(500).json({ ok: false, message: driveErrorMessage(err, "Error eliminando carpeta.") });
    }
});

router.get("/admin/advertising/images/:folderId", async (req, res) => {
    try {
        const { folderId } = req.params;
        const driveFiles = await driveService.listImagesInFolder(folderId);
        const [dbRows] = await pool.query(
            "SELECT * FROM advertising_images WHERE folder_id = ? ORDER BY sort_order ASC, created_at DESC",
            [folderId]
        );

        const dbMap = {};
        dbRows.forEach((row) => {
            dbMap[row.file_id] = row;
        });

        const images = driveFiles.map((file) => {
            const dbMeta = dbMap[file.id] || {};
            return driveService.normalizeImage(file, dbMeta);
        });

        res.json({ ok: true, data: images });
    } catch (err) {
        console.error("[admin/advertising/images]", err.message);
        res.status(500).json({ ok: false, message: driveErrorMessage(err, "Error listando imagenes.") });
    }
});

router.post("/admin/advertising/images/:folderId", upload.array("images", 20), async (req, res) => {
    try {
        const { folderId } = req.params;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ ok: false, message: "Selecciona al menos una imagen." });
        }

        files.forEach((f) => { f.originalname = sanitizeFilename(f.originalname); });
        const { results: uploaded, errors } = await driveService.uploadImages(folderId, files);

        for (const file of uploaded) {
            await pool.query(
                `INSERT INTO advertising_images (folder_name, folder_id, file_name, file_id, mime_type, web_view_link, thumbnail_link, image_size, sort_order, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    req.body.folder_name || "General",
                    folderId,
                    file.name,
                    file.id,
                    file.mimeType,
                    file.webViewLink || null,
                    file.thumbnailLink || null,
                    file.size ? Number(file.size) : 0,
                    0,
                    1,
                ]
            );
        }

        const message = errors
            ? `${uploaded.length} subida(s), ${errors.length} error(es): ${errors.map(e => e.file).join(', ')}`
            : `${uploaded.length} imagen(es) subida(s).`;

        res.json({
            ok: true,
            data: uploaded,
            message,
        });
    } catch (err) {
        console.error("[admin/advertising/images POST]", err.message);
        res.status(500).json({ ok: false, message: driveErrorMessage(err, "Error subiendo imagenes.") });
    }
});

router.patch("/admin/advertising/images/:fileId/toggle", async (req, res) => {
    try {
        const { fileId } = req.params;
        const [rows] = await pool.query("SELECT id, is_active FROM advertising_images WHERE file_id = ?", [fileId]);
        if (!rows.length) {
            return res.status(404).json({ ok: false, message: "Imagen no encontrada." });
        }

        const newActive = rows[0].is_active ? 0 : 1;
        await pool.query("UPDATE advertising_images SET is_active = ? WHERE file_id = ?", [newActive, fileId]);
        res.json({ ok: true, is_active: Boolean(newActive) });
    } catch (err) {
        console.error("[admin/advertising/images/toggle]", err.message);
        res.status(500).json({ ok: false, message: "Error actualizando estado." });
    }
});

router.patch("/admin/advertising/images/:fileId/sort", async (req, res) => {
    try {
        const { fileId } = req.params;
        const { sort_order } = req.body || {};
        await pool.query("UPDATE advertising_images SET sort_order = ? WHERE file_id = ?", [sort_order, fileId]);
        res.json({ ok: true });
    } catch (err) {
        console.error("[admin/advertising/images/sort]", err.message);
        res.status(500).json({ ok: false, message: "Error actualizando orden." });
    }
});

router.delete("/admin/advertising/images/:fileId", async (req, res) => {
    try {
        const { fileId } = req.params;
        await driveService.deleteFile(fileId);
        await pool.query("DELETE FROM advertising_images WHERE file_id = ?", [fileId]);
        res.json({ ok: true, message: "Imagen eliminada." });
    } catch (err) {
        console.error("[admin/advertising/images DELETE]", err.message);
        res.status(500).json({ ok: false, message: driveErrorMessage(err, "Error eliminando imagen.") });
    }
});

module.exports = router;
