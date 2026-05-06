const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const pool = require("../db");
const driveService = require("../services/googleDriveService");

async function getFolderMetaMap() {
    const [rows] = await pool.query(
        `SELECT id, folder_id, folder_name, file_id, file_name, mime_type, web_view_link, thumbnail_link, image_size,
                is_active, sort_order, created_at
           FROM advertising_images`
    );

    const metaByFolder = new Map();
    const metaByFile = new Map();

    for (const row of rows) {
        if (row.folder_id && !metaByFolder.has(row.folder_id)) {
            metaByFolder.set(row.folder_id, row.folder_name);
        }
        if (row.file_id) {
            metaByFile.set(row.file_id, row);
        }
    }

    return { metaByFolder, metaByFile };
}

async function getFolderImages(folderId, metaByFile) {
    const driveFiles = await driveService.listImagesInFolder(folderId);
    return driveFiles
        .map((file) => driveService.normalizeImage(file, metaByFile.get(file.id)))
        .filter((item) => item.isActive)
        .sort((a, b) => {
            const sortDiff = a.sortOrder - b.sortOrder;
            if (sortDiff !== 0) return sortDiff;
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });
}

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

router.get("/advertising/file/:fileId", requireAuth, async (req, res) => {
    try {
        const { fileId } = req.params;
        const { meta, stream } = await driveService.getFileStream(fileId);
        const isDownload = String(req.query.download || "").trim() === "1";
        res.setHeader("Content-Type", meta?.mimeType || "application/octet-stream");
        res.setHeader(
            "Content-Disposition",
            `${isDownload ? "attachment" : "inline"}; filename="${encodeURIComponent(meta?.name || fileId)}"`
        );
        stream.on("error", (err) => {
            console.error("[advertising/file stream]", err.message);
            if (!res.headersSent) {
                res.status(500).end("Error leyendo archivo.");
            } else {
                res.end();
            }
        });
        stream.pipe(res);
    } catch (err) {
        console.error("[advertising/file]", err.message);
        const status = driveErrorStatus(err);
        res.status(status).json({
            ok: false,
            message: driveErrorMessage(err, "No se pudo leer el archivo.", req.params.fileId),
        });
    }
});

router.get("/advertising/folders", requireAuth, async (_req, res) => {
    try {
        const driveFolders = await driveService.listFolders();
        const { metaByFolder, metaByFile } = await getFolderMetaMap();

        const folders = [];
        for (const folder of driveFolders) {
            const images = await getFolderImages(folder.id, metaByFile);
            if (!images.length) continue;
            folders.push({
                id: folder.id,
                name: metaByFolder.get(folder.id) || folder.name,
                imageCount: images.length,
                createdTime: folder.createdTime || null,
            });
        }

        folders.sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
        res.json({ ok: true, data: folders });
    } catch (err) {
        console.error("[advertising/folders]", err.message);
        const status = driveErrorStatus(err);
        res.status(status).json({ ok: false, message: driveErrorMessage(err, "Error listando carpetas.") });
    }
});

router.get("/advertising/images/:folderId", requireAuth, async (req, res) => {
    try {
        const { folderId } = req.params;
        const { metaByFile } = await getFolderMetaMap();
        const images = await getFolderImages(folderId, metaByFile);
        res.json({ ok: true, data: images });
    } catch (err) {
        console.error("[advertising/images]", err.message);
        const status = driveErrorStatus(err);
        res.status(status).json({
            ok: false,
            message: driveErrorMessage(err, "Error listando imágenes.", req.params.folderId),
        });
    }
});

router.get("/advertising/all", requireAuth, async (_req, res) => {
    try {
        const driveFolders = await driveService.listFolders();
        const { metaByFolder, metaByFile } = await getFolderMetaMap();
        const grouped = [];

        for (const folder of driveFolders) {
            const images = await getFolderImages(folder.id, metaByFile);
            if (!images.length) continue;
            grouped.push({
                folderId: folder.id,
                folderName: metaByFolder.get(folder.id) || folder.name,
                images,
            });
        }

        grouped.sort((a, b) => String(a.folderName).localeCompare(String(b.folderName), "es"));
        res.json({ ok: true, data: grouped });
    } catch (err) {
        console.error("[advertising/all]", err.message);
        res.status(500).json({ ok: false, message: "Error cargando publicidad." });
    }
});

module.exports = router;
