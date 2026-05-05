const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const pool = require("../db");
const driveService = require("../services/googleDriveService");

// ─── Multer config (temp upload) ────────────────────────────
const TMP_DIR = path.join(__dirname, "..", "..", ".tmp-uploads");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({
    dest: TMP_DIR,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error("Solo imágenes JPEG, PNG, WEBP y GIF."));
        }
        cb(null, true);
    },
});

// ─── Middleware de auth ──────────────────────────────────────
router.use(requireAuth, requireRole("admin"));

// ─── GET /api/admin/advertising/folders ─────────────────────
// Lista carpetas desde Drive + DB
router.get("/admin/advertising/folders", async (req, res) => {
    try {
        const folders = await driveService.listFolders();
        // Obtener conteo de imágenes activas por carpeta desde DB
        const [rows] = await pool.query(
            "SELECT folder_id, COUNT(*) as count FROM advertising_images WHERE is_active = 1 GROUP BY folder_id"
        );
        const countMap = {};
        rows.forEach(r => { countMap[r.folder_id] = r.count; });

        const result = folders.map(f => ({
            id: f.id,
            name: f.name,
            createdTime: f.createdTime,
            imageCount: countMap[f.id] || 0,
        }));

        res.json({ ok: true, data: result });
    } catch (err) {
        console.error("[admin/advertising/folders]", err.message);
        res.status(500).json({ ok: false, message: "Error listando carpetas." });
    }
});

// ─── POST /api/admin/advertising/folders ────────────────────
router.post("/admin/advertising/folders", async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ ok: false, message: "Nombre de carpeta requerido." });
        }
        const folder = await driveService.createFolder(name.trim());
        res.json({ ok: true, data: { id: folder.id, name: folder.name, createdTime: folder.createdTime } });
    } catch (err) {
        console.error("[admin/advertising/folders POST]", err.message);
        res.status(500).json({ ok: false, message: "Error creando carpeta." });
    }
});

// ─── PUT /api/admin/advertising/folders/:id ─────────────────
router.put("/admin/advertising/folders/:id", async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ ok: false, message: "Nombre requerido." });
        }
        const folder = await driveService.renameFolder(req.params.id, name.trim());
        await pool.query("UPDATE advertising_images SET folder_name = ? WHERE folder_id = ?", [
            name.trim(),
            req.params.id,
        ]);
        res.json({ ok: true, data: folder });
    } catch (err) {
        console.error("[admin/advertising/folders PUT]", err.message);
        res.status(500).json({ ok: false, message: "Error renombrando carpeta." });
    }
});

// ─── DELETE /api/admin/advertising/folders/:id ──────────────
router.delete("/admin/advertising/folders/:id", async (req, res) => {
    try {
        const folderId = req.params.id;
        // Eliminar registros de DB
        await pool.query("DELETE FROM advertising_images WHERE folder_id = ?", [folderId]);
        // Eliminar carpeta de Drive
        await driveService.deleteFolder(folderId);
        res.json({ ok: true, message: "Carpeta eliminada." });
    } catch (err) {
        console.error("[admin/advertising/folders DELETE]", err.message);
        res.status(500).json({ ok: false, message: "Error eliminando carpeta." });
    }
});

// ─── GET /api/admin/advertising/images/:folderId ────────────
// Lista imágenes de una carpeta (desde Drive + DB metadata)
router.get("/admin/advertising/images/:folderId", async (req, res) => {
    try {
        const { folderId } = req.params;

        // Obtener imágenes desde Drive
        const driveFiles = await driveService.listImagesInFolder(folderId);

        // Obtener metadata desde DB
        const [dbRows] = await pool.query(
            "SELECT * FROM advertising_images WHERE folder_id = ? ORDER BY sort_order ASC, created_at DESC",
            [folderId]
        );
        const dbMap = {};
        dbRows.forEach(r => { dbMap[r.file_id] = r; });

        const images = driveFiles.map(f => {
            const dbMeta = dbMap[f.id] || {};
            return {
                id: f.id,
                fileId: f.id,
                name: f.name,
                mimeType: f.mimeType,
                webViewLink: f.webViewLink,
                thumbnailLink: f.thumbnailLink,
                previewLink: driveService.getPreviewLink(f.id),
                size: f.size,
                downloadLink: driveService.getDownloadLink(f.id),
                isActive: dbMeta.is_active !== undefined ? Boolean(dbMeta.is_active) : true,
                sortOrder: dbMeta.sort_order || 0,
                dbId: dbMeta.id || null,
            };
        });

        res.json({ ok: true, data: images });
    } catch (err) {
        console.error("[admin/advertising/images]", err.message);
        res.status(500).json({ ok: false, message: "Error listando imágenes." });
    }
});

// ─── POST /api/admin/advertising/images/:folderId ───────────
// Sube imágenes a una carpeta de Drive
router.post("/admin/advertising/images/:folderId", upload.array("images", 20), async (req, res) => {
    try {
        const { folderId } = req.params;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ ok: false, message: "Selecciona al menos una imagen." });
        }

        const uploaded = await driveService.uploadImages(folderId, files);

        // Guardar metadata en DB
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

        res.json({ ok: true, data: uploaded, message: `${uploaded.length} imagen(es) subida(s).` });
    } catch (err) {
        console.error("[admin/advertising/images POST]", err.message);
        res.status(500).json({ ok: false, message: "Error subiendo imágenes." });
    }
});

// ─── PATCH /api/admin/advertising/images/:fileId/toggle ─────
// Activa/desactiva una imagen
router.patch("/admin/advertising/images/:fileId/toggle", async (req, res) => {
    try {
        const { fileId } = req.params;
        const [rows] = await pool.query("SELECT id, is_active FROM advertising_images WHERE file_id = ?", [fileId]);
        if (rows.length === 0) {
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

// ─── PATCH /api/admin/advertising/images/:fileId/sort ───────
router.patch("/admin/advertising/images/:fileId/sort", async (req, res) => {
    try {
        const { fileId } = req.params;
        const { sort_order } = req.body;
        await pool.query("UPDATE advertising_images SET sort_order = ? WHERE file_id = ?", [sort_order, fileId]);
        res.json({ ok: true });
    } catch (err) {
        console.error("[admin/advertising/images/sort]", err.message);
        res.status(500).json({ ok: false, message: "Error actualizando orden." });
    }
});

// ─── DELETE /api/admin/advertising/images/:fileId ───────────
// Elimina imagen de Drive y DB
router.delete("/admin/advertising/images/:fileId", async (req, res) => {
    try {
        const { fileId } = req.params;
        await pool.query("DELETE FROM advertising_images WHERE file_id = ?", [fileId]);
        await driveService.deleteFile(fileId);
        res.json({ ok: true, message: "Imagen eliminada." });
    } catch (err) {
        console.error("[admin/advertising/images DELETE]", err.message);
        res.status(500).json({ ok: false, message: "Error eliminando imagen." });
    }
});

module.exports = router;
