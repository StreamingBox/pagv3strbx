const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const requireAuth = require("../middleware/requireAuth");
const pool = require("../db");
const driveService = require("../services/googleDriveService");
const { isExplicitlyActive } = driveService;
const DOWNLOAD_TOKEN_EXPIRES_IN = "30m";

function signDownloadToken(fileId) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) return "";
    return jwt.sign(
        { scope: "advertising-download", fileId: String(fileId) },
        secret,
        { expiresIn: DOWNLOAD_TOKEN_EXPIRES_IN }
    );
}

function withDownloadToken(image) {
    const token = signDownloadToken(image.fileId);
    if (!token) return image;
    const separator = image.downloadLink.includes("?") ? "&" : "?";
    return {
        ...image,
        downloadLink: `${image.downloadLink}${separator}token=${encodeURIComponent(token)}`,
    };
}

function hasValidDownloadToken(req, fileId) {
    const token = String(req.query?.token || "").trim();
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!token || !secret) return false;

    try {
        const payload = jwt.verify(token, secret);
        return payload?.scope === "advertising-download" && String(payload?.fileId) === String(fileId);
    } catch {
        return false;
    }
}

function requireFileAccess(req, res, next) {
    if (hasValidDownloadToken(req, req.params.fileId)) {
        return next();
    }
    return requireAuth(req, res, next);
}

async function getFolderMetaMap() {
    const [rows] = await pool.query(
        `SELECT id, folder_id, folder_name, file_id, file_name, mime_type, web_view_link, thumbnail_link, image_size,
                is_active, sort_order, created_at
           FROM advertising_images`
    );
    let folderRows = [];
    try {
        [folderRows] = await pool.query(
            "SELECT folder_id, folder_name, is_active FROM advertising_folders"
        );
    } catch {
        folderRows = [];
    }

    const metaByFolder = new Map();
    const metaByFile = new Map();

    for (const row of folderRows) {
        if (row.folder_id) {
            metaByFolder.set(row.folder_id, {
                name: row.folder_name,
                isActive: isExplicitlyActive(row.is_active),
            });
        }
    }

    for (const row of rows) {
        if (row.folder_id && !metaByFolder.has(row.folder_id)) {
            metaByFolder.set(row.folder_id, {
                name: row.folder_name,
                isActive: true,
            });
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
        .map(withDownloadToken)
        .sort((a, b) => {
            const sortDiff = a.sortOrder - b.sortOrder;
            if (sortDiff !== 0) return sortDiff;
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });
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

router.get("/advertising/file/:fileId", requireFileAccess, async (req, res) => {
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
            const folderMeta = metaByFolder.get(folder.id);
            if (folderMeta && !folderMeta.isActive) continue;
            const images = await getFolderImages(folder.id, metaByFile);
            if (!images.length) continue;
            folders.push({
                id: folder.id,
                name: folderMeta?.name || folder.name,
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
        const { metaByFolder, metaByFile } = await getFolderMetaMap();
        const folderMeta = metaByFolder.get(folderId);
        if (folderMeta && !folderMeta.isActive) {
            return res.json({ ok: true, data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } });
        }
        const images = await getFolderImages(folderId, metaByFile);
        const page = paginate(images, req.query);
        res.json({ ok: true, data: page.data, pagination: page.pagination });
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
            const folderMeta = metaByFolder.get(folder.id);
            if (folderMeta && !folderMeta.isActive) continue;
            const images = await getFolderImages(folder.id, metaByFile);
            if (!images.length) continue;
            grouped.push({
                folderId: folder.id,
                folderName: folderMeta?.name || folder.name,
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
