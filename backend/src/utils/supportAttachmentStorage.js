const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const EXTENSIONS = new Map([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"],
]);

function hasAllowedImageSignature(mime, buffer) {
    if (!Buffer.isBuffer(buffer)) return false;
    const normalizedMime = String(mime || "").toLowerCase();

    if (normalizedMime === "image/jpeg") {
        return buffer.length >= 3
            && buffer[0] === 0xff
            && buffer[1] === 0xd8
            && buffer[2] === 0xff;
    }
    if (normalizedMime === "image/png") {
        return buffer.length >= 8
            && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (normalizedMime === "image/webp") {
        return buffer.length >= 12
            && buffer.toString("ascii", 0, 4) === "RIFF"
            && buffer.toString("ascii", 8, 12) === "WEBP";
    }
    return false;
}

function getSupportUploadDir() {
    const configured = String(process.env.SUPPORT_UPLOAD_DIR || "").trim();
    return configured
        ? path.resolve(configured)
        : path.resolve(__dirname, "..", "..", "storage", "support");
}

async function saveSupportAttachment(file) {
    const extension = EXTENSIONS.get(String(file?.mimetype || "").toLowerCase());
    if (!extension || !hasAllowedImageSignature(file?.mimetype, file?.buffer)) {
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
    hasAllowedImageSignature,
    saveSupportAttachment,
    resolveSupportAttachment,
    removeSupportAttachment,
};
