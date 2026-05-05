const { google } = require("googleapis");
const fs = require("fs");

/**
 * Servicio de Google Drive usando Service Account.
 * 
 * Variables de entorno requeridas:
 *   GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL  — email de la service account
 *   GOOGLE_DRIVE_PRIVATE_KEY           — private key (con \\n reales)
 *   GOOGLE_DRIVE_PARENT_FOLDER_ID      — ID de la carpeta raíz en Drive
 * 
 * La carpeta raíz debe estar compartida con el email de la service account
 * con permisos de Editor.
 */

function getAuth() {
    const email = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
    const key = (process.env.GOOGLE_DRIVE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

    if (!email || !key) {
        throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL y GOOGLE_DRIVE_PRIVATE_KEY son requeridos.");
    }

    const auth = new google.auth.JWT({
        email,
        key,
        scopes: ["https://www.googleapis.com/auth/drive"],
    });
    return auth;
}

function getDrive() {
    const auth = getAuth();
    return google.drive({ version: "v3", auth });
}

const PARENT_FOLDER_ID = () => process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID || "root";

function getDriveRequestDefaults() {
    return {
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
    };
}

function formatDriveError(error, context = "") {
    const details = error?.response?.data?.error;
    const status = Number(error?.code || error?.response?.status || 500);
    const message = String(
        details?.message ||
        error?.message ||
        "Error desconocido de Google Drive."
    );

    const ctxPrefix = context ? `[${context}] ` : "";

    if (/invalid_grant|invalid jwt|malformed/i.test(message)) {
        return `${ctxPrefix}La private key o el email de la service account no son validos.`;
    }
    if (status === 404 || /File not found|fileNotFound/i.test(message)) {
        if (context) {
            return `${ctxPrefix}La carpeta no existe, fue eliminada o no esta compartida con la service account.`;
        }
        return "La carpeta raiz de Drive no existe o no fue compartida con la service account.";
    }
    if (status === 403) {
        if (context) {
            return `${ctxPrefix}La service account no tiene permisos para acceder a esta carpeta.`;
        }
        return "La service account no tiene permisos de Editor sobre la carpeta de Drive.";
    }
    if (status === 400) {
        return `${ctxPrefix}El ID proporcionado no es valido para Google Drive.`;
    }
    return `${ctxPrefix}Google Drive: ${message}`;
}

/**
 * Lista las carpetas dentro de la carpeta raíz (un nivel).
 */
async function listFolders() {
    const drive = getDrive();
    const parentId = PARENT_FOLDER_ID();

    const res = await drive.files.list({
        ...getDriveRequestDefaults(),
        q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: "files(id, name, createdTime)",
        orderBy: "name",
    });
    return res.data.files || [];
}

async function makeFilePublic(fileId) {
    const drive = getDrive();
    try {
        await drive.permissions.create({
            fileId,
            supportsAllDrives: true,
            requestBody: {
                role: "reader",
                type: "anyone",
            },
        });
    } catch (error) {
        const message = String(error?.message || "");
        if (!message.includes("already exists")) {
            throw error;
        }
    }
}

/**
 * Verifica que una carpeta exista y sea accesible para la service account.
 * Lanza error descriptivo si no se puede acceder.
 */
async function verifyFolderAccess(folderId) {
    const drive = getDrive();
    try {
        await drive.files.get({
            fileId: folderId,
            supportsAllDrives: true,
            fields: "id, mimeType, trashed",
        });
    } catch (err) {
        const ctx = `carpeta ${folderId}`;
        throw new Error(formatDriveError(err, ctx));
    }
}

/**
 * Lista las imágenes dentro de una carpeta de Drive.
 * Verifica acceso a la carpeta antes de listar.
 */
async function listImagesInFolder(folderId) {
    const drive = getDrive();

    if (!folderId || typeof folderId !== "string" || folderId.length < 20) {
        throw new Error("El ID de carpeta no es valido.");
    }

    await verifyFolderAccess(folderId);

    const res = await drive.files.list({
        ...getDriveRequestDefaults(),
        q: `'${folderId}' in parents and mimeType contains 'image/' and trashed=false`,
        fields: "files(id, name, mimeType, webViewLink, thumbnailLink, size, createdTime)",
        orderBy: "name",
    });
    return res.data.files || [];
}

/**
 * Crea una carpeta dentro de la carpeta raíz de Drive.
 */
async function createFolder(folderName) {
    const drive = getDrive();
    const parentId = PARENT_FOLDER_ID();

    const res = await drive.files.create({
        supportsAllDrives: true,
        requestBody: {
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentId],
        },
        fields: "id, name, createdTime",
    });
    await makeFilePublic(res.data.id);
    return res.data;
}

