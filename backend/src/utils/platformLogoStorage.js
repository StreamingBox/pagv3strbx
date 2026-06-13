const fs = require("fs");
const path = require("path");

function slugifyFilename(str) {
    return String(str)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function hasAllowedImageSignature(file) {
    const buf = file?.buffer;
    if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
    const mime = String(file.mimetype || "").toLowerCase();
    if (mime === "image/png") {
        return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    }
    if (mime === "image/jpeg") {
        return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    }
    if (mime === "image/webp") {
        return buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
    }
    return false;
}

function frontendBaseDir() {
    return process.env.FRONTEND_DIR
        ? path.resolve(process.env.FRONTEND_DIR)
        : path.join(__dirname, "../../../frontend");
}

function getPlatformLogoDirs() {
    const frontEndBase = frontendBaseDir();
    const publicDir = process.env.PLATFORM_LOGOS_PUBLIC_DIR
        ? path.resolve(process.env.PLATFORM_LOGOS_PUBLIC_DIR)
        : path.join(frontEndBase, "public/platform-logos");
    const distDir = process.env.PLATFORM_LOGOS_DIST_DIR
        ? path.resolve(process.env.PLATFORM_LOGOS_DIST_DIR)
        : path.join(frontEndBase, "dist/platform-logos");

    const dirs = [publicDir];
    const distBase = path.dirname(distDir);
    if (process.env.PLATFORM_LOGOS_DIST_DIR || fs.existsSync(distBase)) {
        dirs.push(distDir);
    }

    return [...new Set(dirs)];
}

function toStorageError(error) {
    const publicMessage = ["EACCES", "EPERM"].includes(error?.code)
        ? "El servidor no tiene permisos para publicar el logo. Ya quedo identificado para corregir permisos."
        : "No se pudo guardar el logo en el servidor.";
    const wrapped = new Error(publicMessage);
    wrapped.status = 500;
    wrapped.code = error?.code;
    wrapped.cause = error;
    return wrapped;
}

function savePlatformLogo({ slug, file }) {
    const safeSlug = slugifyFilename(slug);
    if (!safeSlug) {
        const err = new Error("Slug de plataforma invalido.");
        err.status = 400;
        throw err;
    }
    if (!file?.buffer) {
        const err = new Error("Falta archivo logo.");
        err.status = 400;
        throw err;
    }
    if (!hasAllowedImageSignature(file)) {
        const err = new Error("El archivo no coincide con un PNG, JPG o WEBP valido.");
        err.status = 400;
        throw err;
    }

    const targetName = `${safeSlug}.png`;
    const savedPaths = [];

    for (const dir of getPlatformLogoDirs()) {
        const targetPath = path.join(dir, targetName);
        try {
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(targetPath, file.buffer);
            savedPaths.push(targetPath);
        } catch (error) {
            throw toStorageError(error);
        }
    }

    return {
        file: `/platform-logos/${targetName}`,
        safeSlug,
        savedPaths,
    };
}

module.exports = {
    getPlatformLogoDirs,
    hasAllowedImageSignature,
    savePlatformLogo,
    slugifyFilename,
};
