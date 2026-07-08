const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const EXTENSIONS = new Map([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"],
]);

function getSupportUploadDir() {
    const configured = String(process.env.SUPPORT_UPLOAD_DIR || "").trim();
    return configured
        ? path.resolve(configured)
        : path.resolve(__dirname, "..", "..", "storage", "support");
}

async function saveSupportAttachment(file) {
    const extension = EXTENSIONS.get(String(file?.mimetype || "").toLowerCase());
    if (!extension || !Buffer.isBuffer(file?.buffer)) {
        throw new Error("La evidencia debe ser una imagen JPG, PNG o WEBP.");
    }

    const directory = getSupportUploadDir();
    await fs.mkdir(directory, { recursive: true });
    const storedName = `${crypto.randomUUID()}${extension}`;
    const absolutePath = path.join(directory, storedName);
    await fs.writeFile(absolutePath, file.buffer, { mode: 0o600 });
    return storedName;
}

function resolveSupportAttachment(storedName) {
    const safeName = path.basename(String(storedName || ""));
    if (!safeName || safeName !== storedName) {
        throw new Error("Archivo de soporte invalido.");
    }
    return path.join(getSupportUploadDir(), safeName);
}

async function removeSupportAttachment(storedName) {
    if (!storedName) return;
    try {
        await fs.unlink(resolveSupportAttachment(storedName));
    } catch (error) {
        if (error?.code !== "ENOENT") throw error;
    }
}

module.exports = {
    saveSupportAttachment,
    resolveSupportAttachment,
    removeSupportAttachment,
};