/**
 * Elimina una carpeta y su contenido de Drive.
 */
async function deleteFolder(folderId) {
    const drive = getDrive();
    await drive.files.delete({ fileId: folderId, supportsAllDrives: true });
}

/**
 * Renombra una carpeta en Drive.
 */
async function renameFolder(folderId, newName) {
    const drive = getDrive();
    const res = await drive.files.update({
        fileId: folderId,
        supportsAllDrives: true,
        requestBody: { name: newName },
        fields: "id, name",
    });
    return res.data;
}

/**
 * Sube una imagen a una carpeta de Drive.
 * @param {string} folderId - ID de la carpeta destino
 * @param {string} filePath - Ruta local del archivo temporal
 * @param {string} originalName - Nombre original del archivo
 * @param {string} mimeType - Tipo MIME
 */
async function uploadImage(folderId, filePath, originalName, mimeType) {
    const drive = getDrive();
    let fileId = null;
    try {
        const res = await drive.files.create({
            supportsAllDrives: true,
            requestBody: {
                name: originalName,
                parents: [folderId],
            },
            media: {
                mimeType: mimeType || "image/jpeg",
                body: fs.createReadStream(filePath),
            },
            fields: "id, name, mimeType, webViewLink, thumbnailLink, size",
        });
        fileId = res.data.id;
        await makeFilePublic(fileId);
        return await getFileInfo(fileId);
    } catch (err) {
        if (fileId) {
            try { await drive.files.delete({ fileId, supportsAllDrives: true }); } catch {}
        }
        throw err;
    }
}

/**
 * Elimina un archivo de Drive por su ID.
 */
async function deleteFile(fileId) {
    const drive = getDrive();
    await drive.files.delete({ fileId, supportsAllDrives: true });
}

function getDownloadLink(fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

function getPreviewLink(fileId) {
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

function getThumbnailLink(fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
}

/**
 * Normaliza un archivo de Drive + metadata opcional de DB en un objeto
 * consistente con URLs seguras (sin autenticación) para thumbnail, preview y descarga.
 * Nunca expone webViewLink ni el thumbnailLink crudo de la API de Drive.
 */
function normalizeImage(file, dbMeta = null) {
    return {
        id: dbMeta?.id || null,
        fileId: file.id,
        name: dbMeta?.file_name || file.name,
        mimeType: dbMeta?.mime_type || file.mimeType,
        thumbnailLink: getThumbnailLink(file.id),
        previewLink: getPreviewLink(file.id),
        downloadLink: getDownloadLink(file.id),
        size: Number(file.size || 0),
        folderName: dbMeta?.folder_name || "",
        folderId: dbMeta?.folder_id || "",
        isActive: dbMeta ? Boolean(dbMeta.is_active) : true,
        sortOrder: Number(dbMeta?.sort_order || 0),
        createdAt: dbMeta?.created_at || file.createdTime || null,
    };
}

/**
 * Obtiene el webViewLink de un archivo.
 */
async function getFileInfo(fileId) {
    const drive = getDrive();
    const res = await drive.files.get({
        fileId,
        supportsAllDrives: true,
        fields: "id, name, mimeType, webViewLink, thumbnailLink, size, webContentLink",
    });
    return res.data;
}

/**
 * Sube varias imágenes a una carpeta desde un array de archivos (multer).
 */
async function uploadImages(folderId, files) {
    const results = [];
    const errors = [];
    for (const file of files) {
        try {
            const uploaded = await uploadImage(
                folderId,
                file.path,
                file.originalname,
                file.mimetype
            );
            results.push(uploaded);
        } catch (err) {
            console.error(`[GoogleDrive] Error subiendo ${file.originalname}:`, err.message);
            errors.push({ file: file.originalname, error: err.message });
        } finally {
            try { fs.unlinkSync(file.path); } catch {}
        }
    }
    if (errors.length > 0 && results.length === 0) {
        throw new Error(`No se pudo subir ninguna imagen: ${errors.map(e => e.file).join(', ')}`);
    }
    return { results, errors: errors.length ? errors : null };
}

module.exports = {
    listFolders,
    listImagesInFolder,
    verifyFolderAccess,
    createFolder,
    deleteFolder,
    renameFolder,
    uploadImage,
    uploadImages,
    deleteFile,
    getDownloadLink,
    getPreviewLink,
    getThumbnailLink,
    normalizeImage,
    getFileInfo,
    formatDriveError,
};
