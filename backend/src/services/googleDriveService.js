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

function formatDriveError(error) {
    const details = error?.response?.data?.error;
    const status = Number(error?.code || error?.response?.status || 500);
    const message = String(
        details?.message ||
        error?.message ||
        "Error desconocido de Google Drive."
    );

    if (status === 404) {
        return "La carpeta raiz de Drive no existe o no fue compartida con la service account.";
    }
    if (status === 403) {
        return "La service account no tiene permisos de Editor sobre la carpeta de Drive.";
    }
    if (/invalid_grant|invalid jwt|malformed/i.test(message)) {
        return "La private key o el email de la service account no son validos.";
    }
    if (/File not found/i.test(message)) {
        return "No se encontro la carpeta raiz indicada en GOOGLE_DRIVE_PARENT_FOLDER_ID.";
    }
    return `Google Drive: ${message}`;
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
 * Lista las imágenes dentro de una carpeta de Drive.
 */
async function listImagesInFolder(folderId) {
    const drive = getDrive();

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
    await makeFilePublic(res.data.id);
    return getFileInfo(res.data.id);
}

/**
 * Elimina un archivo de Drive por su ID.
 */
async function deleteFile(fileId) {
    const drive = getDrive();
    await drive.files.delete({ fileId, supportsAllDrives: true });
}

/**
 * Genera un enlace de descarga directa para un fileId de Drive.
 * Usa el webContentLink que permite descarga.
 */
function getDownloadLink(fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

function getPreviewLink(fileId) {
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
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
        } finally {
            // Limpiar archivo temporal
            try { fs.unlinkSync(file.path); } catch { }
        }
    }
    return results;
}

module.exports = {
    listFolders,
    listImagesInFolder,
    createFolder,
    deleteFolder,
    renameFolder,
    uploadImage,
    uploadImages,
    deleteFile,
    getDownloadLink,
    getPreviewLink,
    getFileInfo,
    formatDriveError,
};
