const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
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

function sanitizeExtension(name, mimeType = "") {
    const ext = String(path.extname(name || "") || "").toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) return ext;
    if (mimeType.includes("png")) return ".png";
    if (mimeType.includes("webp")) return ".webp";
    if (mimeType.includes("gif")) return ".gif";
    return ".jpg";
}

function buildAdvertisingFileName(file) {
    const ext = sanitizeExtension(file.originalname, file.mimetype);
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const random = crypto.randomBytes(4).toString("hex").toUpperCase();
    return `PUB-${stamp}-${random}${ext}`;
}

function hashUpload(filePath) {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function cleanupTemp(file) {
    try { if (file?.path) fs.unlinkSync(file.path); } catch {}
}

function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page || "1", 10) || 1);
    const rawLimit = parseInt(query.limit || "10", 10) || 10;
    const limit = Math.min(50, Math.max(1, rawLimit));
    return { page, limit };
}

function paginate(items, query) {
    const { page, limit } = parsePagination(query);
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    return {
        data: items.slice(start, start + limit),
        pagination: { page: safePage, limit, total, totalPages },
    };
}

function sortImages(items) {
    return items.sort((a, b) => {
        const sortDiff = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
        if (sortDiff !== 0) return sortDiff;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
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

function driveErrorMessage(err, fallback, context) {
    if (typeof driveService.formatDriveError === "function") {
        return driveService.formatDriveError(err, context);
    }
    return fallback;
}

function driveErrorStatus(err) {
    const code = Number(err?.code || err?.response?.status || 0);
    if (code === 404) return 404;
    if (code === 403) return 403;
    if (code === 400) return 400;
    if (/no es valido|no existe|no fue compartida|no tiene permisos/i.test(err.message)) return 404;
    return 500;
}

async function getFolderMetaMap() {
    let rows = [];
    try {
        [rows] = await pool.query("SELECT folder_id, folder_name, is_active FROM advertising_folders");
    } catch {
        rows = [];
    }
    const map = new Map();
    rows.forEach((row) => {
        map.set(row.folder_id, {
            name: row.folder_name,
            isActive: Boolean(row.is_active),
        });
    });
    return map;
}

async function upsertFolderMeta(folderId, folderName, isActive = 1) {
    await pool.query(
        `INSERT INTO advertising_folders (folder_id, folder_name, is_active)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE folder_name = VALUES(folder_name), updated_at = CURRENT_TIMESTAMP`,
        [folderId, folderName, isActive ? 1 : 0]
    );
}

async function notifyUsersAdvertisingUpload(folderName, count) {
    if (!count) return;
    const message = `Nueva publicidad disponible en ${folderName}.`;
    await pool.query(
        `INSERT INTO user_notifications (user_id, message)
         SELECT id, ? FROM users WHERE COALESCE(role, 'user') <> 'admin'`,
        [message]
    );
}

router.use(requireAuth, requireRole("admin"));

router.get("/admin/advertising/folders", async (_req, res) => {
    try {
        const folders = await driveService.listFolders();
        const folderMeta = await getFolderMetaMap();
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
                name: folderMeta.get(folder.id)?.name || folder.name,
                createdTime: folder.createdTime,
                isActive: folderMeta.has(folder.id) ? folderMeta.get(folder.id).isActive : true,
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
        await upsertFolderMeta(folder.id, folder.name, 1);
        res.json({
            ok: true,
            data: {
                id: folder.id,
                name: folder.name,
                createdTime: folder.createdTime,
                isActive: true,
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
        await upsertFolderMeta(req.params.id, String(name).trim(), 1);
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

router.patch("/admin/advertising/folders/:id/toggle", async (req, res) => {
    try {
        const folderId = req.params.id;
        const folderName = String(req.body?.name || req.body?.folder_name || "Publicidad").trim();
        const [rows] = await pool.query("SELECT is_active FROM advertising_folders WHERE folder_id = ?", [folderId]);
        const newActive = rows.length ? (rows[0].is_active ? 0 : 1) : 0;

        await pool.query(
            `INSERT INTO advertising_folders (folder_id, folder_name, is_active)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE is_active = VALUES(is_active), folder_name = VALUES(folder_name), updated_at = CURRENT_TIMESTAMP`,
            [folderId, folderName, newActive]
        );

        res.json({ ok: true, is_active: Boolean(newActive) });
    } catch (err) {
        console.error("[admin/advertising/folders/toggle]", err.message);
        res.status(500).json({ ok: false, message: "Error actualizando carpeta." });
    }
});

router.delete("/admin/advertising/folders/:id", async (req, res) => {
    try {
        const folderId = req.params.id;
        await driveService.deleteFolder(folderId);
        await pool.query("DELETE FROM advertising_images WHERE folder_id = ?", [folderId]);
        await pool.query("DELETE FROM advertising_folders WHERE folder_id = ?", [folderId]);
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

        const images = sortImages(driveFiles.map((file) => {
            const dbMeta = dbMap[file.id] || {};
            return driveService.normalizeImage(file, dbMeta);
        }));
        const page = paginate(images, req.query);

        res.json({ ok: true, data: page.data, pagination: page.pagination });
    } catch (err) {
        console.error("[admin/advertising/images]", err.message);
        const status = driveErrorStatus(err);
        res.status(status).json({
            ok: false,
            message: driveErrorMessage(err, "Error listando imagenes.", req.params.folderId),
        });
    }
});

router.post("/admin/advertising/images/:folderId", upload.array("images", 20), async (req, res) => {
    try {
        const { folderId } = req.params;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ ok: false, message: "Selecciona al menos una imagen." });
        }

        const prepared = [];
        const duplicates = [];
        const seenHashes = new Set();
        const uploadMeta = new Map();

        for (const file of files) {
            const originalName = file.originalname;
            const fileHash = hashUpload(file.path);
            const [existing] = await pool.query(
                "SELECT id, file_name FROM advertising_images WHERE file_hash = ? LIMIT 1",
                [fileHash]
            );

            if (seenHashes.has(fileHash) || existing.length) {
                duplicates.push(originalName);
                cleanupTemp(file);
                continue;
            }

            seenHashes.add(fileHash);
            const generatedName = buildAdvertisingFileName(file);
            file.originalname = generatedName;
            uploadMeta.set(generatedName, { fileHash, originalName });
            prepared.push(file);
        }

        if (!prepared.length) {
            return res.status(400).json({
                ok: false,
                message: `No se subio ninguna imagen nueva. Duplicadas: ${duplicates.join(", ")}`,
            });
        }

        const { results: uploaded, errors } = await driveService.uploadImages(folderId, prepared);

        for (const file of uploaded) {
            const meta = uploadMeta.get(file.name) || {};
            await pool.query(
                `INSERT INTO advertising_images (folder_name, folder_id, file_name, file_id, file_hash, mime_type, web_view_link, thumbnail_link, image_size, sort_order, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    req.body.folder_name || "General",
                    folderId,
                    file.name,
                    file.id,
                    meta.fileHash || null,
                    file.mimeType,
                    file.webViewLink || null,
                    file.thumbnailLink || null,
                    file.size ? Number(file.size) : 0,
                    0,
                    1,
                ]
            );
        }
        await upsertFolderMeta(folderId, req.body.folder_name || "General", 1);
        await notifyUsersAdvertisingUpload(req.body.folder_name || "General", uploaded.length);

        const extra = duplicates.length ? ` ${duplicates.length} duplicada(s) omitida(s).` : "";
        const message = errors
            ? `${uploaded.length} subida(s), ${errors.length} error(es): ${errors.map(e => e.file).join(', ')}.${extra}`
            : `${uploaded.length} imagen(es) subida(s).${extra}`;

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
