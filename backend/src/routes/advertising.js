const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const pool = require("../db");
const driveService = require("../services/googleDriveService");

function normalizeImageRow(row) {
    return {
        id: row.id || null,
        fileId: row.file_id,
        name: row.file_name,
        mimeType: row.mime_type,
        webViewLink: row.web_view_link || null,
        thumbnailLink: row.thumbnail_link || null,
        previewLink: driveService.getPreviewLink(row.file_id),
        downloadLink: driveService.getDownloadLink(row.file_id),
        size: Number(row.image_size || 0),
        folderName: row.folder_name,
        folderId: row.folder_id,
        isActive: Boolean(row.is_active),
        sortOrder: Number(row.sort_order || 0),
        createdAt: row.created_at || null,
    };
}

async function getFolderMetaMap() {
    const [rows] = await pool.query(
        `SELECT folder_id, folder_name, file_id, file_name, mime_type, web_view_link, thumbnail_link, image_size,
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
            metaByFile.set(row.file_id, normalizeImageRow(row));
        }
    }

    return { metaByFolder, metaByFile };
}

async function getFolderImages(folderId, metaByFile) {
    const driveFiles = await driveService.listImagesInFolder(folderId);
    const merged = driveFiles
        .map((file) => {
            const dbMeta = metaByFile.get(file.id);
            return {
                id: dbMeta?.id || null,
                fileId: file.id,
                name: dbMeta?.name || file.name,
                mimeType: dbMeta?.mimeType || file.mimeType,
                webViewLink: dbMeta?.webViewLink || file.webViewLink || null,
                thumbnailLink: dbMeta?.thumbnailLink || file.thumbnailLink || null,
                previewLink: driveService.getPreviewLink(file.id),
                downloadLink: driveService.getDownloadLink(file.id),
                size: dbMeta?.size ?? Number(file.size || 0),
                folderName: dbMeta?.folderName || "",
                folderId,
                isActive: dbMeta ? Boolean(dbMeta.isActive) : true,
                sortOrder: dbMeta?.sortOrder ?? 0,
                createdAt: dbMeta?.createdAt || file.createdTime || null,
            };
        })
        .filter((item) => item.isActive)
        .sort((a, b) => {
            const sortDiff = a.sortOrder - b.sortOrder;
            if (sortDiff !== 0) return sortDiff;
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });

    return merged;
}

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
        res.status(500).json({ ok: false, message: "Error listando carpetas." });
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
        res.status(500).json({ ok: false, message: "Error listando imágenes." });
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
